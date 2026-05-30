"""RAG 引擎 — 检索 + LLM 生成，按知识库隔离向量库"""

import logging
from collections.abc import Iterator

from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_openai import ChatOpenAI

from app.core.config import (
    CHROMA_DIR,
    EMBEDDING_MODEL,
    LLM_MODEL,
    OPENAI_BASE_URL,
    RETRIEVAL_K,
)
from app.models.schemas import SourceInfo

logger = logging.getLogger(__name__)

_initialized = False
_embeddings: HuggingFaceEmbeddings | None = None
_llm: ChatOpenAI | None = None


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


def extract_sources(docs: list[Document]) -> list[SourceInfo]:
    seen: set[int] = set()
    sources: list[SourceInfo] = []
    for idx, d in enumerate(docs, start=1):
        doc_id = d.metadata.get("document_id")
        if doc_id and doc_id not in seen:
            seen.add(doc_id)
            sources.append(SourceInfo(
                index=idx,
                document_id=int(doc_id),
                document_name=str(d.metadata.get("document_name", "")),
                snippet=d.page_content[:200],
            ))
    return sources


def _retrieve_context(
    question: str, kb_id: int
) -> tuple[str, list[Document]]:
    """检索并构建 prompt，同时返回检索到的文档用于来源追溯"""
    vectorstore = _get_kb_vectorstore(kb_id)
    retriever = vectorstore.as_retriever(search_kwargs={"k": RETRIEVAL_K})
    docs: list[Document] = retriever.invoke(question)

    parts: list[str] = []
    for i, d in enumerate(docs, start=1):
        name = d.metadata.get("document_name", "unknown")
        parts.append(f"来源{i}({name}): {d.page_content}")
    docs_text = "\n".join(parts)

    prompt = f"""根据以下资料回答问题。如果资料里没有答案，就说不知道。

资料:
{docs_text}

问题: {question}

答案:"""
    return prompt, docs


def ask(question: str, kb_id: int) -> tuple[str, list[SourceInfo]]:
    """非流式 RAG 问答"""
    _init_shared()
    assert _llm is not None

    prompt, docs = _retrieve_context(question, kb_id)
    response = _llm.invoke(prompt)
    sources = extract_sources(docs)
    return str(response.content), sources


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

def ask_stream(question: str, kb_id: int) -> Iterator[str]:
    """真正的 LLM token 级流式输出，每个 chunk 是一个 token"""
    _init_shared()
    assert _llm is not None

    prompt, _docs = _retrieve_context(question, kb_id)
    for chunk in _llm.stream(prompt):
        c = chunk.content
        if isinstance(c, str) and c:
            yield c


def ask_stream_with_sources(
    question: str, kb_id: int
) -> tuple[Iterator[str], list[SourceInfo]]:
    """流式输出 + 来源信息，一次检索供两用"""
    _init_shared()
    assert _llm is not None

    prompt, docs = _retrieve_context(question, kb_id)
    sources = extract_sources(docs)

    def _stream() -> Iterator[str]:
        for chunk in _llm.stream(prompt):
            c = chunk.content
            if isinstance(c, str) and c:
                yield c

    return _stream(), sources
