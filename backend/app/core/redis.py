"""Redis 连接池 + 任务进度追踪工具"""

from __future__ import annotations

from typing import Any

from arq.connections import ArqRedis, RedisSettings, create_pool

from app.core.config import REDIS_URL

# 任务状态过期时间（秒）
TASK_EXPIRE = 3600


async def create_redis_pool() -> ArqRedis | None:
    """创建 ARQ Redis 连接池（用于入队任务）"""
    url = REDIS_URL.replace("redis://", "")
    if ":" in url:
        host, port_str = url.split(":", 1)
        port = int(port_str)
    else:
        host = url
        port = 6379
    try:
        pool = await create_pool(
            RedisSettings(host=host, port=port, conn_timeout=2, conn_retries=0)
        )
        # Verify real connectivity (ARQ pools are created lazily)
        await pool.ping()
        return pool
    except Exception:
        return None  # Redis unavailable — graceful degradation


async def get_task_status(redis: ArqRedis, task_id: str) -> dict[str, Any]:
    """从 Redis Hash 读取任务状态"""
    key = f"task:{task_id}"
    data = await redis.hgetall(key)  # type: ignore[misc]
    if not data:
        return {"status": "unknown"}
    result: dict[str, Any] = {}
    for k, v in data.items():
        key_str = k.decode() if isinstance(k, bytes) else k
        val_str = v.decode() if isinstance(v, bytes) else v
        result[key_str] = val_str
    return result


async def update_task_progress(
    redis: ArqRedis,
    task_id: str,
    status: str,
    progress: int,
    message: str = "",
) -> None:
    """更新 Redis 中的任务进度"""
    key = f"task:{task_id}"
    mapping: dict[str, str] = {
        "status": status,
        "progress": str(progress),
    }
    if message:
        mapping["message"] = message
    await redis.hset(key, mapping=mapping)  # type: ignore[misc]
    await redis.expire(key, TASK_EXPIRE)  # type: ignore[misc]
