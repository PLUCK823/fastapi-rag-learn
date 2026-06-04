# ============================================================
# 阶段 1: 构建（装依赖 + 预下载 embedding 模型）
# ============================================================
FROM python:3.12.10-slim-bookworm AS builder

COPY --from=ghcr.io/astral-sh/uv:0.7.21 /uv /usr/local/bin/uv

WORKDIR /app

# 安装系统依赖（sentence-transformers + Docling/OpenCV 需要）
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    gcc g++ \
    libxcb1 libx11-6 libgl1-mesa-glx libglib2.0-0 libgomp1 && \
    rm -rf /var/lib/apt/lists/*

# 装 Python 依赖（利用 BuildKit cache mount 加速）
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

# ============================================================
# 阶段 1b: dev 构建（包含 dev 依赖，用于本地开发热重载）
# ============================================================
FROM builder AS dev

# 安装所有依赖（含 dev）
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project

# 复制代码+迁移配置（初始状态，后续 watch sync 更新）
COPY app/ ./app/
COPY alembic.ini ./
COPY alembic/ ./alembic/

# 预下载本地模型（仅 EMBEDDING_PROVIDER=local 或 RERANKER_PROVIDER=local 时需要）
# 全部 API 模式时传 --build-arg SKIP_LOCAL_MODELS=true 跳过下载（节省 ~10 分钟）
ARG SKIP_LOCAL_MODELS=false
RUN if [ "$SKIP_LOCAL_MODELS" = "true" ]; then \
        echo ">>> All models use API — skipping local downloads"; \
        mkdir -p /root/.cache/huggingface; \
    else \
        echo ">>> Downloading local models (use SKIP_LOCAL_MODELS=true for API-only mode)"; \
        .venv/bin/python3 -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('Qwen/Qwen3-Embedding-0.6B')" || true; \
        .venv/bin/python3 -c "from sentence_transformers import CrossEncoder; CrossEncoder('Qwen/Qwen3-Reranker-4B')" || true; \
    fi

# ============================================================
# 阶段 2: 运行
# ============================================================
FROM python:3.12.10-slim-bookworm AS runtime

WORKDIR /app

# 安装 curl（HEALTHCHECK 需要）+ Docling/OpenCV 系统依赖
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    libxcb1 libx11-6 libgl1-mesa-glx libglib2.0-0 libgomp1 && \
    rm -rf /var/lib/apt/lists/*

# 创建非 root 用户
RUN groupadd -r appuser && useradd -r -g appuser -u 1001 appuser

# 复制 venv 和预下载模型
COPY --from=builder /app/.venv .venv
# 复制 venv；模型缓存可能在 builder（production）或 dev（含预下载）中
COPY --from=dev /root/.cache/huggingface /home/appuser/.cache/huggingface

# 应用代码（仅代码，数据通过 volume 挂载）
COPY app/ ./app/

# Alembic 迁移配置
COPY alembic.ini ./
COPY alembic/ ./alembic/

# 权限
RUN chown -R appuser:appuser /app /home/appuser/.cache

USER appuser

ENV PATH="/app/.venv/bin:$PATH"

VOLUME ["/app/chroma_db"]

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=30s \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
