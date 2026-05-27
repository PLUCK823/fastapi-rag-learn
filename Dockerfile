# ============================================================
# 阶段 1: 构建（用 uv 装依赖，速度快）
# ============================================================
FROM python:3.12-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# 先只复制依赖清单（利用 Docker 缓存，代码改了不重装依赖）
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# ============================================================
# 阶段 2: 运行（最小化镜像）
# ============================================================
FROM python:3.12-slim AS runtime

WORKDIR /app

# 从构建阶段把装好的 .venv 复制过来
COPY --from=builder /app/.venv .venv

# 复制应用代码（嵌套结构）
COPY app/ ./app/
COPY documents/ ./documents/

ENV PATH="/app/.venv/bin:$PATH"

VOLUME ["/app/chroma_db"]

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
