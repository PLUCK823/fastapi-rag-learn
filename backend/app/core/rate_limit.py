"""Rate limiting middleware to prevent API abuse"""

import time
from collections import defaultdict

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import RATE_LIMIT_PERIOD, RATE_LIMIT_REQUESTS


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple in-memory rate limiting middleware"""

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

    async def dispatch(self, request: Request, call_next) -> Response:
        # Skip rate limiting for non-expensive endpoints
        path = request.url.path

        # Only rate limit expensive endpoints (ask, websocket)
        if not (path == "/ask" or path.startswith("/ws/")):
            return await call_next(request)

        # Get client IP
        client_ip = request.client.host if request.client else "unknown"

        # Clean old requests
        current_time = time.time()
        cutoff_time = current_time - self.period_seconds

        if client_ip in self.requests:
            self.requests[client_ip] = [
                (ts, p) for ts, p in self.requests[client_ip] if ts > cutoff_time
            ]

        # Check rate limit
        recent_requests = len(self.requests[client_ip])

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
