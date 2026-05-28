"""API 路由 — RAG 问答 + WebSocket 流式"""

import json

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from jwt import PyJWTError
from jwt import decode as jwt_decode

from app.core.auth import current_user
from app.core.config import SECRET_KEY
from app.core.engine import ask, ask_stream
from app.models.schemas import AskRequest, AskResponse
from app.models.user import User

router = APIRouter()


@router.post("/ask", response_model=AskResponse)
def ask_endpoint(req: AskRequest, user: User = Depends(current_user)):
    answer, sources = ask(req.text, req.kb_id)
    return AskResponse(question=req.text, answer=answer, sources=sources)


@router.websocket("/ws/{kb_id}")
async def ws_ask(websocket: WebSocket, kb_id: int, token: str = Query(...)):
    await websocket.accept()
    try:
        jwt_decode(token, SECRET_KEY, algorithms=["HS256"])
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
