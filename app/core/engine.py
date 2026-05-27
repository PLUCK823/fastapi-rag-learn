"""RAG 引擎 — LangGraph 编排检索 + 生成"""

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

# 懒加载：只在真正调用时才初始化
_initialized = False
_embeddings = None
_llm = None
_vectorstore = None
_retriever = None
_rag_app = None


def get_vectorstore() -> Chroma:
    """获取向量库实例（供 ingest 用）"""
    _init()
    return _vectorstore


def _init() -> None:
    global _initialized, _embeddings, _llm, _vectorstore, _retriever, _rag_app
    if _initialized:
        return

    _embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)
    _llm = ChatOpenAI(model=LLM_MODEL, temperature=0.3, base_url=OPENAI_BASE_URL)
    _vectorstore = Chroma(
        embedding_function=_embeddings,
        persist_directory=str(CHROMA_DIR),
    )
    _retriever = _vectorstore.as_retriever(search_kwargs={"k": RETRIEVAL_K})

    # 组装 LangGraph
    class RAGState(TypedDict):
        question: str
        context: list[Document]
        answer: str

    def retrieve(state: RAGState) -> dict:
        docs = _retriever.invoke(state["question"])
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

    g = StateGraph(RAGState)
    g.add_node("retrieve", retrieve)
    g.add_node("generate", generate)
    g.set_entry_point("retrieve")
    g.add_edge("retrieve", "generate")
    g.set_finish_point("generate")
    _rag_app = g.compile()
    _initialized = True


def ask(question: str) -> str:
    _init()
    result = _rag_app.invoke({"question": question})
    return result["answer"]
