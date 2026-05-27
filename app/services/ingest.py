"""文档摄取服务"""

from pathlib import Path

from langchain_community.document_loaders import TextLoader
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.core.config import CHROMA_DIR, CHUNK_OVERLAP, CHUNK_SIZE, DOCUMENTS_DIR
from app.core.engine import get_vectorstore


def ingest_documents(docs_dir: str | Path | None = None) -> tuple[int, int]:
    """把文本文件切成块存入向量库，返回 (文件数, 块数)"""
    if docs_dir is None:
        docs_dir = DOCUMENTS_DIR

    txt_files = list(Path(docs_dir).glob("*.txt"))
    if not txt_files:
        print(f"在 {docs_dir}/ 下没找到 .txt 文件，跳过")
        return 0, 0

    all_docs: list[Document] = []
    for f in txt_files:
        loader = TextLoader(str(f), encoding="utf-8")
        all_docs.extend(loader.load())

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", "。", ".", " "],
    )
    chunks = splitter.split_documents(all_docs)

    vectorstore = get_vectorstore()
    vectorstore.add_documents(chunks)
    print(f"摄取完成: {len(all_docs)} 个文件 → {len(chunks)} 个文本块")
    return len(all_docs), len(chunks)
