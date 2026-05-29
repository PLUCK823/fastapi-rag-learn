"""API 路由 — RAG 问答 + WebSocket 流式"""

import json
from typing import Any

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from jwt import PyJWTError
from jwt import decode as jwt_decode
from sqlalchemy.orm import Session

from app.core.auth import current_user
from app.core.config import SECRET_KEY
from app.core.database import get_sync_session
from app.core.engine import ask, ask_stream_with_sources
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
    session_id: str | None = None,
) -> None:
    msg = ChatMessage(
        kb_id=kb_id,
        user_id=user_id,
        role=role,
        content=content,
        session_id=session_id,
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


async def _get_token_user(token: str) -> dict[str, Any] | None:
    """解码 JWT token 并返回 payload，失败返回 None"""
    try:
        payload: dict[str, Any] = jwt_decode(
            token, SECRET_KEY, algorithms=["HS256"], audience="fastapi-users:auth"
        )
        return payload
    except PyJWTError:
        return None


@router.websocket("/ws/{kb_id}")
async def ws_ask(
    websocket: WebSocket,
    kb_id: int,
    token: str = Query(...),
    session_id: str = Query(default=""),
):
    await websocket.accept()

    payload = await _get_token_user(token)
    if payload is None:
        await websocket.send_text(json.dumps({"error": "invalid token"}))
        await websocket.close()
        return

    try:
        data = await websocket.receive_text()
    except WebSocketDisconnect:
        return

    if not data.strip():
        await websocket.send_text(json.dumps({"error": "问题不能为空"}))
        await websocket.close()
        return

    full_answer_parts: list[str] = []

    from app.core.database import sync_session_factory

    try:
        stream, sources = ask_stream_with_sources(data, kb_id)
        for chunk in stream:
            full_answer_parts.append(chunk)
            await websocket.send_text(chunk)

        # 发送结束标记 + 来源信息
        await websocket.send_text(
            json.dumps(
                {
                    "done": True,
                    "sources": [s.model_dump() for s in sources],
                }
            )
        )

        # 保存对话记录
        full_answer = "".join(full_answer_parts)
        user_id = int(payload.get("user_id", 0))
        if user_id:
            sid = session_id if session_id else None
            with sync_session_factory() as session:
                _save_message(session, kb_id, user_id, "user", data, None, sid)
                _save_message(session, kb_id, user_id, "assistant", full_answer, sources, sid)
    except Exception as e:
        await websocket.send_text(json.dumps({"error": str(e)}))
    finally:
        await websocket.close()
