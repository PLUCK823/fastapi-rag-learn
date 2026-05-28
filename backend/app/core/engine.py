"""RAG 引擎 — LangGraph 编排检索 + 生成，按知识库隔离向量库"""

from collections.abc import Iterator

from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph
from typing_extensions import TypedDict

from app.core.config import (
    CHROMA_DIR,
    EMBEDDING_MODEL,
    LLM_MODEL,
    OPENAI_BASE_URL,
    RETRIEVAL_K,
)
from app.models.schemas import SourceInfo

_initialized = False
_embeddings: HuggingFaceEmbeddings | None = None
_llm: ChatOpenAI | None = None


def _init_shared() -> None:
    global _initialized, _embeddings, _llm
    if _initialized:
        return
    _embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)
    _llm = ChatOpenAI(model=LLM_MODEL, temperature=0.3, base_url=OPENAI_BASE_URL)
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
    vs = _get_kb_vectorstore(kb_id)
    try:
        vs.delete_collection()
    except Exception:
        pass  # collection may not exist yet


def delete_document_chunks(kb_id: int, document_id: int) -> None:
    vs = _get_kb_vectorstore(kb_id)
    try:
        vs.delete(where={"document_id": document_id})
    except Exception:
        pass


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


def ask(question: str, kb_id: int) -> tuple[str, list[SourceInfo]]:
    _init_shared()
    assert _llm is not None

    vectorstore = _get_kb_vectorstore(kb_id)
    retriever = vectorstore.as_retriever(search_kwargs={"k": RETRIEVAL_K})

    class RAGState(TypedDict):
        question: str
        context: list[Document]
        answer: str

    def retrieve(state: RAGState) -> dict:
        docs: list[Document] = retriever.invoke(state["question"])
        return {"context": docs}

    def generate(state: RAGState) -> dict:
        docs_text_parts: list[str] = []
        for i, d in enumerate(state["context"], start=1):
            name = d.metadata.get("document_name", "unknown")
            docs_text_parts.append(f"[{i}] ({name})\n{d.page_content}")
        docs_text = "\n\n".join(docs_text_parts)

        prompt = f"""根据以下参考资料回答问题。如果资料里没有答案，就说不知道。

引用参考资料时在句末标注来源编号，如[1]、[2]。

参考资料:
{docs_text}

问题: {state["question"]}

答案:"""
        response = _llm.invoke(prompt)
        return {"answer": response.content}

    graph = (
        StateGraph(RAGState)
        .add_node("retrieve", retrieve)
        .add_node("generate", generate)
        .add_edge("retrieve", "generate")
        .set_entry_point("retrieve")
        .set_finish_point("generate")
        .compile()
    )
    result = graph.invoke({"question": question})  # type: ignore[call-overload]
    sources = extract_sources(result["context"])
    return result["answer"], sources


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
    _init_shared()
    assert _llm is not None

    vectorstore = _get_kb_vectorstore(kb_id)
    retriever = vectorstore.as_retriever(search_kwargs={"k": RETRIEVAL_K})

    docs: list[Document] = retriever.invoke(question)

    docs_text_parts: list[str] = []
    for i, d in enumerate(docs, start=1):
        name = d.metadata.get("document_name", "unknown")
        docs_text_parts.append(f"[{i}] ({name})\n{d.page_content}")
    docs_text = "\n\n".join(docs_text_parts)

    prompt = f"""根据以下参考资料回答问题。如果资料里没有答案，就说不知道。

引用参考资料时在句末标注来源编号，如[1]、[2]。

参考资料:
{docs_text}

问题: {question}

答案:"""
    for chunk in _llm.stream(prompt):
        c = chunk.content
        if isinstance(c, str):
            yield c
