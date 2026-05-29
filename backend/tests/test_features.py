"""文档重命名、文件上传、分页测试"""

from io import BytesIO

import pytest
from httpx import AsyncClient

# ── Document rename ──


@pytest.mark.asyncio
async def test_rename_document(client: AsyncClient, auth_headers: dict, kb_id: int):
    # 创建文档
    resp = await client.post(
        f"/kb/{kb_id}/docs",
        json={"content": "hello world", "filename": "old.txt"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    doc_id = resp.json()["id"]

    # 重命名
    resp = await client.put(
        f"/kb/{kb_id}/docs/{doc_id}/rename",
        json={"filename": "new.txt"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["filename"] == "new.txt"

    # 列表验证
    resp = await client.get(f"/kb/{kb_id}/docs", headers=auth_headers)
    assert resp.json()[0]["filename"] == "new.txt"


@pytest.mark.asyncio
async def test_rename_document_duplicate_fails(
    client: AsyncClient, auth_headers: dict, kb_id: int
):
    await client.post(
        f"/kb/{kb_id}/docs",
        json={"content": "aaa", "filename": "a.txt"},
        headers=auth_headers,
    )
    resp = await client.post(
        f"/kb/{kb_id}/docs",
        json={"content": "bbb", "filename": "b.txt"},
        headers=auth_headers,
    )
    doc_b_id = resp.json()["id"]

    # 把 b.txt 改成 a.txt → 冲突
    resp = await client.put(
        f"/kb/{kb_id}/docs/{doc_b_id}/rename",
        json={"filename": "a.txt"},
        headers=auth_headers,
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_rename_document_empty_filename_fails(
    client: AsyncClient, auth_headers: dict, kb_id: int
):
    resp = await client.put(
        f"/kb/{kb_id}/docs/999/rename",
        json={"filename": "  "},
        headers=auth_headers,
    )
    assert resp.status_code == 422


# ── File upload ──


@pytest.mark.asyncio
async def test_upload_txt_file(client: AsyncClient, auth_headers: dict, kb_id: int):
    content = b"Hello, this is a test file for RAG.\nIt has multiple lines.\n"
    resp = await client.post(
        f"/kb/{kb_id}/upload",
        files={"file": ("test.txt", BytesIO(content), "text/plain")},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["filename"] == "test.txt"
    assert data["chunk_count"] > 0


@pytest.mark.asyncio
async def test_upload_md_file(client: AsyncClient, auth_headers: dict, kb_id: int):
    content = b"# Title\n\nSome markdown **content** here."
    resp = await client.post(
        f"/kb/{kb_id}/upload",
        files={"file": ("readme.md", BytesIO(content), "text/markdown")},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["filename"] == "readme.md"


@pytest.mark.asyncio
async def test_upload_unsupported_type_fails(
    client: AsyncClient, auth_headers: dict, kb_id: int
):
    resp = await client.post(
        f"/kb/{kb_id}/upload",
        files={"file": ("image.png", BytesIO(b"\x89PNG"), "image/png")},
        headers=auth_headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_upload_duplicate_filename_fails(
    client: AsyncClient, auth_headers: dict, kb_id: int
):
    content = b"test"
    resp = await client.post(
        f"/kb/{kb_id}/upload",
        files={"file": ("dup.txt", BytesIO(content), "text/plain")},
        headers=auth_headers,
    )
    assert resp.status_code == 200

    resp = await client.post(
        f"/kb/{kb_id}/upload",
        files={"file": ("dup.txt", BytesIO(content), "text/plain")},
        headers=auth_headers,
    )
    assert resp.status_code == 409


# ── Pagination ──


@pytest.mark.asyncio
async def test_kb_pagination(client: AsyncClient, auth_headers: dict):
    # 创建 3 个 KB
    for i in range(3):
        await client.post("/kb", json={"name": f"kb-{i}"}, headers=auth_headers)

    # 每页 2 个
    resp = await client.get("/kb?page=1&page_size=2", headers=auth_headers)
    assert resp.status_code == 200
    page1 = resp.json()
    assert len(page1) == 2

    resp = await client.get("/kb?page=2&page_size=2", headers=auth_headers)
    page2 = resp.json()
    assert len(page2) == 1


@pytest.mark.asyncio
async def test_docs_pagination(client: AsyncClient, auth_headers: dict, kb_id: int):
    # 创建 3 个文档
    for i in range(3):
        await client.post(
            f"/kb/{kb_id}/docs",
            json={"content": f"doc-{i}", "filename": f"d{i}.txt"},
            headers=auth_headers,
        )

    resp = await client.get(
        f"/kb/{kb_id}/docs?page=1&page_size=2", headers=auth_headers
    )
    assert len(resp.json()) == 2


@pytest.mark.asyncio
async def test_messages_pagination(client: AsyncClient, auth_headers: dict, kb_id: int):
    # 添加文档并提问以创建消息
    await client.post(
        f"/kb/{kb_id}/docs",
        json={"content": "Python is a programming language.", "filename": "p.txt"},
        headers=auth_headers,
    )
    await client.post(
        "/ask",
        json={"kb_id": kb_id, "text": "what is Python?"},
        headers=auth_headers,
    )

    resp = await client.get(
        f"/kb/{kb_id}/messages?page=1&page_size=1", headers=auth_headers
    )
    assert len(resp.json()) == 1
