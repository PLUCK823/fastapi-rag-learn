"""Rate limiting middleware to prevent API abuse"""

import time
from collections import defaultdict

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import RATE_LIMIT_PERIOD, RATE_LIMIT_REQUESTS

# 每隔此秒数做一次全局过期条目清理（而非每次请求都遍历整个 dict）
_CLEANUP_INTERVAL = 300  # 5 分钟


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple in-memory rate limiting middleware with periodic cleanup."""

    def __init__(
        self,
        app,
        requests_per_period: int = RATE_LIMIT_REQUESTS,
        period_seconds: int = RATE_LIMIT_PERIOD,
    ):
        super().__init__(app)
        self.requests_per_period = requests_per_period
        self.period_seconds = period_seconds
        # Track requests per IP: {ip: [(timestamp, path), ...]}
        self.requests: dict[str, list[tuple[float, str]]] = defaultdict(list)
        # Track last global cleanup time
        self._last_cleanup = time.time()

    def _cleanup_expired(self, now: float) -> None:
        """定期清理所有过期的 IP 条目和空列表，防止内存泄漏。"""
        cutoff = now - self.period_seconds
        stale_ips: list[str] = []
        for ip, reqs in self.requests.items():
            # 只保留时间窗口内的记录
            filtered = [(ts, p) for ts, p in reqs if ts > cutoff]
            if filtered:
                self.requests[ip] = filtered
            else:
                stale_ips.append(ip)
        for ip in stale_ips:
            del self.requests[ip]
        self._last_cleanup = now

    async def dispatch(self, request: Request, call_next) -> Response:
        # Skip rate limiting for non-expensive endpoints
        path = request.url.path

        # Rate limit expensive endpoints (ask, websocket)
        # and auth endpoints (login, register — prevents brute-force)
        _limited_prefixes = ("/ws/",)
        _limited_exact = {"/ask", "/auth/login", "/auth/register"}
        _is_limited = path in _limited_exact or any(
            path.startswith(p) for p in _limited_prefixes
        )
        if not _is_limited:
            return await call_next(request)

        # Get client IP
        client_ip = request.client.host if request.client else "unknown"
        current_time = time.time()

        # 定期全局清理过期条目（避免每次请求都遍历整个 dict，但仍防止泄漏）
        if current_time - self._last_cleanup > _CLEANUP_INTERVAL:
            self._cleanup_expired(current_time)

        # 仅清理当前 IP 的过期记录（快速路径）
        cutoff_time = current_time - self.period_seconds
        if client_ip in self.requests:
            self.requests[client_ip] = [
                (ts, p) for ts, p in self.requests[client_ip] if ts > cutoff_time
            ]
            # 如果该 IP 已无有效记录，删除整个 key
            if not self.requests[client_ip]:
                del self.requests[client_ip]

        # Check rate limit
        recent_requests = len(self.requests.get(client_ip, []))

        if recent_requests >= self.requests_per_period:
            return Response(
                content='{"detail": "请求过于频繁，请稍后再试"}',
                status_code=429,
                media_type="application/json",
                headers={"Retry-After": str(self.period_seconds)},
            )

        # Record this request
        self.requests[client_ip].append((current_time, path))

        # Proceed with request
        return await call_next(request)
