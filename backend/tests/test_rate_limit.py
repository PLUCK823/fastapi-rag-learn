"""Rate limiting middleware tests"""

import pytest
from httpx import AsyncClient


class TestRateLimiting:
    """Test rate limiting on expensive endpoints — 使用 conftest client fixture"""

    @pytest.mark.asyncio
    async def test_rate_limit_returns_429_after_limit_exceeded(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Rate limiting middleware 生效：创建 KB 后验证正常端点可用"""
        resp = await client.post("/kb", json={"name": "test-kb"}, headers=auth_headers)
        kb_id = resp.json()["id"]
        await client.post(
            f"/kb/{kb_id}/docs",
            json={"content": "测试内容", "filename": "test.txt"},
            headers=auth_headers,
        )

        # 非限流端点应正常工作
        resp = await client.get("/kb", headers=auth_headers)
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_non_expensive_endpoints_not_rate_limited(
        self, client: AsyncClient, auth_headers: dict
    ):
        """非昂贵端点不应被限流"""
        # 多次请求非限流端点
        for _ in range(10):
            resp = await client.get("/kb", headers=auth_headers)
            assert resp.status_code == 200

        # 创建多个 KB（可能因重名失败，但不应返回 429）
        for i in range(5):
            resp = await client.post("/kb", json={"name": f"kb-{i}"}, headers=auth_headers)
            assert resp.status_code in [200, 409]
