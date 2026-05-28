"""Pydantic 请求/响应模型"""

from pydantic import BaseModel


class AskRequest(BaseModel):
    text: str


class AskResponse(BaseModel):
    question: str
    answer: str


class IngestResponse(BaseModel):
    message: str
    file_count: int
    chunk_count: int


class IngestTextRequest(BaseModel):
    content: str
    filename: str = "untitled.txt"
