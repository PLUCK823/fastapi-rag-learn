"""集中管理所有配置"""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# 项目根目录（app/ 的上一级）
ROOT_DIR = Path(__file__).parent.parent.parent

# 数据库 — PostgreSQL
# 本地: postgresql+asyncpg://raguser:devpassword@localhost:5432/raglearn
# Docker: postgresql+asyncpg://raguser:${DB_PASSWORD}@db:5432/raglearn
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://raguser:devpassword@localhost:5432/raglearn",
)

# 用户认证
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-in-production")

# LLM
LLM_MODEL = os.getenv("LLM_MODEL", "deepseek-chat")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL")

# Embedding（本地模型，无需 API key）
# Qwen3-Embedding-0.6B — C-MTEB ~71，1024d，Apache 2.0
# 注：Youtu-Embedding (C-MTEB #1) 需要 transformers 4.x，与当前 5.x 不兼容
EMBEDDING_MODEL = "Qwen/Qwen3-Embedding-0.6B"

# Reranker（精排）— Qwen3-Reranker-4B，当前最强免费 cross-encoder
RERANKER_MODEL = "Qwen/Qwen3-Reranker-4B"
RERANKER_TOP_K = 5  # 精排后保留的 chunk 数
RERANKER_CANDIDATE_K = 20  # 进入精排的候选数（RRF 后取 top-N 送入 reranker）

# 向量库 — Qdrant（独立容器部署，gRPC 连接）
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6334")

# 文本切分
CHUNK_SIZE = 800
CHUNK_OVERLAP = 120

# 检索
RETRIEVAL_K = 8

# CORS 配置
CORS_ALLOW_ORIGINS = os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:5173").split(",")
CORS_ALLOW_METHODS = os.getenv("CORS_ALLOW_METHODS", "GET,POST,PUT,DELETE,OPTIONS").split(",")
CORS_ALLOW_HEADERS = os.getenv("CORS_ALLOW_HEADERS", "*").split(",")

# Rate Limiting
RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "60"))
RATE_LIMIT_PERIOD = int(os.getenv("RATE_LIMIT_PERIOD", "60"))

# Redis
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
