"""集中管理所有配置"""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# 项目根目录（app/ 的上一级）
ROOT_DIR = Path(__file__).parent.parent.parent

# 用户认证
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-in-production")
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{ROOT_DIR}/app.db")

# LLM
LLM_MODEL = os.getenv("LLM_MODEL", "deepseek-chat")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL")

# Embedding（本地模型，无需 API key）
EMBEDDING_MODEL = "BAAI/bge-small-zh-v1.5"

# 向量库
CHROMA_DIR = ROOT_DIR / "chroma_db"

# 文档目录
DOCUMENTS_DIR = ROOT_DIR / "documents"

# 文本切分
CHUNK_SIZE = 300
CHUNK_OVERLAP = 50

# 检索
RETRIEVAL_K = 3

# CORS 配置（生产部署需要）
# 允许的来源，多个用逗号分隔，例如: "http://localhost:5173,https://example.com"
CORS_ALLOW_ORIGINS = os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:5173").split(",")
CORS_ALLOW_METHODS = os.getenv("CORS_ALLOW_METHODS", "GET,POST,PUT,DELETE,OPTIONS").split(",")
CORS_ALLOW_HEADERS = os.getenv("CORS_ALLOW_HEADERS", "*").split(",")

# Rate Limiting（防止 API 过度调用）
RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "60"))  # 每分钟最大请求数
RATE_LIMIT_PERIOD = int(os.getenv("RATE_LIMIT_PERIOD", "60"))  # 秒
