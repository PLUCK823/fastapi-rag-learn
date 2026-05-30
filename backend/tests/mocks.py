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

# 固定维度（BGE-small-zh 输出 512 维）
EMBEDDING_DIM = 512


class FakeEmbeddings:
    """返回零向量的假 Embedding，不加载任何模型"""

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [[0.0] * EMBEDDING_DIM for _ in texts]

    def embed_query(self, text: str) -> list[float]:
        return [0.0] * EMBEDDING_DIM


class FakeLLM:
    """返回固定回答的假 LLM，不调用任何 API。

    Attributes:
        canned_response: invoke() 返回的内容
        stream_tokens: stream() 逐 token 返回的列表
    """

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


@contextmanager
def mock_engine_init():
    """Patch engine._init_shared() 使用假模型，避免加载真实模型。

    使用方式：
        with mock_engine_init():
            # 测试代码
    """
    import app.core.engine as engine_mod

    with (
        patch.object(engine_mod, "_embeddings", FakeEmbeddings()),
        patch.object(engine_mod, "_llm", FakeLLM()),
        patch.object(engine_mod, "_initialized", True),
    ):
        yield


@pytest.fixture
def mock_engine():
    """Pytest fixture: patch engine 使用假模型"""
    with mock_engine_init():
        yield
