"""RAG 引擎 — LangGraph 编排检索 + 生成，按用户隔离向量库"""

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

_initialized = False
_embeddings: HuggingFaceEmbeddings | None = None
_llm: ChatOpenAI | None = None


def _init_shared() -> None:
    """初始化共享的 embedding 模型和 LLM（只加载一次）"""
    global _initialized, _embeddings, _llm
    if _initialized:
        return
    _embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)
    _llm = ChatOpenAI(model=LLM_MODEL, temperature=0.3, base_url=OPENAI_BASE_URL)
    _initialized = True


def _get_user_vectorstore(user_id: int) -> Chroma:
    _init_shared()
    assert _embeddings is not None
    collection_name = f"user_{user_id}"
    return Chroma(
        embedding_function=_embeddings,
        persist_directory=str(CHROMA_DIR),
        collection_name=collection_name,
    )


def get_vectorstore(user_id: int) -> Chroma:
    return _get_user_vectorstore(user_id)


def ask(question: str, user_id: int) -> str:
    _init_shared()
    assert _llm is not None

    vectorstore = _get_user_vectorstore(user_id)
    retriever = vectorstore.as_retriever(search_kwargs={"k": RETRIEVAL_K})

    class RAGState(TypedDict):
        question: str
        context: list[Document]
        answer: str

    def retrieve(state: RAGState) -> dict:
        docs: list[Document] = retriever.invoke(state["question"])
        return {"context": docs}

    def generate(state: RAGState) -> dict:
        docs_text = "\n\n".join(d.page_content for d in state["context"])
        prompt = f"""根据以下参考资料回答问题。如果资料里没有答案，就说不知道。

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
    return result["answer"]
