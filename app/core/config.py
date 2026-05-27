"""集中管理所有配置"""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# 项目根目录（app/ 的上一级）
ROOT_DIR = Path(__file__).parent.parent.parent

# LLM
LLM_MODEL = os.getenv("LLM_MODEL", "deepseek-chat")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL")

# Embedding
EMBEDDING_MODEL = "text-embedding-3-small"

# 向量库
CHROMA_DIR = ROOT_DIR / "chroma_db"

# 文档目录
DOCUMENTS_DIR = ROOT_DIR / "documents"

# 文本切分
CHUNK_SIZE = 300
CHUNK_OVERLAP = 50

# 检索
RETRIEVAL_K = 3
