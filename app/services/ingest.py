"""文档摄取服务 — 按用户隔离存储"""

from pathlib import Path

from langchain_community.document_loaders import TextLoader
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.core.config import CHUNK_OVERLAP, CHUNK_SIZE, DOCUMENTS_DIR
from app.core.engine import get_vectorstore


def ingest_from_file(file_path: str, user_id: int) -> int:
    """将上传文件切块存入指定用户的向量库，返回块数"""
    loader = TextLoader(file_path, encoding="utf-8")
    docs = loader.load()
    return _ingest_docs(docs, user_id)


def ingest_text(content: str, filename: str, user_id: int) -> int:
    """将文本内容切块存入指定用户的向量库，返回块数"""
    doc = Document(page_content=content, metadata={"source": filename})
    return _ingest_docs([doc], user_id)


def ingest_from_directory(docs_dir: str | Path | None = None) -> tuple[int, int]:
    """全局摄取（保留向后兼容，不关联用户）"""
    if docs_dir is None:
        docs_dir = DOCUMENTS_DIR

    files = list(Path(docs_dir).glob("*.txt")) + list(Path(docs_dir).glob("*.md"))
    if not files:
        print(f"在 {docs_dir}/ 下没找到 .txt 或 .md 文件，跳过")
        return 0, 0

    all_docs: list[Document] = []
    for f in files:
        loader = TextLoader(str(f), encoding="utf-8")
        all_docs.extend(loader.load())

    splitter = _build_splitter()
    chunks = splitter.split_documents(all_docs)

    vs = get_vectorstore(0)  # 全局文档存到 user_0 下
    vs.add_documents(chunks)
    return len(all_docs), len(chunks)


def _build_splitter() -> RecursiveCharacterTextSplitter:
    return RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", "。", ".", " "],
    )


def _ingest_docs(docs: list[Document], user_id: int) -> int:
    splitter = _build_splitter()
    chunks = splitter.split_documents(docs)
    vectorstore = get_vectorstore(user_id)
    vectorstore.add_documents(chunks)
    print(f"用户 {user_id} 摄取: {len(docs)} 个文档 → {len(chunks)} 个文本块")
    return len(chunks)
