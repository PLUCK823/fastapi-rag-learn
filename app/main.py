"""FastAPI 应用入口"""

from pathlib import Path

from fastapi import FastAPI

from app.api.routes import router
from app.core.config import CHROMA_DIR
from app.services.ingest import ingest_documents

app = FastAPI(title="RAG 学习项目", version="0.1.0")
app.include_router(router)


@app.on_event("startup")
def startup():
    """首次启动时自动摄取文档"""
    if not CHROMA_DIR.exists() or not list(Path(CHROMA_DIR).iterdir()):
        ingest_documents()
