"""Pydantic 请求/响应模型"""

from datetime import datetime
from typing import TypeVar

from pydantic import BaseModel, Field, field_validator

T = TypeVar("T")

# ── Ask ──


class AskRequest(BaseModel):
    kb_id: int
    text: str
    session_id: str | None = None  # 可选，传入则注入会话历史实现多轮对话

    @field_validator("text")
    @classmethod
    def text_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("问题不能为空")
        return v.strip()


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
    name: str = Field(min_length=1, max_length=255)

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("知识库名称不能为空")
        return v.strip()


class KBRenameRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("知识库名称不能为空")
        return v.strip()


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

    @field_validator("content")
    @classmethod
    def content_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("文档内容不能为空")
        return v

    @field_validator("filename")
    @classmethod
    def filename_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("文件名不能为空")
        return v.strip()


class DocRenameRequest(BaseModel):
    filename: str

    @field_validator("filename")
    @classmethod
    def filename_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("文件名不能为空")
        return v.strip()


class DocUpdateRequest(BaseModel):
    content: str

    @field_validator("content")
    @classmethod
    def content_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("文档内容不能为空")
        return v


class DocInfo(BaseModel):
    id: int
    filename: str
    chunk_count: int
    status: str = "pending"
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class KBDetail(KBInfo):
    documents: list[DocInfo]


# ── Chat ──


class MessageInfo(BaseModel):
    id: int
    role: str
    content: str
    session_id: str | None = None
    sources: list[SourceInfo] | None = None
    feedback: bool | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SessionInfo(BaseModel):
    session_id: str
    first_question: str
    message_count: int
    created_at: datetime
    updated_at: datetime


# ── Pagination ──


class PaginationParams:
    """可复用的分页参数依赖"""

    def __init__(self, page: int = 1, page_size: int = 20):
        self.page = max(1, page)
        self.page_size = min(max(1, page_size), 100)


class PaginatedResponse[T](BaseModel):
    """分页响应基类"""

    items: list[T]
    total: int
    page: int
    page_size: int
    total_pages: int


# ── Profile ──


class ProfileResponse(BaseModel):
    id: int
    email: str
    nickname: str | None = None


class NicknameRequest(BaseModel):
    nickname: str


class PasswordChangeRequest(BaseModel):
    old_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_not_empty(cls, v: str) -> str:
        if not v.strip() or len(v.strip()) < 6:
            raise ValueError("新密码至少需要6个字符")
        return v.strip()

    @field_validator("old_password")
    @classmethod
    def old_password_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("原密码不能为空")
        return v


# ── Task / Async ──


class TaskInfo(BaseModel):
    task_id: str
    status: str  # pending | chunking | embedding | storing | done | failed
    progress: int = 0  # 0-100
    message: str = ""
    result: dict | None = None


class BatchDeleteRequest(BaseModel):
    doc_ids: list[int] = Field(min_length=1, max_length=500)


class BatchDeleteResponse(BaseModel):
    deleted_count: int

