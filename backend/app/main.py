"""FastAPI 应用入口"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.knowledge_base import router as kb_router
from app.api.routes import router
from app.core.config import CORS_ALLOW_HEADERS, CORS_ALLOW_METHODS, CORS_ALLOW_ORIGINS
from app.core.database import Base, sync_engine
from app.core.rate_limit import RateLimitMiddleware


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(sync_engine)
    yield


app = FastAPI(title="RAG 学习项目", version="0.2.0", lifespan=lifespan)

# Rate limiting middleware (applied first, before CORS)
app.add_middleware(RateLimitMiddleware)

# CORS middleware for production deployment
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=CORS_ALLOW_METHODS,
    allow_headers=CORS_ALLOW_HEADERS,
)

app.include_router(auth_router)
app.include_router(kb_router)
app.include_router(router)
