"""文档摄取与用户隔离测试"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_ingest_text_success(client: AsyncClient, auth_headers: dict):
    """上传文本内容入库成功"""
    resp = await client.post(
        "/ingest/text",
        json={"content": "Python 是一门编程语言，用于 Web 开发、数据分析等领域。"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["chunk_count"] > 0
    assert data["file_count"] == 1


@pytest.mark.asyncio
async def test_ingest_text_without_token_returns_401(client: AsyncClient):
    """未认证上传请求应返回 401"""
    resp = await client.post(
        "/ingest/text",
        json={"content": "test content", "filename": "test.txt"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_user_document_isolation(client: AsyncClient):
    """用户 A 的文档不应被用户 B 检索到"""

    # 注册两个用户
    for email in ("usera@test.com", "userb@test.com"):
        await client.post(
            "/auth/register",
            json={"email": email, "password": "pass123456"},
        )

    # 登录用户 A
    resp_a = await client.post(
        "/auth/login",
        data={"username": "usera@test.com", "password": "pass123456"},
    )
    token_a = resp_a.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # 登录用户 B
    resp_b = await client.post(
        "/auth/login",
        data={"username": "userb@test.com", "password": "pass123456"},
    )
    token_b = resp_b.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 用户 A 上传关于"苹果"的文档
    await client.post(
        "/ingest/text",
        json={"content": "苹果是一种常见的水果，富含维生素 C。", "filename": "apple.txt"},
        headers=headers_a,
    )

    # 用户 B 上传关于"汽车"的文档
    await client.post(
        "/ingest/text",
        json={"content": "汽车是一种交通工具，由发动机驱动。", "filename": "car.txt"},
        headers=headers_b,
    )

    # 用户 A 问关于汽车的，应该不知道（因为只有苹果的文档）
    resp_a_car = await client.post(
        "/ask",
        json={"text": "汽车是什么？"},
        headers=headers_a,
    )
    assert resp_a_car.status_code == 200
    answer_a = resp_a_car.json()["answer"]
    # 用户 A 不应该知道汽车相关内容
    assert "交通" not in answer_a and "发动机" not in answer_a and "驱动" not in answer_a

    # 用户 B 问关于汽车的，应该知道
    resp_b_car = await client.post(
        "/ask",
        json={"text": "汽车是什么？"},
        headers=headers_b,
    )
    assert resp_b_car.status_code == 200
    answer_b = resp_b_car.json()["answer"]

    # 用户 B 应该能回答汽车相关的问题
    assert "交通" in answer_b or "发动机" in answer_b or "驱动" in answer_b
