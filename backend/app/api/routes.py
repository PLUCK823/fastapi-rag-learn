"""API 路由 — RAG 问答 + WebSocket 流式"""

import json

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from jwt import PyJWTError
from jwt import decode as jwt_decode
from sqlalchemy.orm import Session

from app.core.auth import current_user
from app.core.config import SECRET_KEY
from app.core.database import get_sync_session
from app.core.engine import ask, ask_stream
from app.models.chat import ChatMessage
from app.models.schemas import AskRequest, AskResponse, SourceInfo
from app.models.user import User

router = APIRouter()


def _save_message(
    session: Session,
    kb_id: int,
    user_id: int,
    role: str,
    content: str,
    sources: list[SourceInfo] | None,
) -> None:
    msg = ChatMessage(
        kb_id=kb_id,
        user_id=user_id,
        role=role,
        content=content,
        sources=[s.model_dump() for s in sources] if sources else None,
    )
    session.add(msg)
    session.commit()


@router.post("/ask", response_model=AskResponse)
def ask_endpoint(
    req: AskRequest,
    user: User = Depends(current_user),
    session: Session = Depends(get_sync_session),
):
    answer, sources = ask(req.text, req.kb_id)
    _save_message(session, req.kb_id, user.id, "user", req.text, None)
    _save_message(session, req.kb_id, user.id, "assistant", answer, sources)
    return AskResponse(question=req.text, answer=answer, sources=sources)


@router.websocket("/ws/{kb_id}")
async def ws_ask(websocket: WebSocket, kb_id: int, token: str = Query(...)):
    await websocket.accept()
    try:
        jwt_decode(token, SECRET_KEY, algorithms=["HS256"], audience="fastapi-users:auth")
    except PyJWTError:
        await websocket.send_text(json.dumps({"error": "invalid token"}))
        await websocket.close()
        return

    try:
        data = await websocket.receive_text()
    except WebSocketDisconnect:
        return

    try:
        for chunk in ask_stream(data, kb_id):
            await websocket.send_text(chunk)
    except Exception as e:
        await websocket.send_text(json.dumps({"error": str(e)}))
    finally:
        await websocket.close()
