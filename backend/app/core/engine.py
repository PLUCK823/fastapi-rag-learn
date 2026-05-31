"""RAG 引擎 — 检索 + LLM 生成，按知识库隔离向量库"""

from __future__ import annotations

import logging
import re
import subprocess
import sys
import traceback
from collections.abc import Iterator
from typing import TYPE_CHECKING

from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_openai import ChatOpenAI

if TYPE_CHECKING:
    from sentence_transformers import CrossEncoder

from app.core.config import (
    CHROMA_DIR,
    EMBEDDING_MODEL,
    LLM_MODEL,
    OPENAI_BASE_URL,
    RERANKER_CANDIDATE_K,
    RERANKER_MODEL,
    RERANKER_TOP_K,
    RETRIEVAL_K,
)
from app.models.schemas import SourceInfo

logger = logging.getLogger(__name__)

# 匹配 Python 代码块
_PYTHON_BLOCK_RE = re.compile(r"```python\s*\n(.*?)```", re.DOTALL)

# 延迟加载 jieba（首次调用才初始化，避免拖慢启动）
_jieba_loaded = False


def _init_jieba() -> None:
    global _jieba_loaded
    if _jieba_loaded:
        return
    import jieba

    jieba.setLogLevel(logging.WARNING)
    jieba.initialize()
    _jieba_loaded = True

_initialized = False
_embeddings: HuggingFaceEmbeddings | None = None
_llm: ChatOpenAI | None = None
_reranker: CrossEncoder | None = None


def _init_shared() -> None:
    global _initialized, _embeddings, _llm
    if _initialized:
        return
    _embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)
    _llm = ChatOpenAI(
        model=LLM_MODEL,
        temperature=0.7,
        base_url=OPENAI_BASE_URL,
        frequency_penalty=0.5,
        streaming=True,
    )
    _initialized = True


def _get_reranker() -> CrossEncoder:
    """懒加载 reranker 单例，避免拖慢首次 /ask 响应"""
    global _reranker
    if _reranker is not None:
        return _reranker
    from sentence_transformers import CrossEncoder

    logger.info("Loading reranker model: %s", RERANKER_MODEL)
    _reranker = CrossEncoder(RERANKER_MODEL)
    return _reranker


def _rerank(query: str, docs: list[Document], top_k: int) -> list[Document]:
    """Cross-encoder 精排：对候选 doc 列表按与 query 的相关性重新排序"""
    if not docs or top_k >= len(docs):
        return docs
    reranker = _get_reranker()
    pairs = [(query, d.page_content) for d in docs]
    scores = reranker.predict(pairs)  # type: ignore[arg-type]
    # 按分数降序排列
    ranked = sorted(zip(docs, scores), key=lambda x: x[1], reverse=True)
    return [d for d, _ in ranked[:top_k]]


def _get_kb_vectorstore(kb_id: int) -> Chroma:
    _init_shared()
    assert _embeddings is not None
    collection_name = f"kb_{kb_id}"
    return Chroma(
        embedding_function=_embeddings,
        persist_directory=str(CHROMA_DIR),
        collection_name=collection_name,
    )


def get_vectorstore(kb_id: int) -> Chroma:
    return _get_kb_vectorstore(kb_id)


def delete_collection(kb_id: int) -> None:
    """删除整个知识库的向量集合（不可逆）"""
    vs = _get_kb_vectorstore(kb_id)
    try:
        vs.delete_collection()
        logger.info("Deleted ChromaDB collection for kb_id=%d", kb_id)
    except AttributeError:
        # Some versions of langchain_chroma don't have delete_collection
        # Fall back to native ChromaDB client
        try:
            vs._collection.delete()
            logger.info("Deleted ChromaDB collection (native) for kb_id=%d", kb_id)
        except Exception as e:
            logger.warning("Failed to delete collection for kb_id=%d: %s", kb_id, e)
    except Exception as e:
        logger.warning("Failed to delete collection for kb_id=%d: %s", kb_id, e)


def delete_document_chunks(kb_id: int, document_id: int) -> int:
    """删除文档的所有向量分块，返回删除前分块数。失败时抛出异常。"""
    vs = _get_kb_vectorstore(kb_id)
    before = len(vs.get(where={"document_id": document_id})["ids"])
    if before == 0:
        logger.info("No chunks to delete for kb_id=%d doc_id=%d", kb_id, document_id)
        return 0

    try:
        vs.delete(where={"document_id": document_id})
    except Exception as e:
        # LangChain wrapper delete failed — try native ChromaDB client
        logger.warning(
            "LangChain delete failed for kb_id=%d doc_id=%d (%s), trying native client",
            kb_id, document_id, e,
        )
        try:
            vs._collection.delete(where={"document_id": document_id})
        except Exception as e2:
            raise RuntimeError(
                f"Failed to delete chunks for doc_id={document_id} in kb_id={kb_id}: {e2}"
            ) from e2

    # Verify deletion
    after = len(vs.get(where={"document_id": document_id})["ids"])
    if after > 0:
        raise RuntimeError(
            f"Deletion incomplete: {after} chunks remain for doc_id={document_id} in kb_id={kb_id}"
        )

    logger.info(
        "Deleted %d chunks for kb_id=%d doc_id=%d", before, kb_id, document_id,
    )
    return before


def _extract_keywords(question: str) -> list[str]:
    """从问题中提取有意义的关键词，支持中文分词 + 英文空格分词"""
    import jieba

    _init_jieba()

    # 移除标点，保留中英文、数字
    cleaned = re.sub(r"[^一-鿿\w]", " ", question)

    # jieba 中文分词
    words: list[str] = []
    for seg in jieba.cut(cleaned):
        w = seg.strip()
        if len(w) >= 2:
            words.append(w)

    # 同时保留空格分出的英文/数字词（补充 jieba 可能漏掉的）
    space_words = [w.strip() for w in cleaned.split() if len(w.strip()) >= 2]
    for sw in space_words:
        if sw not in words:
            words.append(sw)

    # 去重，保持顺序
    seen: set[str] = set()
    result: list[str] = []
    for w in words:
        wl = w.lower()
        if wl not in seen:
            seen.add(wl)
            result.append(w)

    return result


def _best_snippet(text: str, keywords: list[str], max_len: int = 200) -> str:
    """找到文本中最匹配关键词的片段作为摘要，而非简单截取前 N 个字符"""
    if not keywords or not text:
        return text[:max_len]

    text_lower = text.lower()
    best_start = 0
    best_score = 0

    # 滑动窗口：找包含最多 keyword 的窗口
    for i in range(0, len(text), 20):
        window_end = min(i + max_len, len(text))
        window = text_lower[i:window_end]
        score = sum(1 for kw in keywords if kw.lower() in window)
        if score > best_score:
            best_score = score
            best_start = i

    # 避免截断单词
    start = max(0, best_start - 20)
    while start > 0 and text[start - 1] not in (" ", "\n"):
        start -= 1

    snippet = text[start : start + max_len]
    return (snippet[:max_len] + "…").strip() if len(snippet) > max_len else snippet.strip()


def extract_sources(docs: list[Document], question: str = "") -> list[SourceInfo]:
    seen: set[int] = set()
    sources: list[SourceInfo] = []
    keywords = _extract_keywords(question) if question else []
    for idx, d in enumerate(docs, start=1):
        doc_id = d.metadata.get("document_id") if d.metadata else None
        if doc_id and doc_id not in seen:
            seen.add(doc_id)
            snippet = _best_snippet(d.page_content, keywords)
            sources.append(SourceInfo(
                index=idx,
                document_id=int(doc_id),
                document_name=str(d.metadata.get("document_name", "") if d.metadata else ""),
                snippet=snippet,
            ))
    return sources


# ── Python 代码执行 ──

def _execute_python(code: str) -> str:
    """安全地执行 Python 代码，返回 stdout 输出或错误信息"""
    try:
        result = subprocess.run(
            [sys.executable, "-c", code],
            capture_output=True,
            text=True,
            timeout=10,
            env={**__import__("os").environ, "PYTHONIOENCODING": "utf-8"},
        )
        if result.returncode == 0:
            out = result.stdout.strip()
            return out if out else "(执行完毕，无输出)"
        err = result.stderr.strip()
        return f"执行错误: {err}" if err else f"退出码: {result.returncode}"
    except subprocess.TimeoutExpired:
        return "执行超时（超过 10 秒），请简化运算"
    except Exception:
        return f"执行失败: {traceback.format_exc(limit=1)}"


def _execute_code_blocks(text: str) -> str:
    """查找并执行文本中的所有 Python 代码块，将结果追回文本末尾"""
    matches = list(_PYTHON_BLOCK_RE.finditer(text))
    if not matches:
        return text

    results: list[str] = []
    for i, m in enumerate(matches, start=1):
        code = m.group(1).strip()
        if not code:
            continue
        logger.info("Executing Python block %d (%d chars)", i, len(code))
        results.append(f"**运算结果 {i}:**\n```\n{_execute_python(code)}\n```")

    if results:
        text += "\n\n---\n" + "\n\n".join(results)
    return text


# ── 检索 ──

def _keyword_search(
    question: str, kb_id: int, exclude_ids: set[str], k: int = 3
) -> list[Document]:
    """BM25 关键词检索：TF-IDF 评分，远优于简单关键词计数"""
    from rank_bm25 import BM25Okapi

    vs = _get_kb_vectorstore(kb_id)
    keywords = _extract_keywords(question)
    if not keywords:
        return []

    try:
        raw = vs._collection.get(include=["documents", "metadatas"])
    except Exception:
        return []

    ids = raw.get("ids", []) or []
    docs_raw = raw.get("documents", []) or []
    metadatas = raw.get("metadatas", []) or []

    # 构建 BM25 语料库
    corpus: list[list[str]] = []
    index_map: list[int] = []  # corpus_idx → original_idx
    for i, chunk_id in enumerate(ids):
        if chunk_id in exclude_ids:
            continue
        text = docs_raw[i] if isinstance(docs_raw[i], str) else ""
        if not text.strip():
            continue
        # jieba 分词
        tokens = _extract_keywords(text)
        if not tokens:
            continue
        corpus.append(tokens)
        index_map.append(i)

    if not corpus:
        return []

    # BM25 检索
    bm25 = BM25Okapi(corpus)
    scores = bm25.get_scores(keywords)

    # 取 top-k
    ranked = sorted(
        [(scores[j], index_map[j]) for j in range(len(scores))],
        key=lambda x: x[0],
        reverse=True,
    )

    result: list[Document] = []
    for score, orig_idx in ranked:
        if score <= 0:
            continue
        meta = metadatas[orig_idx] if orig_idx < len(metadatas) else {}
        result.append(Document(
            id=ids[orig_idx],
            page_content=docs_raw[orig_idx] if isinstance(docs_raw[orig_idx], str) else "",
            metadata=meta or {},
        ))
        if len(result) >= k:
            break

    return result


def _retrieve_context(
    question: str,
    kb_id: int,
    history: list[tuple[str, str]] | None = None,
) -> tuple[str, list[Document]]:
    """混合检索（向量 + BM25）+ RRF 融合 + Cross-encoder 精排 → prompt"""
    vectorstore = _get_kb_vectorstore(kb_id)
    retriever = vectorstore.as_retriever(search_kwargs={"k": RETRIEVAL_K})
    vec_docs: list[Document] = retriever.invoke(question)

    # BM25 关键词检索
    seen_ids = {d.id for d in vec_docs if d.id}
    kw_docs = _keyword_search(question, kb_id, seen_ids, k=RETRIEVAL_K)

    # RRF (Reciprocal Rank Fusion) 合并两个排序列表
    rrf_k = 60
    scores: dict[str, float] = {}
    id_to_doc: dict[str, Document] = {}

    for rank, d in enumerate(vec_docs):
        doc_id = d.id or f"vec_{rank}"
        scores[doc_id] = scores.get(doc_id, 0) + 1.0 / (rrf_k + rank + 1)
        id_to_doc[doc_id] = d

    for rank, d in enumerate(kw_docs):
        doc_id = d.id or f"kw_{rank}"
        scores[doc_id] = scores.get(doc_id, 0) + 1.0 / (rrf_k + rank + 1)
        id_to_doc[doc_id] = d

    # RRF 排序 → 取候选（比最终需要的多，留给 reranker 精排）
    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    candidates = [id_to_doc[doc_id] for doc_id, _ in ranked[:RERANKER_CANDIDATE_K]]

    # Cross-encoder 精排 → 取 top-k
    docs = _rerank(question, candidates, RERANKER_TOP_K)

    parts: list[str] = []
    for i, d in enumerate(docs, start=1):
        name = d.metadata.get("document_name", "unknown") if d.metadata else "unknown"
        parts.append(f"来源{i}({name}): {d.page_content}")
    docs_text = "\n".join(parts)

    # 多轮对话历史
    history_block = ""
    if history:
        lines = [f"{role}: {content}" for role, content in history]
        history_block = "对话历史:\n" + "\n".join(lines) + "\n\n"

    prompt = f"""{history_block}你是精确的 RAG 问答助手。严格依据资料回答。

要求:
1. 涉及数值、统计、计算时，先列出资料中相关数据，再逐步推算。
2. 涉及加减乘除等运算时，用 ```python 代码块写出计算过程。
3. 表格数据要逐行分析，不要遗漏。
4. 资料没有的信息就说不知道，不要编造。

资料:
{docs_text}

问题: {question}

答案:"""
    return prompt, docs


def ask(
    question: str,
    kb_id: int,
    history: list[tuple[str, str]] | None = None,
) -> tuple[str, list[SourceInfo]]:
    """非流式 RAG 问答（支持多轮对话历史）"""
    _init_shared()
    assert _llm is not None

    prompt, docs = _retrieve_context(question, kb_id, history)
    response = _llm.invoke(prompt)
    answer = _execute_code_blocks(str(response.content))
    sources = extract_sources(docs, question)
    return answer, sources


# ── 文档内容 ──

def get_document_content(kb_id: int, document_id: int) -> str:
    vs = _get_kb_vectorstore(kb_id)
    raw = vs._collection.get(where={"document_id": document_id})
    if not raw["documents"]:
        return ""
    metadatas: list = raw["metadatas"] or []
    pairs = sorted(
        zip(metadatas, raw["documents"]),
        key=lambda x: int(x[0].get("chunk_index", 0)) if x[0] else 0,
    )
    return "\n\n".join(p[1] for p in pairs)


# ── 流式问答 ──

def ask_stream(
    question: str,
    kb_id: int,
    history: list[tuple[str, str]] | None = None,
) -> Iterator[str]:
    """真正的 LLM token 级流式输出，每个 chunk 是一个 token（支持多轮对话历史）"""
    _init_shared()
    assert _llm is not None

    prompt, _docs = _retrieve_context(question, kb_id, history)
    for chunk in _llm.stream(prompt):
        c = chunk.content
        if isinstance(c, str) and c:
            yield c


def ask_stream_with_sources(
    question: str,
    kb_id: int,
    history: list[tuple[str, str]] | None = None,
) -> tuple[Iterator[str], list[SourceInfo]]:
    """流式输出 + 来源信息，一次检索供两用（支持多轮对话历史）"""
    _init_shared()
    assert _llm is not None

    prompt, docs = _retrieve_context(question, kb_id, history)
    sources = extract_sources(docs, question)

    def _stream() -> Iterator[str]:
        for chunk in _llm.stream(prompt):
            c = chunk.content
            if isinstance(c, str) and c:
                yield c

    return _stream(), sources
