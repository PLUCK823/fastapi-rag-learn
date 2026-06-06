"""WebSocket 集成测试 — 同步 TestClient + sync_db fixture 管理表"""

import json

from fastapi.testclient import TestClient

from app.main import app


class TestWebSocketIntegration:
    """WebSocket 连接生命周期测试"""

    def test_websocket_connect_with_valid_token(self, sync_db):
        """有效 Token 可以连接 WebSocket"""
        client = TestClient(app)

        client.post("/auth/register", json={"email": "ws@test.com", "password": "test123456"})
        resp = client.post(
            "/auth/login", data={"username": "ws@test.com", "password": "test123456"}
        )
        token = resp.json()["access_token"]

        resp = client.post(
            "/kb", json={"name": "WS测试库"}, headers={"Authorization": f"Bearer {token}"}
        )
        kb_id = resp.json()["id"]
        client.post(
            f"/kb/{kb_id}/docs",
            json={"content": "测试内容", "filename": "test.txt"},
            headers={"Authorization": f"Bearer {token}"},
        )

        with client.websocket_connect(f"/ws/{kb_id}?token={token}") as ws:
            ws.send_text("什么是测试？")
            response = ws.receive_text()
            assert "error" not in response.lower() or response == ""

    def test_websocket_connect_with_invalid_token(self, sync_db):
        """无效 Token 连接 WebSocket 应该被拒绝"""
        client = TestClient(app)

        client.post("/auth/register", json={"email": "ws2@test.com", "password": "test123456"})
        resp = client.post(
            "/auth/login", data={"username": "ws2@test.com", "password": "test123456"}
        )
        token = resp.json()["access_token"]
        resp = client.post(
            "/kb", json={"name": "WS测试库2"}, headers={"Authorization": f"Bearer {token}"}
        )
        kb_id = resp.json()["id"]

        with client.websocket_connect(f"/ws/{kb_id}?token=invalid_token") as ws:
            response = ws.receive_text()
            data = json.loads(response)
            assert data.get("error") == "invalid token"

    def test_websocket_empty_message_rejected(self, sync_db):
        """空消息应该被拒绝"""
        client = TestClient(app)

        client.post("/auth/register", json={"email": "ws3@test.com", "password": "test123456"})
        resp = client.post(
            "/auth/login", data={"username": "ws3@test.com", "password": "test123456"}
        )
        token = resp.json()["access_token"]
        resp = client.post(
            "/kb", json={"name": "WS测试库3"}, headers={"Authorization": f"Bearer {token}"}
        )
        kb_id = resp.json()["id"]
        client.post(
            f"/kb/{kb_id}/docs",
            json={"content": "内容", "filename": "test.txt"},
            headers={"Authorization": f"Bearer {token}"},
        )

        with client.websocket_connect(f"/ws/{kb_id}?token={token}") as ws:
            ws.send_text("   ")  # 空消息
            response = ws.receive_text()
            data = json.loads(response)
            assert data.get("error") == "问题不能为空"

    def test_websocket_session_id_saved(self, sync_db):
        """带 session_id 的消息应该保存到数据库"""
        client = TestClient(app)

        client.post("/auth/register", json={"email": "ws4@test.com", "password": "test123456"})
        resp = client.post(
            "/auth/login", data={"username": "ws4@test.com", "password": "test123456"}
        )
        token = resp.json()["access_token"]
        resp = client.post(
            "/kb", json={"name": "WS测试库4"}, headers={"Authorization": f"Bearer {token}"}
        )
        kb_id = resp.json()["id"]
        client.post(
            f"/kb/{kb_id}/docs",
            json={"content": "Python 是一门编程语言", "filename": "test.txt"},
            headers={"Authorization": f"Bearer {token}"},
        )

        session_id = "sess_test_123"
        with client.websocket_connect(f"/ws/{kb_id}?token={token}&session_id={session_id}") as ws:
            ws.send_text("Python 是什么？")
            responses = []
            while True:
                response = ws.receive_text()
                responses.append(response)
                try:
                    data = json.loads(response)
                    if isinstance(data, dict) and data.get("done"):
                        break
                except json.JSONDecodeError:
                    continue

        resp = client.get(
            f"/kb/{kb_id}/sessions/{session_id}/messages",
            headers={"Authorization": f"Bearer {token}"},
        )
        messages = resp.json()
        assert len(messages) >= 2  # user + assistant
        assert messages[0]["role"] == "user"
        assert "Python" in messages[0]["content"]
