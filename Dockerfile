# ============================================================
# 阶段 1: 构建（装依赖 + 预下载 embedding 模型）
# ============================================================
FROM python:3.12-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# 装依赖
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# 预下载 BGE 中文向量模型（避免首次请求等很久）
# 国内部署可取消注释下面这行用镜像加速:
# ENV HF_ENDPOINT=https://hf-mirror.com
RUN .venv/bin/python3 -c "
from sentence_transformers import SentenceTransformer
SentenceTransformer('BAAI/bge-small-zh-v1.5')
"

# ============================================================
# 阶段 2: 运行
# ============================================================
FROM python:3.12-slim AS runtime

WORKDIR /app

# 依赖
COPY --from=builder /app/.venv .venv

# 预下载好的模型
COPY --from=builder /root/.cache/huggingface /root/.cache/huggingface

# 应用代码
COPY app/ ./app/
COPY documents/ ./documents/

ENV PATH="/app/.venv/bin:$PATH"

VOLUME ["/app/chroma_db"]

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
