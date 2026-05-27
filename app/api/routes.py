"""API 路由"""

from fastapi import APIRouter

from app.core.engine import ask
from app.models.schemas import AskRequest, AskResponse, IngestResponse
from app.services.ingest import ingest_documents

router = APIRouter()


@router.post("/ask", response_model=AskResponse)
def ask_endpoint(req: AskRequest):
    """RAG 问答 — 检索相关文档后由 LLM 生成回答"""
    result = ask(req.text)
    return AskResponse(question=req.text, answer=result)


@router.post("/ingest", response_model=IngestResponse)
def ingest_endpoint():
    """重新摄取 documents/ 目录下的文档"""
    file_count, chunk_count = ingest_documents()
    return IngestResponse(
        message=f"摄取完成，{chunk_count} 个文本块已入库",
        file_count=file_count,
        chunk_count=chunk_count,
    )
