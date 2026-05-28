"""知识库 + 文档管理 + 答案溯源测试"""

import pytest
from httpx import AsyncClient

# ── KB CRUD ──

@pytest.mark.asyncio
async def test_create_and_list_kb(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/kb", json={"name": "我的知识库"}, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "我的知识库"
    assert data["document_count"] == 0
    kb_id = data["id"]

    resp = await client.get("/kb", headers=auth_headers)
    assert resp.status_code == 200
    kbs = resp.json()
    assert len(kbs) == 1
    assert kbs[0]["id"] == kb_id


@pytest.mark.asyncio
async def test_rename_kb(client: AsyncClient, auth_headers: dict, kb_id: int):
    resp = await client.put(f"/kb/{kb_id}", json={"name": "重命名后的知识库"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "重命名后的知识库"


@pytest.mark.asyncio
async def test_duplicate_kb_name_fails(client: AsyncClient, auth_headers: dict):
    await client.post("/kb", json={"name": "唯一的"}, headers=auth_headers)
    resp = await client.post("/kb", json={"name": "唯一的"}, headers=auth_headers)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_delete_kb(client: AsyncClient, auth_headers: dict, kb_id: int):
    resp = await client.delete(f"/kb/{kb_id}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "已删除" in data["message"]
    assert data["deleted_document_count"] == 0

    resp = await client.get("/kb", headers=auth_headers)
    assert len(resp.json()) == 0


@pytest.mark.asyncio
async def test_delete_kb_cascades_docs(
    client: AsyncClient, auth_headers: dict, kb_id: int
):
    await client.post(
        f"/kb/{kb_id}/docs",
        json={"content": "Hello world", "filename": "test.txt"},
        headers=auth_headers,
    )
    resp = await client.delete(f"/kb/{kb_id}", headers=auth_headers)
    assert resp.json()["deleted_document_count"] == 1


# ── Document CRUD ──

@pytest.mark.asyncio
async def test_add_and_list_docs(client: AsyncClient, auth_headers: dict, kb_id: int):
    resp = await client.post(
        f"/kb/{kb_id}/docs",
        json={"content": "Python 是一门编程语言。", "filename": "python.txt"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["filename"] == "python.txt"
    assert data["chunk_count"] > 0
    doc_id = data["id"]

    resp = await client.get(f"/kb/{kb_id}/docs", headers=auth_headers)
    assert resp.status_code == 200
    docs = resp.json()
    assert len(docs) == 1
    assert docs[0]["id"] == doc_id


@pytest.mark.asyncio
async def test_duplicate_doc_name_fails(client: AsyncClient, auth_headers: dict, kb_id: int):
    await client.post(
        f"/kb/{kb_id}/docs",
        json={"content": "Hello", "filename": "readme.txt"},
        headers=auth_headers,
    )
    resp = await client.post(
        f"/kb/{kb_id}/docs",
        json={"content": "World", "filename": "readme.txt"},
        headers=auth_headers,
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_update_document(client: AsyncClient, auth_headers: dict, kb_id: int):
    resp = await client.post(
        f"/kb/{kb_id}/docs",
        json={"content": "原始内容", "filename": "doc.txt"},
        headers=auth_headers,
    )
    doc_id = resp.json()["id"]
    old_chunks = resp.json()["chunk_count"]

    resp = await client.put(
        f"/kb/{kb_id}/docs/{doc_id}",
        json={"content": "修改后的全新内容。" * 100},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    new_chunks = resp.json()["chunk_count"]
    assert new_chunks > old_chunks


@pytest.mark.asyncio
async def test_delete_document(client: AsyncClient, auth_headers: dict, kb_id: int):
    resp = await client.post(
        f"/kb/{kb_id}/docs",
        json={"content": "要被删除的文档", "filename": "trash.txt"},
        headers=auth_headers,
    )
    doc_id = resp.json()["id"]

    resp = await client.delete(
        f"/kb/{kb_id}/docs/{doc_id}", headers=auth_headers
    )
    assert resp.status_code == 200

    resp = await client.get(f"/kb/{kb_id}/docs", headers=auth_headers)
    assert len(resp.json()) == 0


# ── Ask with sources ──

@pytest.mark.asyncio
async def test_ask_returns_sources(client: AsyncClient, auth_headers: dict, kb_id: int):
    await client.post(
        f"/kb/{kb_id}/docs",
        json={
            "content": "苹果是一种水果，富含维生素 C。苹果可以帮助消化。",
            "filename": "apple.txt",
        },
        headers=auth_headers,
    )

    resp = await client.post(
        "/ask",
        json={"kb_id": kb_id, "text": "苹果是什么？"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "answer" in data
    assert len(data["sources"]) > 0
    assert data["sources"][0]["document_name"] == "apple.txt"
    assert data["sources"][0]["index"] >= 1


# ── Cross-KB isolation ──

@pytest.mark.asyncio
async def test_cross_kb_isolation(client: AsyncClient, auth_headers: dict):
    # 创建两个知识库
    resp_a = await client.post("/kb", json={"name": "KB-A"}, headers=auth_headers)
    kb_a = resp_a.json()["id"]
    resp_b = await client.post("/kb", json={"name": "KB-B"}, headers=auth_headers)
    kb_b = resp_b.json()["id"]

    # KB-A 存苹果，KB-B 存汽车
    await client.post(
        f"/kb/{kb_a}/docs",
        json={"content": "苹果是一种常见的水果，富含维生素。", "filename": "apple.txt"},
        headers=auth_headers,
    )
    await client.post(
        f"/kb/{kb_b}/docs",
        json={"content": "汽车是一种交通工具，由发动机驱动。", "filename": "car.txt"},
        headers=auth_headers,
    )

    # 在 KB-A 中问汽车 → 不应该知道
    resp = await client.post(
        "/ask",
        json={"kb_id": kb_a, "text": "汽车是什么？"},
        headers=auth_headers,
    )
    answer = resp.json()["answer"]
    assert "交通" not in answer and "发动机" not in answer

    # 在 KB-B 中问汽车 → 应该知道
    resp = await client.post(
        "/ask",
        json={"kb_id": kb_b, "text": "汽车是什么？"},
        headers=auth_headers,
    )
    answer = resp.json()["answer"]
    assert "交通" in answer or "发动机" in answer or "驱动" in answer


# ── Cross-user isolation ──

@pytest.mark.asyncio
async def test_cross_user_kb_isolation(client: AsyncClient):
    # 用户 A
    await client.post(
        "/auth/register",
        json={"email": "a@test.com", "password": "pass123456"},
    )
    resp = await client.post(
        "/auth/login",
        data={"username": "a@test.com", "password": "pass123456"},
    )
    headers_a = {"Authorization": f"Bearer {resp.json()['access_token']}"}

    # 用户 B
    await client.post(
        "/auth/register",
        json={"email": "b@test.com", "password": "pass123456"},
    )
    resp = await client.post(
        "/auth/login",
        data={"username": "b@test.com", "password": "pass123456"},
    )
    headers_b = {"Authorization": f"Bearer {resp.json()['access_token']}"}

    # 用户 A 创建 KB
    resp = await client.post("/kb", json={"name": "A的库"}, headers=headers_a)
    kb_a = resp.json()["id"]

    # 用户 B 尝试删除用户 A 的 KB → 403
    resp = await client.delete(f"/kb/{kb_a}", headers=headers_b)
    assert resp.status_code == 403
