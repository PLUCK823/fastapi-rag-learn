"""输入校验相关测试"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_kb_empty_name_fails(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/kb", json={"name": "  "}, headers=auth_headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_rename_kb_empty_name_fails(client: AsyncClient, auth_headers: dict, kb_id: int):
    resp = await client.put(f"/kb/{kb_id}", json={"name": ""}, headers=auth_headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_add_document_empty_content_fails(
    client: AsyncClient, auth_headers: dict, kb_id: int
):
    resp = await client.post(
        f"/kb/{kb_id}/docs",
        json={"content": "  ", "filename": "test.txt"},
        headers=auth_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_add_document_empty_filename_fails(
    client: AsyncClient, auth_headers: dict, kb_id: int
):
    resp = await client.post(
        f"/kb/{kb_id}/docs",
        json={"content": "hello", "filename": ""},
        headers=auth_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_update_document_empty_content_fails(
    client: AsyncClient, auth_headers: dict, kb_id: int
):
    resp = await client.put(
        f"/kb/{kb_id}/docs/999",
        json={"content": ""},
        headers=auth_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_ask_empty_question_fails(client: AsyncClient, auth_headers: dict, kb_id: int):
    resp = await client.post("/ask", json={"kb_id": kb_id, "text": "  "}, headers=auth_headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_change_password_short_fails(client: AsyncClient, auth_headers: dict):
    resp = await client.put(
        "/auth/me/password",
        json={"old_password": "anything", "new_password": "ab"},
        headers=auth_headers,
    )
    assert resp.status_code == 422
