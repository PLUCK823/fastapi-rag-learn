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
_DEFAULT_DATABASE_URL = "postgresql+asyncpg://raguser:devpassword@localhost:5432/raglearn"
DATABASE_URL = os.getenv("DATABASE_URL", _DEFAULT_DATABASE_URL)
if DATABASE_URL == _DEFAULT_DATABASE_URL:
    import warnings
    warnings.warn(
        "DATABASE_URL is using the default value. "
        "Set DATABASE_URL in production to a secure value.",
        RuntimeWarning,
    )

# 用户认证 — 生产环境必须通过环境变量设置
_SECRET_KEY = os.getenv("SECRET_KEY")
if not _SECRET_KEY:
    raise ValueError(
        "SECRET_KEY environment variable is required. "
        "Generate one with: python -c 'import secrets; print(secrets.token_urlsafe(32))'"
    )
SECRET_KEY = _SECRET_KEY

# 密码重置/验证令牌使用独立密钥（若未单独设置，通过 HKDF 从 SECRET_KEY 派生，
# 确保即使 JWT 密钥泄露也不会直接暴露密码重置令牌）
_RESET_TOKEN_SECRET = os.getenv("RESET_TOKEN_SECRET")
if _RESET_TOKEN_SECRET:
    RESET_TOKEN_SECRET = _RESET_TOKEN_SECRET
else:
    import hashlib
    RESET_TOKEN_SECRET = hashlib.sha256(
        SECRET_KEY.encode() + b":reset-token-v1"
    ).hexdigest()

# LLM
LLM_MODEL = os.getenv("LLM_MODEL", "deepseek-chat")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL")

# Embedding — 支持两种模式：
#   "local" = HuggingFace 本地模型（默认，无需 API）
#   "api"   = OpenAI-compatible Embedding API
# API 模式默认复用 LLM 的 OPENAI_API_KEY / OPENAI_BASE_URL，
# 也可单独指定 EMBEDDING_API_KEY / EMBEDDING_BASE_URL（如 LLM 和 Embedding 不同服务商）
EMBEDDING_PROVIDER = os.getenv("EMBEDDING_PROVIDER", "local")
EMBEDDING_API_MODEL = os.getenv("EMBEDDING_API_MODEL", "BAAI/bge-large-zh-v1.5")
EMBEDDING_API_KEY = os.getenv("EMBEDDING_API_KEY")  # 未设置则 fallback 到 OPENAI_API_KEY
EMBEDDING_BASE_URL = os.getenv("EMBEDDING_BASE_URL")  # 未设置则 fallback 到 OPENAI_BASE_URL

# Reranker（精排）— 支持两种模式：
#   "local" = HuggingFace 本地 CrossEncoder
#   "api"   = SiliconFlow / Jina 兼容的 /v1/rerank API
# API 模式默认复用 EMBEDDING_API_KEY / EMBEDDING_BASE_URL
RERANKER_PROVIDER = os.getenv("RERANKER_PROVIDER", "local")
RERANKER_API_MODEL = os.getenv("RERANKER_API_MODEL", "BAAI/bge-reranker-v2-m3")
RERANKER_API_KEY = os.getenv("RERANKER_API_KEY")  # fallback → EMBEDDING_API_KEY → OPENAI_API_KEY
# RERANKER_BASE_URL fallback → EMBEDDING_BASE_URL → OPENAI_BASE_URL
RERANKER_BASE_URL = os.getenv("RERANKER_BASE_URL")
RERANKER_TOP_K = 5  # 精排后保留的 chunk 数
RERANKER_CANDIDATE_K = 20  # 进入精排的候选数（RRF 后取 top-N 送入 reranker）

# 向量库 — Qdrant（独立容器部署，gRPC 连接）
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6334")

# 文本切分
CHUNK_SIZE = 800
CHUNK_OVERLAP = 120

# 嵌入批次大小 — 控制单次向量化的 chunk 数量，避免大文档 OOM 且实现细粒度进度
EMBEDDING_BATCH_SIZE = 200

# 检索
RETRIEVAL_K = 8

# CORS 配置
CORS_ALLOW_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:5173").split(",")
    if o.strip()
]
CORS_ALLOW_METHODS = [
    m.strip() for m in os.getenv("CORS_ALLOW_METHODS", "GET,POST,PUT,DELETE,OPTIONS").split(",")
]
CORS_ALLOW_HEADERS = [
    h.strip() for h in os.getenv("CORS_ALLOW_HEADERS", "*").split(",")
]

# Rate Limiting
RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "60"))
RATE_LIMIT_PERIOD = int(os.getenv("RATE_LIMIT_PERIOD", "60"))

# Redis
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
