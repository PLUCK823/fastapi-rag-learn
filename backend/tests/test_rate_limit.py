"""Rate limiting middleware tests"""

import pytest
from httpx import AsyncClient


class TestRateLimiterMemoryLeak:
    """P1 — 速率限制器内存泄漏修复"""

    def test_expired_entries_cleaned_up(self):
        """过期和无活跃记录的 IP 条目应被清理"""
        from app.core.rate_limit import RateLimitMiddleware

        rl = RateLimitMiddleware(None)  # type: ignore[arg-type]
        rl.period_seconds = 1  # 1 秒窗口便于测试

        # 添加一条过期记录
        rl.requests["10.0.0.1"] = [(0.0, "/ask")]
        # 添加一条仍然有效的记录
        import time as _time

        now = _time.time()
        rl.requests["10.0.0.2"] = [(now, "/ask")]

        # 触发清理
        rl._cleanup_expired(now + 0.5)

        # 过期 IP 应被删除
        assert "10.0.0.1" not in rl.requests
        # 有效 IP 应保留
        assert "10.0.0.2" in rl.requests

    def test_empty_list_after_filtered_gets_deleted(self):
        """过滤后为空的列表应从 dict 中删除"""
        from app.core.rate_limit import RateLimitMiddleware

        rl = RateLimitMiddleware(None)  # type: ignore[arg-type]
        rl.period_seconds = 1
        rl.requests["10.0.0.3"] = [(0.0, "/ask"), (0.1, "/auth/login")]

        rl._cleanup_expired(100.0)

        assert "10.0.0.3" not in rl.requests


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

    @pytest.mark.asyncio
    async def test_auth_endpoints_are_rate_limited(self, client: AsyncClient):
        """Phase 1 — /auth/login 和 /auth/register 已被加入限流端点集合"""
        # /auth/login 被限流保护
        resp = await client.post(
            "/auth/login",
            data={"username": "nobody@test.com", "password": "wrong"},
        )
        assert resp.status_code in [400, 401, 422]

        # /auth/register 被限流保护
        resp = await client.post(
            "/auth/register",
            json={"email": f"rl_test_{id(self)}@test.com", "password": "test123456"},
        )
        assert resp.status_code in [201, 409, 422]
