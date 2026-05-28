"""Pydantic 请求/响应模型"""

from datetime import datetime

from pydantic import BaseModel

# ── Ask ──

class AskRequest(BaseModel):
    kb_id: int
    text: str


class SourceInfo(BaseModel):
    index: int
    document_id: int
    document_name: str
    snippet: str


class AskResponse(BaseModel):
    question: str
    answer: str
    sources: list[SourceInfo]


# ── Knowledge Base ──

class KBCreateRequest(BaseModel):
    name: str


class KBRenameRequest(BaseModel):
    name: str


class KBInfo(BaseModel):
    id: int
    name: str
    document_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class KBDeleteResponse(BaseModel):
    message: str
    deleted_document_count: int


# ── Document ──

class DocCreateRequest(BaseModel):
    content: str
    filename: str = "untitled.txt"


class DocUpdateRequest(BaseModel):
    content: str


class DocInfo(BaseModel):
    id: int
    filename: str
    chunk_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class KBDetail(KBInfo):
    documents: list[DocInfo]
