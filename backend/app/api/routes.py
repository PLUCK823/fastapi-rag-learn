"""API 路由 — RAG 问答 + WebSocket 流式"""

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
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


# 多轮对话保留最近消息轮数
_MAX_HISTORY_ROUNDS = 5


def _fetch_history(
    session: Session,
    kb_id: int,
    user_id: int,
    session_id: str | None,
) -> list[tuple[str, str]]:
    """获取会话最近 N 轮对话历史，返回 [(role, content), ...]"""
    if not session_id:
        return []
    msgs = (
        session.query(ChatMessage)
        .filter(
            ChatMessage.kb_id == kb_id,
            ChatMessage.user_id == user_id,
            ChatMessage.session_id == session_id,
        )
        .order_by(ChatMessage.created_at.desc())
        .limit(_MAX_HISTORY_ROUNDS * 2)
        .all()
    )
    # 反转时间顺序为对话顺序
    msgs.reverse()
    return [(m.role, m.content) for m in msgs]


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
    # 获取会话历史（多轮对话上下文）
    history = _fetch_history(session, req.kb_id, user.id, req.session_id)

    try:
        answer, sources = ask(req.text, req.kb_id, history if history else None)
    except Exception as e:
        # Handle LLM/embedding failures gracefully
        error_msg = str(e)
        if "connection" in error_msg.lower() or "timeout" in error_msg.lower():
            raise HTTPException(
                status_code=503,
                detail="LLM 服务暂时不可用，请稍后再试"
            )
        if "api" in error_msg.lower() or "key" in error_msg.lower():
            raise HTTPException(
                status_code=500,
                detail="LLM 服务配置错误，请联系管理员"
            )
        raise HTTPException(
            status_code=500,
            detail=f"生成回答时发生错误: {error_msg}"
        )

    _save_message(session, req.kb_id, user.id, "user", req.text, None, req.session_id)
    _save_message(session, req.kb_id, user.id, "assistant", answer, sources, req.session_id)
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

    # fastapi-users JWT uses 'sub' field for user_id
    user_id_str = payload.get("sub", "0")
    user_id = int(user_id_str) if user_id_str else 0
    sid = session_id if session_id else None

    # 获取多轮对话历史
    history: list[tuple[str, str]] = []
    if sid and user_id:
        with sync_session_factory() as history_session:
            history = _fetch_history(history_session, kb_id, user_id, sid)

    try:
        stream, sources = ask_stream_with_sources(
            data, kb_id, history if history else None
        )
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
        if user_id:
            with sync_session_factory() as session:
                _save_message(session, kb_id, user_id, "user", data, None, sid)
                _save_message(session, kb_id, user_id, "assistant", full_answer, sources, sid)
    except Exception as e:
        error_msg = str(e)
        # Provide user-friendly error messages
        if "connection" in error_msg.lower() or "timeout" in error_msg.lower():
            await websocket.send_text(json.dumps({"error": "LLM 服务暂时不可用，请稍后再试"}))
        elif "api" in error_msg.lower() or "key" in error_msg.lower():
            await websocket.send_text(json.dumps({"error": "LLM 服务配置错误，请联系管理员"}))
        else:
            await websocket.send_text(json.dumps({"error": f"生成回答时发生错误: {error_msg}"}))
    finally:
        await websocket.close()
