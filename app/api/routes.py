"""API 路由 — 受认证保护的 RAG 问答和文档摄取"""

import tempfile

from fastapi import APIRouter, Depends, UploadFile

from app.core.auth import current_user
from app.core.engine import ask
from app.models.schemas import AskRequest, AskResponse, IngestResponse, IngestTextRequest
from app.models.user import User
from app.services.ingest import ingest_from_file, ingest_text

router = APIRouter()


@router.post("/ask", response_model=AskResponse)
def ask_endpoint(req: AskRequest, user: User = Depends(current_user)):
    """RAG 问答 — 只在当前用户的文档库中检索"""
    result = ask(req.text, user.id)
    return AskResponse(question=req.text, answer=result)


@router.post("/ingest/file", response_model=IngestResponse)
def ingest_file_endpoint(file: UploadFile, user: User = Depends(current_user)):
    """上传文件入库到当前用户的文档库"""
    with tempfile.NamedTemporaryFile(delete=False, suffix=f"_{file.filename}") as tmp:
        tmp.write(file.file.read())
        tmp_path = tmp.name

    chunk_count = ingest_from_file(tmp_path, user.id)
    return IngestResponse(
        message=f"摄取完成，{chunk_count} 个文本块已入库",
        file_count=1,
        chunk_count=chunk_count,
    )


@router.post("/ingest/text", response_model=IngestResponse)
def ingest_text_endpoint(req: IngestTextRequest, user: User = Depends(current_user)):
    """上传文本内容入库到当前用户的文档库"""
    chunk_count = ingest_text(req.content, req.filename, user.id)
    return IngestResponse(
        message=f"摄取完成，{chunk_count} 个文本块已入库",
        file_count=1,
        chunk_count=chunk_count,
    )
