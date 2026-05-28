"""API 路由 — RAG 问答（受认证保护，按知识库隔离）"""

from fastapi import APIRouter, Depends

from app.core.auth import current_user
from app.core.engine import ask
from app.models.schemas import AskRequest, AskResponse
from app.models.user import User

router = APIRouter()


@router.post("/ask", response_model=AskResponse)
def ask_endpoint(req: AskRequest, user: User = Depends(current_user)):
    """RAG 问答 — 在指定知识库中检索，返回答案和来源"""
    answer, sources = ask(req.text, req.kb_id)
    return AskResponse(question=req.text, answer=answer, sources=sources)
