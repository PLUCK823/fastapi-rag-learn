"""FastAPI 应用入口"""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.auth import router as auth_router
from app.api.knowledge_base import router as kb_router
from app.api.routes import router
from app.core.database import Base, sync_engine


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(sync_engine)
    yield


app = FastAPI(title="RAG 学习项目", version="0.2.0", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(kb_router)
app.include_router(router)
