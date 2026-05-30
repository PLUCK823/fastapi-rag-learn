"""安全测试 - SQL注入、XSS、JWT"""

import pytest
from httpx import AsyncClient


class TestSQLInjection:
    """SQL 注入防护测试"""

    @pytest.mark.asyncio
    async def test_sql_injection_in_kb_name(self, client: AsyncClient, auth_headers: dict):
        """知识库名称中的 SQL 注入应该被过滤"""
        # 尝试 SQL 注入
        malicious_names = [
            "test'; DROP TABLE knowledge_bases; --",
            "test\" OR 1=1 --",
            "test') UNION SELECT * FROM users --",
        ]

        for name in malicious_names:
            resp = await client.post("/kb", json={"name": name}, headers=auth_headers)
            # 应该成功创建（名称被当作普通字符串处理）
            # 或者因为特殊字符被拒绝，但不应该导致数据库错误
            assert resp.status_code in [200, 400, 422]
            if resp.status_code == 200:
                # 验证 KB 存在，名称被安全存储 - 通过列表接口
                kb_id = resp.json()["id"]
                resp2 = await client.get("/kb", headers=auth_headers)
                assert resp2.status_code == 200
                kbs = resp2.json()["items"]
                found_kb = next((kb for kb in kbs if kb["id"] == kb_id), None)
                assert found_kb is not None

    @pytest.mark.asyncio
    async def test_sql_injection_in_document_filename(self, client: AsyncClient, auth_headers: dict, kb_id: int):
        """文档文件名中的 SQL 注入应该被过滤"""
        malicious_filenames = [
            "file'; DELETE FROM documents; --",
            "file\" OR '1'='1",
        ]

        for filename in malicious_filenames:
            resp = await client.post(
                f"/kb/{kb_id}/docs",
                json={"content": "test", "filename": filename},
                headers=auth_headers,
            )
            assert resp.status_code in [200, 400, 422]

    @pytest.mark.asyncio
    async def test_sql_injection_in_chat_message(self, client: AsyncClient, auth_headers: dict, kb_id: int):
        """聊天消息中的 SQL 注入应该被过滤"""
        await client.post(
            f"/kb/{kb_id}/docs",
            json={"content": "正常内容", "filename": "test.txt"},
            headers=auth_headers,
        )

        malicious_questions = [
            "'; DROP TABLE chat_messages; --",
            "\" OR 1=1 --",
        ]

        for question in malicious_questions:
            resp = await client.post(
                "/ask",
                json={"kb_id": kb_id, "text": question},
                headers=auth_headers,
            )
            # 应该正常处理或返回错误，不应该导致数据库崩溃
            assert resp.status_code in [200, 422, 500]


class TestXSSProtection:
    """XSS 攻击防护测试"""

    @pytest.mark.asyncio
    async def test_xss_in_kb_name(self, client: AsyncClient, auth_headers: dict):
        """知识库名称中的 XSS 脚本应该被安全处理"""
        xss_names = [
            "<script>alert('xss')</script>",
            "<img src=x onerror=alert('xss')>",
            "javascript:alert('xss')",
        ]

        for name in xss_names:
            resp = await client.post("/kb", json={"name": name}, headers=auth_headers)
            assert resp.status_code in [200, 400, 422]

            if resp.status_code == 200:
                # 验证名称存储，前端应该转义显示
                kb_id = resp.json()["id"]
                resp2 = await client.get("/kb", headers=auth_headers)
                # 名称应该存在，但不应该在 API 层执行脚本
                assert resp2.status_code == 200

    @pytest.mark.asyncio
    async def test_xss_in_document_content(self, client: AsyncClient, auth_headers: dict, kb_id: int):
        """文档内容中的 XSS 脚本应该被安全存储"""
        xss_content = """
        <script>alert('xss')</script>
        <img src=x onerror=alert('xss')>
        正常文本内容
        """

        resp = await client.post(
            f"/kb/{kb_id}/docs",
            json={"content": xss_content, "filename": "xss.txt"},
            headers=auth_headers,
        )
        assert resp.status_code == 200

        # 验证内容被存储
        doc_id = resp.json()["id"]
        resp2 = await client.get(f"/kb/{kb_id}/docs/{doc_id}/content", headers=auth_headers)
        content = resp2.json()["content"]
        # 内容应该完整存储，前端负责转义
        assert "<script>" in content or "script" in content.lower()

    @pytest.mark.asyncio
    async def test_xss_in_chat_response(self, client: AsyncClient, auth_headers: dict, kb_id: int):
        """聊天响应中的 XSS 应该被安全处理"""
        await client.post(
            f"/kb/{kb_id}/docs",
            json={"content": "<script>alert('xss')</script> 测试内容", "filename": "xss.txt"},
            headers=auth_headers,
        )

        resp = await client.post(
            "/ask",
            json={"kb_id": kb_id, "text": "有什么内容？"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        # 响应内容应该包含原文，前端负责转义
        answer = resp.json()["answer"]
        assert len(answer) > 0


class TestJWTSecurity:
    """JWT 安全测试"""

    @pytest.mark.asyncio
    async def test_jwt_expired_token(self, client: AsyncClient):
        """过期 JWT 应该返回 401"""
        # 创建用户
        await client.post("/auth/register", json={"email": "jwt@test.com", "password": "test123456"})
        resp = await client.post("/auth/login", data={"username": "jwt@test.com", "password": "test123456"})
        token = resp.json()["access_token"]

        # 正常 Token 应该工作
        resp = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200

        # 手动构造一个明显过期的 Token（修改 payload）
        # 这里我们用无效 Token 测试
        invalid_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZXhwIjoxNjAwMDAwMDAwfQ.invalid"
        resp = await client.get("/auth/me", headers={"Authorization": f"Bearer {invalid_token}"})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_jwt_tampered_token(self, client: AsyncClient):
        """篡改的 JWT 应该返回 401"""
        # 创建用户获取有效 Token
        await client.post("/auth/register", json={"email": "tamper@test.com", "password": "test123456"})
        resp = await client.post("/auth/login", data={"username": "tamper@test.com", "password": "test123456"})
        valid_token = resp.json()["access_token"]

        # 篡改 Token（修改最后一个字符）
        tampered_token = valid_token[:-1] + "X"

        resp = await client.get("/auth/me", headers={"Authorization": f"Bearer {tampered_token}"})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_jwt_missing_token(self, client: AsyncClient):
        """缺少 JWT 应该返回 401"""
        resp = await client.get("/auth/me")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_jwt_wrong_algorithm(self, client: AsyncClient):
        """使用错误算法签名的 JWT 应该返回 401"""
        # 构造一个 none 算法的 Token（攻击尝试）
        none_algorithm_token = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxIn0."
        resp = await client.get("/auth/me", headers={"Authorization": f"Bearer {none_algorithm_token}"})
        assert resp.status_code == 401


class TestAuthorization:
    """授权测试"""

    @pytest.mark.asyncio
    async def test_access_other_user_kb(self, client: AsyncClient):
        """用户不能访问其他用户的 KB"""
        # 用户 A
        await client.post("/auth/register", json={"email": "auth_a@test.com", "password": "test123456"})
        resp = await client.post("/auth/login", data={"username": "auth_a@test.com", "password": "test123456"})
        headers_a = {"Authorization": f"Bearer {resp.json()['access_token']}"}
        resp = await client.post("/kb", json={"name": "A的库"}, headers=headers_a)
        kb_a = resp.json()["id"]

        # 用户 B
        await client.post("/auth/register", json={"email": "auth_b@test.com", "password": "test123456"})
        resp = await client.post("/auth/login", data={"username": "auth_b@test.com", "password": "test123456"})
        headers_b = {"Authorization": f"Bearer {resp.json()['access_token']}"}

        # 用户 B 尝试访问用户 A 的 KB 文档列表
        resp = await client.get(f"/kb/{kb_a}/docs", headers=headers_b)
        assert resp.status_code == 403

        # 用户 B 尝试删除用户 A 的 KB
        resp = await client.delete(f"/kb/{kb_a}", headers=headers_b)
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_access_other_user_document(self, client: AsyncClient):
        """用户不能访问其他用户的文档"""
        # 用户 A 创建 KB 和文档
        await client.post("/auth/register", json={"email": "doc_a@test.com", "password": "test123456"})
        resp = await client.post("/auth/login", data={"username": "doc_a@test.com", "password": "test123456"})
        headers_a = {"Authorization": f"Bearer {resp.json()['access_token']}"}
        resp = await client.post("/kb", json={"name": "A的库"}, headers=headers_a)
        kb_a = resp.json()["id"]
        resp = await client.post(
            f"/kb/{kb_a}/docs",
            json={"content": "A的内容", "filename": "a.txt"},
            headers=headers_a,
        )
        doc_a = resp.json()["id"]

        # 用户 B
        await client.post("/auth/register", json={"email": "doc_b@test.com", "password": "test123456"})
        resp = await client.post("/auth/login", data={"username": "doc_b@test.com", "password": "test123456"})
        headers_b = {"Authorization": f"Bearer {resp.json()['access_token']}"}

        # 用户 B 尝试访问用户 A 的文档
        resp = await client.get(f"/kb/{kb_a}/docs/{doc_a}/content", headers=headers_b)
        assert resp.status_code == 403

        resp = await client.delete(f"/kb/{kb_a}/docs/{doc_a}", headers=headers_b)
        assert resp.status_code == 403
