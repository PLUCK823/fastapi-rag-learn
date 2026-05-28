"""认证相关测试"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_and_login(client: AsyncClient):
    """注册新用户，然后登录获取 token"""
    email = "user1@test.com"
    password = "securepass123"

    # 注册
    resp = await client.post(
        "/auth/register",
        json={"email": email, "password": password},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == email
    assert "id" in data

    # 登录
    resp = await client.post(
        "/auth/login",
        data={"username": email, "password": password},
    )
    assert resp.status_code == 200
    token_data = resp.json()
    assert "access_token" in token_data
    assert token_data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_ask_without_token_returns_401(client: AsyncClient):
    """未认证的请求应返回 401"""
    resp = await client.post("/ask", json={"text": "什么是 Python？"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_ask_with_token_returns_200(client: AsyncClient, auth_headers: dict):
    """认证后的请求应正常返回"""
    resp = await client.post(
        "/ask",
        json={"text": "什么是 Python？"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "question" in data
    assert "answer" in data


@pytest.mark.asyncio
async def test_register_duplicate_email_fails(client: AsyncClient):
    """重复邮箱注册应返回 400"""
    email = "dup@test.com"
    await client.post(
        "/auth/register",
        json={"email": email, "password": "pass123456"},
    )
    resp = await client.post(
        "/auth/register",
        json={"email": email, "password": "pass123456"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_login_wrong_password_fails(client: AsyncClient):
    """错误密码登录应返回 400"""
    email = "wrongpass@test.com"
    await client.post(
        "/auth/register",
        json={"email": email, "password": "rightpass123"},
    )
    resp = await client.post(
        "/auth/login",
        data={"username": email, "password": "wrongpassword"},
    )
    assert resp.status_code == 400
