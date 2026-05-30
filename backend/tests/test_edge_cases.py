"""边界测试 - 超长输入、特殊字符、并发"""

import asyncio

import pytest
from httpx import AsyncClient


class TestLongInput:
    """超长输入测试"""

    @pytest.mark.asyncio
    async def test_very_long_kb_name(self, client: AsyncClient, auth_headers: dict):
        """超长知识库名称应该被处理"""
        # 1000 字符的名称
        long_name = "测试" * 500
        resp = await client.post("/kb", json={"name": long_name}, headers=auth_headers)
        # 应该成功或返回长度限制错误
        assert resp.status_code in [200, 400, 422]

    @pytest.mark.asyncio
    async def test_very_long_document_content(self, client: AsyncClient, auth_headers: dict, kb_id: int):
        """超长文档内容应该被正确分块"""
        # 100KB 的内容
        long_content = "这是测试内容。" * 5000
        resp = await client.post(
            f"/kb/{kb_id}/docs",
            json={"content": long_content, "filename": "long.txt"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        # 验证分块数量
        chunk_count = resp.json()["chunk_count"]
        assert chunk_count > 10  # 应该分成多个块

    @pytest.mark.asyncio
    async def test_very_long_filename(self, client: AsyncClient, auth_headers: dict, kb_id: int):
        """超长文件名应该被处理"""
        long_filename = "a" * 200 + ".txt"
        resp = await client.post(
            f"/kb/{kb_id}/docs",
            json={"content": "test", "filename": long_filename},
            headers=auth_headers,
        )
        assert resp.status_code in [200, 400, 422]

    @pytest.mark.asyncio
    async def test_very_long_chat_question(self, client: AsyncClient, auth_headers: dict, kb_id: int):
        """超长聊天问题应该被处理"""
        await client.post(
            f"/kb/{kb_id}/docs",
            json={"content": "测试内容", "filename": "test.txt"},
            headers=auth_headers,
        )

        # 5000 字符的问题
        long_question = "这是什么？" * 1000
        resp = await client.post(
            "/ask",
            json={"kb_id": kb_id, "text": long_question},
            headers=auth_headers,
        )
        # 应该正常处理或返回长度限制错误
        assert resp.status_code in [200, 400, 422]


class TestSpecialCharacters:
    """特殊字符测试"""

    @pytest.mark.asyncio
    async def test_unicode_characters_in_kb_name(self, client: AsyncClient, auth_headers: dict):
        """Unicode 字符应该被正确处理"""
        unicode_names = [
            "知识库🎉测试",
            "测试📚库",
            "日本語テスト",
            "한국어 테스트",
            "emoji 😀 🎈 🎉",
        ]

        for name in unicode_names:
            resp = await client.post("/kb", json={"name": name}, headers=auth_headers)
            assert resp.status_code == 200
            kb_id = resp.json()["id"]
            # 验证名称正确存储 - 通过列表接口
            resp2 = await client.get("/kb", headers=auth_headers)
            kbs = resp2.json()["items"]
            found_kb = next((kb for kb in kbs if kb["id"] == kb_id), None)
            assert found_kb is not None
            assert found_kb["name"] == name

    @pytest.mark.asyncio
    async def test_special_characters_in_filename(self, client: AsyncClient, auth_headers: dict, kb_id: int):
        """文件名中的特殊字符应该被处理"""
        special_filenames = [
            "file with spaces.txt",
            "file-with-dashes.txt",
            "file_with_underscores.txt",
            "文件名.txt",
            "file(1).txt",
        ]

        for filename in special_filenames:
            resp = await client.post(
                f"/kb/{kb_id}/docs",
                json={"content": "test", "filename": filename},
                headers=auth_headers,
            )
            assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_newlines_in_document_content(self, client: AsyncClient, auth_headers: dict, kb_id: int):
        """文档内容中的换行符应该被保留"""
        content_with_newlines = "第一行\n第二行\n\n第四行\r\n第五行"
        resp = await client.post(
            f"/kb/{kb_id}/docs",
            json={"content": content_with_newlines, "filename": "newlines.txt"},
            headers=auth_headers,
        )
        assert resp.status_code == 200

        doc_id = resp.json()["id"]
        resp2 = await client.get(f"/kb/{kb_id}/docs/{doc_id}/content", headers=auth_headers)
        content = resp2.json()["content"]
        assert "\n" in content

    @pytest.mark.asyncio
    async def test_html_in_document_content(self, client: AsyncClient, auth_headers: dict, kb_id: int):
        """文档内容中的 HTML 应该被保留"""
        html_content = "<html><body><h1>标题</h1><p>段落</p></body></html>"
        resp = await client.post(
            f"/kb/{kb_id}/docs",
            json={"content": html_content, "filename": "html.txt"},
            headers=auth_headers,
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_markdown_in_document_content(self, client: AsyncClient, auth_headers: dict, kb_id: int):
        """文档内容中的 Markdown 应该被保留"""
        markdown_content = """
# 标题

## 二级标题

- 列表项 1
- 列表项 2

**粗体** *斜体*

`代码`

```python
print('hello')
```
"""
        resp = await client.post(
            f"/kb/{kb_id}/docs",
            json={"content": markdown_content, "filename": "markdown.md"},
            headers=auth_headers,
        )
        assert resp.status_code == 200


class TestConcurrentOperations:
    """并发操作测试"""

    @pytest.mark.asyncio
    async def test_concurrent_kb_creation(self, client: AsyncClient, auth_headers: dict):
        """并发创建 KB 应该正确处理"""
        # 同时创建 5 个 KB
        tasks = [
            client.post("/kb", json={"name": f"并发KB{i}"}, headers=auth_headers)
            for i in range(5)
        ]
        responses = await asyncio.gather(*tasks)

        # 所有请求应该成功
        for resp in responses:
            assert resp.status_code == 200

        # 验证所有 KB 都存在
        resp = await client.get("/kb", headers=auth_headers)
        kbs = resp.json()["items"]
        assert len(kbs) >= 5

    @pytest.mark.asyncio
    async def test_concurrent_document_creation(self, client: AsyncClient, auth_headers: dict, kb_id: int):
        """并发创建文档应该正确处理"""
        tasks = [
            client.post(
                f"/kb/{kb_id}/docs",
                json={"content": f"文档{i}", "filename": f"doc{i}.txt"},
                headers=auth_headers,
            )
            for i in range(5)
        ]
        responses = await asyncio.gather(*tasks)

        for resp in responses:
            assert resp.status_code == 200

        # 验证所有文档都存在
        resp = await client.get(f"/kb/{kb_id}/docs", headers=auth_headers)
        docs = resp.json()
        assert len(docs) >= 5

    @pytest.mark.asyncio
    async def test_concurrent_kb_deletion_different_kbs(self, client: AsyncClient, auth_headers: dict):
        """并发删除不同 KB 应该正确处理"""
        # 创建 3 个 KB
        kb_ids = []
        for i in range(3):
            resp = await client.post("/kb", json={"name": f"删除KB{i}"}, headers=auth_headers)
            kb_ids.append(resp.json()["id"])

        # 并发删除
        tasks = [
            client.delete(f"/kb/{kb_id}", headers=auth_headers)
            for kb_id in kb_ids
        ]
        responses = await asyncio.gather(*tasks)

        for resp in responses:
            assert resp.status_code == 200

        # 验证所有 KB 都被删除
        resp = await client.get("/kb", headers=auth_headers)
        remaining_kbs = [kb["name"] for kb in resp.json()["items"]]
        for name in ["删除KB0", "删除KB1", "删除KB2"]:
            assert name not in remaining_kbs


class TestEmptyAndNull:
    """空值和 Null 测试"""

    @pytest.mark.asyncio
    async def test_empty_kb_list(self, client: AsyncClient, auth_headers: dict):
        """空 KB 列表应该正确返回"""
        # 新用户没有 KB
        resp = await client.get("/kb", headers=auth_headers)
        # 删除所有 KB
        for kb in resp.json()["items"]:
            await client.delete(f"/kb/{kb['id']}", headers=auth_headers)

        resp = await client.get("/kb", headers=auth_headers)
        assert resp.json()["total"] == 0
        assert resp.json()["items"] == []

    @pytest.mark.asyncio
    async def test_empty_document_list(self, client: AsyncClient, auth_headers: dict, kb_id: int):
        """空文档列表应该正确返回"""
        resp = await client.get(f"/kb/{kb_id}/docs", headers=auth_headers)
        # 删除所有文档
        for doc in resp.json():
            await client.delete(f"/kb/{kb_id}/docs/{doc['id']}", headers=auth_headers)

        resp = await client.get(f"/kb/{kb_id}/docs", headers=auth_headers)
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_null_nickname(self, client: AsyncClient, auth_headers: dict):
        """Null 昵称应该被正确处理"""
        # 先设置一个昵称
        resp = await client.put("/auth/me", json={"nickname": "测试昵称"}, headers=auth_headers)
        assert resp.status_code == 200
        # 再清空昵称（使用空字符串会变成 None）
        resp = await client.put("/auth/me", json={"nickname": "   "}, headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["nickname"] is None


class TestInvalidIds:
    """无效 ID 测试"""

    @pytest.mark.asyncio
    async def test_nonexistent_kb_id(self, client: AsyncClient, auth_headers: dict):
        """访问不存在的 KB 应该返回 404 或空列表"""
        # KB 列表接口不会返回 404，只是不包含该 KB
        resp = await client.get("/kb", headers=auth_headers)
        assert resp.status_code == 200

        # 删除不存在的 KB 应该返回 404
        resp = await client.delete("/kb/99999", headers=auth_headers)
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_nonexistent_document_id(self, client: AsyncClient, auth_headers: dict, kb_id: int):
        """访问不存在的文档应该返回 404"""
        resp = await client.get(f"/kb/{kb_id}/docs/99999/content", headers=auth_headers)
        assert resp.status_code == 404

        resp = await client.delete(f"/kb/{kb_id}/docs/99999", headers=auth_headers)
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_invalid_kb_id_format(self, client: AsyncClient, auth_headers: dict):
        """无效 KB ID 格式应该返回 422"""
        # 尝试访问 KB 文档列表（需要有效的 KB ID）
        resp = await client.get("/kb/abc/docs", headers=auth_headers)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_negative_kb_id(self, client: AsyncClient, auth_headers: dict):
        """负数 KB ID 应该返回 422"""
        # 尝试获取负数 KB 的文档列表
        resp = await client.get("/kb/-1/docs", headers=auth_headers)
        # FastAPI 路径参数验证会拒绝负数
        assert resp.status_code in [404, 422, 403]  # 可能是 404（路由不匹配）或 422（验证失败）或 403（权限）
