"""Mock LLM 和 Embedding 对象，避免单元测试加载真实模型。
用法：
    from tests.mocks import mock_engine_init

    @pytest.fixture(autouse=True)
    def _mock_engine():
        with mock_engine_init():
            yield
"""

from collections.abc import Iterator
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

import pytest
from langchain_core.documents import Document

# 固定维度（Qwen3-Embedding-0.6B 输出 1024 维）
EMBEDDING_DIM = 1024

# 假文档（用于 mock retriever 返回）
_FAKE_DOCS = [
    Document(id="0", page_content="这是测试文档内容", metadata={"document_id": 1, "document_name": "test.md", "chunk_index": 0}),
]


class FakeEmbeddings:
    """返回零向量的假 Embedding，不加载任何模型"""

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [[0.0] * EMBEDDING_DIM for _ in texts]

    def embed_query(self, text: str) -> list[float]:
        return [0.0] * EMBEDDING_DIM


class FakeLLM:
    """返回固定回答的假 LLM，不调用任何 API。"""

    canned_response: str = "这是模拟的 RAG 回答。"
    stream_tokens: list[str] = ["这", "是", "模", "拟", "的", "流", "式", "回", "答", "。"]

    def invoke(self, prompt: str) -> MagicMock:
        mock = MagicMock()
        mock.content = self.canned_response
        return mock

    def stream(self, prompt: str) -> Iterator[MagicMock]:
        for token in self.stream_tokens:
            mock = MagicMock()
            mock.content = token
            yield mock


class FakeRetriever:
    def invoke(self, query: str) -> list[Document]:
        return _FAKE_DOCS


class FakeVectorStore:
    """假向量库，返回预设文档"""
    client = MagicMock()
    retriever = FakeRetriever()

    def as_retriever(self, **kwargs):
        return FakeRetriever()

    def add_documents(self, docs, **kwargs):
        return [f"pt_{i}" for i in range(len(docs))]

    def delete(self, **kwargs):
        pass


@contextmanager
def mock_engine_init():
    """Patch engine 使用假模型 + 假向量库，避免加载真实模型和连接 Qdrant"""
    import app.core.engine as engine_mod

    fake_vs = FakeVectorStore()
    with (
        patch.object(engine_mod, "_embeddings", FakeEmbeddings()),
        patch.object(engine_mod, "_llm", FakeLLM()),
        patch.object(engine_mod, "_initialized", True),
        patch.object(engine_mod, "_get_kb_vectorstore", return_value=fake_vs),
        patch.object(engine_mod, "_get_qdrant_client", return_value=fake_vs.client),
        patch("app.core.engine.get_vectorstore", return_value=fake_vs),
        patch("app.core.engine._scroll_all_docs", return_value=([], [], [])),
    ):
        yield


@pytest.fixture
def mock_engine():
    """Pytest fixture: patch engine 使用假模型"""
    with mock_engine_init():
        yield
