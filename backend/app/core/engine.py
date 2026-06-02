"""RAG 引擎 — 检索 + LLM 生成，按知识库隔离向量库"""

from __future__ import annotations

import logging
import os
import re
import subprocess
import sys
import time as _time
import traceback
from collections.abc import Iterator
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_openai import ChatOpenAI
from langchain_qdrant import Qdrant
from qdrant_client import QdrantClient, models

if TYPE_CHECKING:
    from sentence_transformers import CrossEncoder

from app.core.config import (
    EMBEDDING_MODEL,
    LLM_MODEL,
    OPENAI_BASE_URL,
    QDRANT_URL,
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


def _test_mode_enabled() -> bool:
    return os.getenv("RAG_TEST_MODE") == "1"


class _FakeEmbeddings:
    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [[0.0] * 1024 for _ in texts]

    def embed_query(self, text: str) -> list[float]:
        return [0.0] * 1024


@dataclass
class _FakeChunk:
    content: str


class _FakeLLM:
    def invoke(self, prompt: str):
        class _Response:
            content: str

        response = _Response()
        response.content = _fake_answer(prompt)
        return response

    def stream(self, prompt: str) -> Iterator[_FakeChunk]:
        for char in _fake_answer(prompt):
            yield _FakeChunk(content=char)


@dataclass
class _FakePoint:
    id: int | str
    payload: dict[str, Any]


class _FakeRetriever:
    def __init__(self, vectorstore: _FakeVectorStore):
        self.vectorstore = vectorstore

    def invoke(self, query: str) -> list[Document]:
        del query
        return self.vectorstore.documents()


class _FakeQdrantClient:
    def __init__(self):
        self.collections: dict[str, dict[int | str, _FakePoint]] = {}

    def collection_exists(self, collection_name: str) -> bool:
        return collection_name in self.collections

    def create_collection(self, collection_name: str, **kwargs) -> None:
        self.collections.setdefault(collection_name, {})

    def delete_collection(self, collection_name: str) -> None:
        self.collections.pop(collection_name, None)

    def count(self, collection_name: str, count_filter=None, **kwargs):
        class _Count:
            count: int

        result = _Count()
        result.count = len(self._filtered_points(collection_name, count_filter))
        return result

    def scroll(
        self,
        collection_name: str,
        limit: int = 1000,
        offset: int | str | None = None,
        scroll_filter=None,
        with_payload: bool = True,
        with_vectors: bool = False,
        **kwargs,
    ):
        del with_vectors
        points = self._filtered_points(collection_name, scroll_filter)
        start = int(offset) if offset is not None else 0
        page = points[start : start + limit]
        next_offset = start + limit if start + limit < len(points) else None
        if not with_payload:
            page = [_FakePoint(id=point.id, payload={}) for point in page]
        return page, next_offset

    def delete(self, collection_name: str, points_selector=None, **kwargs) -> None:
        collection = self.collections.setdefault(collection_name, {})
        if isinstance(points_selector, models.PointIdsList):
            for point_id in points_selector.points:
                collection.pop(point_id, None)
            return
        if isinstance(points_selector, models.FilterSelector):
            for point in self._filtered_points(collection_name, points_selector.filter):
                collection.pop(point.id, None)

    def upsert_documents(
        self,
        collection_name: str,
        docs: list[Document],
        ids: list[int | str],
    ) -> None:
        collection = self.collections.setdefault(collection_name, {})
        for doc_id, doc in zip(ids, docs):
            collection[doc_id] = _FakePoint(
                id=doc_id,
                payload={"page_content": doc.page_content, "metadata": doc.metadata},
            )

    def _filtered_points(self, collection_name: str, qdrant_filter) -> list[_FakePoint]:
        points = list(self.collections.setdefault(collection_name, {}).values())
        document_id = self._document_id_from_filter(qdrant_filter)
        if document_id is not None:
            points = [
                point
                for point in points
                if point.payload.get("metadata", {}).get("document_id") == document_id
            ]
        return sorted(points, key=lambda point: str(point.id))

    @staticmethod
    def _document_id_from_filter(qdrant_filter) -> int | None:
        conditions = getattr(qdrant_filter, "must", None) or []
        for condition in conditions:
            if getattr(condition, "key", None) != "metadata.document_id":
                continue
            match = getattr(condition, "match", None)
            value = getattr(match, "value", None)
            return int(value) if value is not None else None
        return None


class _FakeVectorStore:
    def __init__(self, client: _FakeQdrantClient, kb_id: int):
        self.client = client
        self.collection_name = _collection_name(kb_id)
        self.client.create_collection(self.collection_name)

    def as_retriever(self, **kwargs):
        return _FakeRetriever(self)

    def add_documents(self, docs: list[Document], **kwargs):
        ids = kwargs.get("ids") or [f"pt_{i}" for i in range(len(docs))]
        self.client.upsert_documents(self.collection_name, docs, ids)
        return ids

    def documents(self) -> list[Document]:
        points, _ = self.client.scroll(self.collection_name, limit=1000)
        return [
            Document(
                id=str(point.id),
                page_content=point.payload.get("page_content", ""),
                metadata=point.payload.get("metadata", {}),
            )
            for point in points
        ]


_fake_qdrant_client = _FakeQdrantClient()


def _fake_answer(prompt: str) -> str:
    """返回与 prompt 内容匹配的伪造答案，支持 E2E 测试的所有问题类型。

    检查顺序：具体关键词优先于通用关键词，确保精确匹配。
    """
    # ── 办公规范文档相关（上传 /tmp/办公规范.md） ──
    has_oa = any(term in prompt for term in ["考勤补卡", "补卡次数", "办公规范"])
    has_procurement = any(term in prompt for term in ["采购", "总经理终审"])

    # 同时问补卡+采购（rag-accuracy / ui-demo 测试）
    if has_oa and has_procurement:
        return (
            "根据《智能办公系统使用规范》，员工每月考勤补卡最多允许 **3 次**，"
            "超出次数不予受理补卡，直接按照考勤异常统计。"
            "大额采购方面，单笔金额超过 **5000 元** 的采购需要提交至总经理终审。"
        )

    # 只问补卡次数（streaming / trace-streaming 测试）
    if has_oa:
        return (
            "根据《智能办公系统使用规范与功能说明》，员工每月允许补卡次数最多为 **3 次**，"
            "超出次数不予受理补卡，直接按照考勤异常统计。"
        )

    # 只问采购（预留）
    if has_procurement:
        return (
            "根据公司规范，单笔金额超过 **5000 元** 的采购、"
            "正式合同还需提交至总经理终审。"
        )

    # ── Python 知识库相关 ──
    if "Python" in prompt and any(
        term in prompt for term in ["编程语言", "Web 开发", "适合"]
    ):
        return "Python 是一门编程语言，广泛用于 Web 开发、数据分析、人工智能等领域。"

    # ── 通用问题 ──
    if any(word in prompt for word in ["这是什么", "测试文档", "总结"]):
        return "这是一份测试文档，包含了相关的规范说明和业务数据。"

    # ── 有文档内容时给出合理响应 ──
    if "来源" in prompt and "资料" in prompt:
        return "根据提供的资料，相关内容已涵盖所需信息。"

    # ── 兜底 ──
    return "资料中没有足够信息回答这个问题。"


def _init_shared() -> None:
    global _initialized, _embeddings, _llm
    if _initialized:
        return
    if _test_mode_enabled():
        _embeddings = _FakeEmbeddings()  # type: ignore[assignment]
        _llm = _FakeLLM()  # type: ignore[assignment]
        _initialized = True
        return
    _embeddings = HuggingFaceEmbeddings(
        model_name=EMBEDDING_MODEL,
        model_kwargs={"local_files_only": True},
    )
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
    if _test_mode_enabled():
        return docs[:top_k]
    if not docs or top_k >= len(docs):
        return docs
    reranker = _get_reranker()
    pairs = [(query, d.page_content) for d in docs]
    scores = reranker.predict(pairs)  # type: ignore[arg-type]
    # 按分数降序排列
    ranked = sorted(zip(docs, scores), key=lambda x: x[1], reverse=True)
    return [d for d, _ in ranked[:top_k]]


# ── Qdrant 客户端（模块级复用，避免每次创建新连接） ──

_qdrant_client: QdrantClient | None = None


def _get_qdrant_client() -> QdrantClient:
    if _test_mode_enabled():
        return _fake_qdrant_client  # type: ignore[return-value]
    global _qdrant_client
    if _qdrant_client is None:
        # gRPC 连接（跨版本兼容性好于 REST）
        _qdrant_client = QdrantClient(
            url=QDRANT_URL, prefer_grpc=True, timeout=30, check_compatibility=False
        )
    return _qdrant_client


def _collection_name(kb_id: int) -> str:
    return f"kb_{kb_id}"


def _get_kb_vectorstore(kb_id: int) -> Qdrant:
    if _test_mode_enabled():
        return _FakeVectorStore(_fake_qdrant_client, kb_id)  # type: ignore[return-value]
    _init_shared()
    assert _embeddings is not None
    client = _get_qdrant_client()
    col = _collection_name(kb_id)
    # 自动创建集合（首次使用时）
    # 注意：worker 可能已异步创建集合，因此需处理 ALREADY_EXISTS 竞态
    if not client.collection_exists(col):
        from qdrant_client.models import Distance, VectorParams
        try:
            client.create_collection(
                col,
                vectors_config=VectorParams(size=_get_embedding_dim(), distance=Distance.COSINE),
            )
        except Exception as e:
            if "already exists" not in str(e).lower() and "already_exist" not in str(e).lower():
                raise
            logger.debug("Collection %s already exists (created by worker)", col)
    return Qdrant(
        client=client,
        collection_name=col,
        embeddings=_embeddings,
    )


def _get_embedding_dim() -> int:
    """返回当前 embedding 模型的输出维度（Qwen3-Embedding-0.6B = 1024）"""
    _init_shared()
    assert _embeddings is not None
    test_vec = _embeddings.embed_query("dim_test")
    return len(test_vec)


def get_vectorstore(kb_id: int) -> Qdrant:
    return _get_kb_vectorstore(kb_id)


def delete_collection(kb_id: int) -> None:
    """删除整个知识库的向量集合（不可逆）"""
    try:
        _get_qdrant_client().delete_collection(_collection_name(kb_id))
        logger.info("Deleted Qdrant collection for kb_id=%d", kb_id)
    except Exception as e:
        logger.warning("Failed to delete collection for kb_id=%d: %s", kb_id, e)


def delete_document_chunks(kb_id: int, document_id: int) -> int:
    """删除文档的所有向量分块。失败时抛出异常。"""
    client = _get_qdrant_client()
    col = _collection_name(kb_id)

    # 先统计数量
    count_result = client.count(
        col,
        count_filter=models.Filter(
            must=[models.FieldCondition(
                key="metadata.document_id",
                match=models.MatchValue(value=document_id),
            )]
        ),
    )
    before = count_result.count
    if before == 0:
        return 0

    # 按 metadata filter 删除
    client.delete(
        col,
        points_selector=models.FilterSelector(
            filter=models.Filter(
                must=[models.FieldCondition(
                    key="metadata.document_id",
                    match=models.MatchValue(value=document_id),
                )]
            )
        ),
    )

    # 验证
    after = client.count(
        col,
        count_filter=models.Filter(
            must=[models.FieldCondition(
                key="metadata.document_id",
                match=models.MatchValue(value=document_id),
            )]
        ),
    ).count
    if after > 0:
        raise RuntimeError(
            f"Deletion incomplete: {after} chunks remain for doc_id={document_id} in kb_id={kb_id}"
        )

    logger.info("Deleted %d chunks for kb_id=%d doc_id=%d", before, kb_id, document_id)
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
    """查找并执行文本中的所有 Python 代码块，将结果追回文本末尾。

    代码执行默认关闭。生产环境中不应开启，除非完全信任 LLM 输出。
    设置 ENABLE_CODE_EXECUTION=1 可开启此功能。
    """
    import os as _os

    if _os.getenv("ENABLE_CODE_EXECUTION", "0") != "1":
        return text  # 代码执行已禁用，跳过所有 Python 代码块

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


# ── BM25 语料库缓存（避免每次搜索都全量 scroll Qdrant）──
_BM25_CACHE_TTL = 60  # 缓存有效期（秒）
_bm25_cache: dict[int, tuple[float, tuple[list[str], list[str], list[dict]]]] = {}


def _invalidate_bm25_cache(kb_id: int) -> None:
    """文档变更后失效对应 KB 的 BM25 缓存"""
    _bm25_cache.pop(kb_id, None)


def _scroll_all_docs_cached(kb_id: int) -> tuple[list[str], list[str], list[dict]]:
    """从 Qdrant 获取全部文档 — 带 TTL 缓存"""
    now = _time.time()
    entry = _bm25_cache.get(kb_id)
    if entry is not None and now - entry[0] < _BM25_CACHE_TTL:
        return entry[1]

    ids, docs, metas = _scroll_all_docs(kb_id)
    _bm25_cache[kb_id] = (now, (ids, docs, metas))
    return ids, docs, metas


# ── 检索 ──

def _scroll_all_docs(kb_id: int) -> tuple[list[str], list[str], list[dict]]:
    """从 Qdrant scroll 获取集合中全部文档（用于 BM25 索引）"""
    client = _get_qdrant_client()
    col = _collection_name(kb_id)
    ids: list[str] = []
    docs: list[str] = []
    metas: list[dict] = []

    offset: str | int | None = None
    while True:
        points, next_offset = client.scroll(
            col, limit=1000, offset=offset, with_payload=True, with_vectors=False,
        )
        if not points:
            break
        for p in points:
            ids.append(str(p.id))
            payload = p.payload or {}
            docs.append(payload.get("page_content", "") or "")
            metas.append(payload.get("metadata", {}) or {})
        offset = next_offset  # type: ignore[assignment]
        if not next_offset:
            break
    return ids, docs, metas


def _keyword_search(
    question: str, kb_id: int, exclude_ids: set[str], k: int = 3
) -> list[Document]:
    """BM25 关键词检索"""
    from rank_bm25 import BM25Okapi

    keywords = _extract_keywords(question)
    if not keywords:
        return []

    try:
        ids, docs_raw, metadatas = _scroll_all_docs_cached(kb_id)
    except Exception:
        return []

    if not docs_raw:
        return []

    # 构建 BM25 语料库
    corpus: list[list[str]] = []
    index_map: list[int] = []
    for i, chunk_id in enumerate(ids):
        if chunk_id in exclude_ids:
            continue
        text = docs_raw[i] if isinstance(docs_raw[i], str) else ""
        if not text.strip():
            continue
        tokens = _extract_keywords(text)
        if not tokens:
            continue
        corpus.append(tokens)
        index_map.append(i)

    if not corpus:
        return []

    bm25 = BM25Okapi(corpus)
    scores = bm25.get_scores(keywords)

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
    """从 Qdrant 重建文档内容（按 chunk_index 排序合并）"""
    client = _get_qdrant_client()
    col = _collection_name(kb_id)
    points, _ = client.scroll(
        col,
        scroll_filter=models.Filter(
            must=[models.FieldCondition(
                key="metadata.document_id",
                match=models.MatchValue(value=document_id),
            )]
        ),
        with_payload=True,
    )
    if not points:
        return ""
    pairs = []
    for p in points:
        meta = (p.payload or {}).get("metadata", {})
        text = (p.payload or {}).get("page_content", "")
        chunk_idx = meta.get("chunk_index", 0) if isinstance(meta, dict) else 0
        pairs.append((chunk_idx, text))
    pairs.sort(key=lambda x: x[0])
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
