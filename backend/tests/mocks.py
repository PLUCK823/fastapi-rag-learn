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
from dataclasses import dataclass
from unittest.mock import MagicMock, patch

import pytest
from langchain_core.documents import Document
from qdrant_client import models

# 固定维度（Qwen3-Embedding-0.6B 输出 1024 维）
EMBEDDING_DIM = 1024

# 假文档（用于 mock retriever 返回）
_FAKE_DOCS = [
    Document(
        id="0",
        page_content="这是测试文档内容",
        metadata={"document_id": 1, "document_name": "test.md", "chunk_index": 0},
    ),
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
        if "汽车" in prompt and any(term in prompt for term in ["交通工具", "发动机", "驱动"]):
            mock.content = "汽车是一种交通工具，由发动机驱动。"
        elif "苹果" in prompt and any(term in prompt for term in ["水果", "维生素", "消化"]):
            mock.content = "苹果是一种水果，富含维生素 C。"
        elif "Python" in prompt and any(
            term in prompt for term in ["编程语言", "Web 开发", "适合"]
        ):
            mock.content = "Python 是一门编程语言，广泛用于 Web 开发、数据分析、人工智能等领域。"
        elif "考勤补卡" in prompt or "补卡次数" in prompt:
            mock.content = (
                "根据《智能办公系统使用规范与功能说明》，员工每月允许补卡次数最多为 3 次。"
            )
        elif "采购" in prompt and "总经理" in prompt:
            mock.content = "根据公司规范，单笔金额超过 5000 元的采购需要总经理终审。"
        elif any(word in prompt for word in ["这是什么", "测试文档", "总结"]):
            mock.content = "这是一份测试文档，包含了相关的规范说明和业务数据。"
        else:
            mock.content = self.canned_response
        return mock

    def stream(self, prompt: str) -> Iterator[MagicMock]:
        for token in self.stream_tokens:
            mock = MagicMock()
            mock.content = token
            yield mock


@dataclass
class FakePoint:
    id: int | str
    payload: dict


class FakeRetriever:
    def __init__(self, vectorstore: "FakeVectorStore"):
        self.vectorstore = vectorstore

    def invoke(self, query: str) -> list[Document]:
        docs = self.vectorstore.documents()
        if docs:
            return docs
        return _FAKE_DOCS


class FakeQdrantClient:
    def __init__(self):
        self.collections: dict[str, dict[int | str, FakePoint]] = {}

    def collection_exists(self, collection_name: str) -> bool:
        return collection_name in self.collections

    def create_collection(self, collection_name: str, **kwargs) -> None:
        self.collections.setdefault(collection_name, {})

    def delete_collection(self, collection_name: str) -> None:
        self.collections.pop(collection_name, None)

    def get_collections(self):
        return MagicMock(collections=list(self.collections))

    def count(self, collection_name: str, count_filter=None, **kwargs):
        points = self._filtered_points(collection_name, count_filter)
        return MagicMock(count=len(points))

    def scroll(
        self,
        collection_name: str,
        limit: int = 1000,
        offset: int | str | None = None,
        scroll_filter=None,
        with_payload: bool = True,
        with_vectors: bool = False,
        **kwargs,
    ):
        del with_vectors
        points = self._filtered_points(collection_name, scroll_filter)
        start = int(offset) if offset is not None else 0
        page = points[start : start + limit]
        next_offset = start + limit if start + limit < len(points) else None
        if not with_payload:
            page = [FakePoint(id=p.id, payload={}) for p in page]
        return page, next_offset

    def delete(self, collection_name: str, points_selector=None, **kwargs) -> None:
        collection = self.collections.setdefault(collection_name, {})
        if isinstance(points_selector, models.PointIdsList):
            for point_id in points_selector.points:
                collection.pop(point_id, None)
            return
        if isinstance(points_selector, models.FilterSelector):
            for point in self._filtered_points(collection_name, points_selector.filter):
                collection.pop(point.id, None)

    def upsert_documents(
        self,
        collection_name: str,
        docs: list[Document],
        ids: list[int | str],
    ) -> None:
        collection = self.collections.setdefault(collection_name, {})
        for doc_id, doc in zip(ids, docs):
            collection[doc_id] = FakePoint(
                id=doc_id,
                payload={
                    "page_content": doc.page_content,
                    "metadata": doc.metadata,
                },
            )

    def _filtered_points(self, collection_name: str, qdrant_filter) -> list[FakePoint]:
        points = list(self.collections.setdefault(collection_name, {}).values())
        if qdrant_filter is None:
            return sorted(points, key=lambda p: str(p.id))
        document_id = self._document_id_from_filter(qdrant_filter)
        if document_id is None:
            return sorted(points, key=lambda p: str(p.id))
        return [
            p
            for p in sorted(points, key=lambda p: str(p.id))
            if p.payload.get("metadata", {}).get("document_id") == document_id
        ]

    @staticmethod
    def _document_id_from_filter(qdrant_filter) -> int | None:
        conditions = getattr(qdrant_filter, "must", None) or []
        for condition in conditions:
            if getattr(condition, "key", None) != "metadata.document_id":
                continue
            match = getattr(condition, "match", None)
            value = getattr(match, "value", None)
            return int(value) if value is not None else None
        return None


class FakeVectorStore:
    """假向量库，返回预设文档"""

    def __init__(self, client: FakeQdrantClient, kb_id: int):
        self.client = client
        self.collection_name = f"kb_{kb_id}"
        self.client.create_collection(self.collection_name)

    def as_retriever(self, **kwargs):
        return FakeRetriever(self)

    def add_documents(self, docs, **kwargs):
        ids = kwargs.get("ids") or [f"pt_{i}" for i in range(len(docs))]
        self.client.upsert_documents(self.collection_name, docs, ids)
        return ids

    def delete(self, **kwargs):
        pass

    def documents(self) -> list[Document]:
        points, _ = self.client.scroll(self.collection_name, limit=1000)
        return [
            Document(
                id=str(p.id),
                page_content=p.payload.get("page_content", ""),
                metadata=p.payload.get("metadata", {}),
            )
            for p in points
        ]


@contextmanager
def mock_engine_init():
    """Patch engine 使用假模型 + 假向量库，避免加载真实模型和连接 Qdrant"""
    import app.core.engine as engine_mod
    import app.services.knowledge_base as kb_service_mod

    fake_client = FakeQdrantClient()

    def fake_vectorstore(kb_id: int) -> FakeVectorStore:
        return FakeVectorStore(fake_client, kb_id)

    with (
        patch.object(engine_mod, "_embeddings", FakeEmbeddings()),
        patch.object(engine_mod, "_llm", FakeLLM()),
        patch.object(engine_mod, "_initialized", True),
        patch.object(
            engine_mod,
            "_get_kb_vectorstore",
            side_effect=fake_vectorstore,
        ),
        patch.object(
            engine_mod,
            "_get_qdrant_client",
            return_value=fake_client,
        ),
        patch("app.core.engine.get_vectorstore", side_effect=fake_vectorstore),
        patch.object(kb_service_mod, "get_vectorstore", side_effect=fake_vectorstore),
        patch("app.core.engine._get_embedding_dim", return_value=1024),
    ):
        yield


@pytest.fixture
def mock_engine():
    """Pytest fixture: patch engine 使用假模型"""
    with mock_engine_init():
        yield
