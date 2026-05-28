"""FastAPI 应用入口"""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.auth import router as auth_router
from app.api.routes import router
from app.core.database import Base, engine


@asynccontextmanager
async def lifespan(_app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="RAG 学习项目", version="0.1.0", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(router)
