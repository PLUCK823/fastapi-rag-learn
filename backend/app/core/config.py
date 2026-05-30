"""集中管理所有配置"""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# 项目根目录（app/ 的上一级）
ROOT_DIR = Path(__file__).parent.parent.parent

# 数据库 URL — 默认 PostgreSQL
# 本地开发: postgresql+asyncpg://raguser:devpassword@localhost:5432/raglearn
# Docker:   postgresql+asyncpg://raguser:${DB_PASSWORD}@db:5432/raglearn
# SQLite:   sqlite+aiosqlite:///./app.db（需要时手动设置）
_DEFAULT_DB_URL = "postgresql+asyncpg://raguser:devpassword@localhost:5432/raglearn"
DATABASE_URL = os.getenv("DATABASE_URL", _DEFAULT_DB_URL)

IS_POSTGRES = DATABASE_URL.startswith("postgresql")

# 用户认证
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-in-production")

# LLM
LLM_MODEL = os.getenv("LLM_MODEL", "deepseek-chat")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL")

# Embedding（本地模型，无需 API key）
EMBEDDING_MODEL = "BAAI/bge-small-zh-v1.5"

# 向量库
CHROMA_DIR = ROOT_DIR / "chroma_db"

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
