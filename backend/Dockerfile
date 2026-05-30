# ============================================================
# 阶段 1: 构建（装依赖 + 预下载 embedding 模型）
# ============================================================
FROM python:3.12.10-slim-bookworm AS builder

COPY --from=ghcr.io/astral-sh/uv:0.7.21 /uv /usr/local/bin/uv

WORKDIR /app

# 安装系统依赖（sentence-transformers 需要）
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc g++ && \
    rm -rf /var/lib/apt/lists/*

# 装 Python 依赖（利用 BuildKit cache mount 加速）
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

# ============================================================
# 阶段 1b: dev 构建（包含 dev 依赖，用于本地开发热重载）
# ============================================================
FROM builder AS dev

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project

# 预下载 BGE 中文向量模型（避免首次请求等很久）
# 国内部署可取消注释下面这行用镜像加速:
# ENV HF_ENDPOINT=https://hf-mirror.com
RUN .venv/bin/python3 -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-small-zh-v1.5')"

# ============================================================
# 阶段 2: 运行
# ============================================================
FROM python:3.12.10-slim-bookworm AS runtime

WORKDIR /app

# 安装 curl（HEALTHCHECK 需要）
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# 创建非 root 用户
RUN groupadd -r appuser && useradd -r -g appuser -u 1001 appuser

# 复制 venv 和预下载模型
COPY --from=builder /app/.venv .venv
COPY --from=builder /root/.cache/huggingface /home/appuser/.cache/huggingface

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
