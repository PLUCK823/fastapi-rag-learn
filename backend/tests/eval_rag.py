"""RAG 检索质量评估脚本

用法:
    cd backend && uv run python tests/eval_rag.py

依赖:
    需要后端服务运行在 http://localhost:8000
    脚本自动创建测试 KB、上传示例文档、运行评估、清理
"""

from __future__ import annotations

import os
import sys
import time
from typing import Any

import requests

BASE_URL = os.getenv("RAG_EVAL_BASE_URL", "http://localhost:8000")

# ── 测试文档（自动生成含表格、列表、数值的 Markdown） ──

TEST_DOC = """# 公司 2024 年度财报摘要

## 收入概况

| 季度 | 收入（万元） | 利润（万元） | 增长率 |
|------|-------------|-------------|--------|
| Q1   | 1,200       | 240         | 12%    |
| Q2   | 1,450       | 310         | 20.8%  |
| Q3   | 1,680       | 380         | 15.9%  |
| Q4   | 2,100       | 520         | 25%    |

全年总收入为 **6,430 万元**，全年总利润为 **1,450 万元**。

## 产品线分析

### 云计算服务
- 收入占比：45%
- 客户数：320 家
- 客单价：9.0 万元/年
- 续约率：87%

### 数据安全产品
- 收入占比：30%
- 客户数：180 家
- 客单价：10.7 万元/年
- 续约率：92%

### AI 解决方案
- 收入占比：25%
- 客户数：95 家
- 客单价：16.9 万元/年
- 续约率：78%

## 员工信息

截止 2024 年 12 月 31 日，公司在职员工共计 **486 人**。其中：

- 研发团队：210 人（43.2%）
- 销售团队：128 人（26.3%）
- 运维支持：85 人（17.5%）
- 管理行政：63 人（13.0%）

人均产值为 **13.23 万元/人**。

## 市场分布

| 区域 | 客户数 | 收入贡献 |
|------|--------|---------|
| 华东  | 210    | 38%     |
| 华南  | 155    | 28%     |
| 华北  | 140    | 22%     |
| 西部  | 90     | 12%     |

## 重要事项

1. 2024 年 3 月完成 A 轮融资，金额 5,000 万元
2. 2024 年 7 月通过 ISO 27001 信息安全认证
3. 2024 年 10 月与华为云达成战略合作
4. 2024 年 12 月启动 B 轮融资筹备

本公司不涉及任何区块链、元宇宙或 Web3 相关业务。
"""

# ── 评估用例 ──

EVAL_CASES: list[dict[str, Any]] = [
    # ── 事实查询 ──
    {
        "query": "公司全年总收入是多少？",
        "expected_in_answer": ["6,430", "6430"],
        "expected_source_contains": ["6,430"],
        "type": "事实查询",
    },
    {
        "query": "研发团队有多少人？",
        "expected_in_answer": ["210"],
        "expected_source_contains": ["210"],
        "type": "事实查询",
    },
    {
        "query": "云计算服务的续约率是多少？",
        "expected_in_answer": ["87%"],
        "expected_source_contains": ["87%"],
        "type": "事实查询",
    },
    # ── 数值计算 ──
    {
        "query": "全年总利润除以总收入，利润率是多少？",
        "expected_in_answer": ["22.5", "22.54"],
        "expected_source_contains": ["1,450", "6,430"],
        "type": "数值计算",
    },
    {
        "query": "Q4 比 Q1 收入增长了多少万元？",
        "expected_in_answer": ["900"],
        "expected_source_contains": ["2,100", "1,200"],
        "type": "数值计算",
    },
    # ── 表格分析 ──
    {
        "query": "哪个季度的利润率最高？",
        "expected_in_answer": ["Q4"],
        "expected_source_contains": ["Q4", "520"],
        "type": "表格分析",
    },
    {
        "query": "华东和华南两个区域加起来贡献了多少收入？",
        "expected_in_answer": ["66%"],
        "expected_source_contains": ["38%", "28%"],
        "type": "表格分析",
    },
    # ── 否定回答 ──
    {
        "query": "公司有没有涉及区块链业务？",
        "expected_in_answer": ["没有", "不涉及", "不知道"],
        "expected_source_contains": ["不涉及"],
        "type": "否定回答",
    },
]

# ── 工具函数 ──


def register(email: str, password: str) -> str:
    """注册并登录，返回 access_token"""
    # 注册（可能已存在，忽略错误）
    requests.post(
        f"{BASE_URL}/auth/register",
        json={"email": email, "password": password},
    )
    # 登录
    resp = requests.post(
        f"{BASE_URL}/auth/login",
        data={"username": email, "password": password},
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def create_kb(token: str, name: str) -> int:
    resp = requests.post(
        f"{BASE_URL}/kb",
        json={"name": name},
        headers={"Authorization": f"Bearer {token}"},
    )
    resp.raise_for_status()
    return resp.json()["id"]


def upload_md(token: str, kb_id: int, filename: str, content: str) -> int:
    resp = requests.post(
        f"{BASE_URL}/kb/{kb_id}/upload",
        files={"file": (filename, content.encode("utf-8"), "text/markdown")},
        headers={"Authorization": f"Bearer {token}"},
    )
    resp.raise_for_status()
    data = resp.json()
    doc_id = data["doc_id"]
    # Wait for async processing
    if not data.get("sync"):
        _poll_until_ready(token, kb_id, doc_id, timeout=30)
    return doc_id


def _poll_until_ready(token: str, kb_id: int, doc_id: int, timeout: int = 30) -> None:
    for _ in range(timeout):
        resp = requests.get(
            f"{BASE_URL}/kb/{kb_id}/docs",
            headers={"Authorization": f"Bearer {token}"},
        )
        docs = resp.json()
        for d in docs:
            if d["id"] == doc_id and d["status"] == "ready":
                return
        time.sleep(1)
    print(f"  ⚠️  Document {doc_id} did not reach 'ready' status within {timeout}s")


def ask(token: str, kb_id: int, question: str) -> dict[str, Any]:
    resp = requests.post(
        f"{BASE_URL}/ask",
        json={"kb_id": kb_id, "text": question},
        headers={"Authorization": f"Bearer {token}"},
    )
    resp.raise_for_status()
    return resp.json()


def check_hit_rate(case: dict, answer: str, sources: list[dict]):
    """Check if expected source content appears in retrieved sources"""
    expected = case.get("expected_source_contains", [])
    if not expected:
        return True  # no source expectation → counted as hit
    source_text = " ".join(s.get("snippet", "") for s in sources)
    return any(term.lower() in source_text.lower() for term in expected)


def check_generation(case: dict, answer: str) -> bool:
    """Check if answer contains expected info"""
    expected = case.get("expected_in_answer", [])
    if not expected:
        return True
    return any(term.lower() in answer.lower() for term in expected)


def cleanup(token: str, kb_id: int):
    requests.delete(
        f"{BASE_URL}/kb/{kb_id}",
        headers={"Authorization": f"Bearer {token}"},
    )


# ── 主流程 ──


def main():
    print("=" * 60)
    print("RAG 检索质量评估")
    print("=" * 60)

    # 准备
    print("\n📦 准备测试环境...")
    token = register("eval_test@rag.local", "evalpass123")
    kb_id = create_kb(token, "评估测试库")
    print(f"  KB ID: {kb_id}")

    print("  📄 上传测试文档...")
    upload_md(token, kb_id, "财报2024.md", TEST_DOC)
    print("  ✅ 文档已就绪\n")

    # 评估
    total = len(EVAL_CASES)
    retrieval_hits = 0
    gen_ok = 0
    reciprocal_ranks: list[float] = []

    print(f"🔍 运行 {total} 条评估用例...\n")

    for i, case in enumerate(EVAL_CASES, 1):
        query = case["query"]
        qtype = case["type"]

        try:
            result = ask(token, kb_id, query)
            answer = result.get("answer", "")
            sources = result.get("sources", [])

            # Hit Rate: 期望的源内容是否在检索结果中
            hit = check_hit_rate(case, answer, sources)
            if hit:
                retrieval_hits += 1

            # MRR: 第一个命中的源在结果中的排名
            expected_terms = case.get("expected_source_contains", [])
            first_hit_rank = 0
            for rank, s in enumerate(sources, 1):
                snippet = s.get("snippet", "")
                if any(t.lower() in snippet.lower() for t in expected_terms):
                    first_hit_rank = rank
                    break
            reciprocal_ranks.append(1.0 / first_hit_rank if first_hit_rank > 0 else 0.0)

            # Generation: 答案是否包含期望信息
            gen_pass = check_generation(case, answer)
            if gen_pass:
                gen_ok += 1

            status = "✅" if (hit and gen_pass) else "⚠️"
            print(f"  [{i:2d}/{total}] {status} {qtype}: {query[:40]}...")

        except Exception as e:
            print(f"  [{i:2d}/{total}] ❌ {qtype}: {query[:40]}... → {e}")

    # 报告
    hit_rate = retrieval_hits / total * 100 if total > 0 else 0
    mrr = sum(reciprocal_ranks) / len(reciprocal_ranks) if reciprocal_ranks else 0
    gen_acc = gen_ok / total * 100 if total > 0 else 0

    print(f"\n{'=' * 60}")
    print("📊 评估报告")
    print(f"{'=' * 60}")
    print(f"  Hit Rate@k:      {hit_rate:.1f}%  ({retrieval_hits}/{total})")
    print(f"  MRR:             {mrr:.3f}")
    print(f"  Gen Accuracy:    {gen_acc:.1f}%  ({gen_ok}/{total})")
    print(f"{'=' * 60}")

    # 清理
    print("\n🧹 清理测试数据...")
    cleanup(token, kb_id)
    print("  ✅ 完成\n")

    # 退出码
    if hit_rate < 50 or gen_acc < 50:
        print("❌ 评估不达标")
        sys.exit(1)
    print("✅ 评估通过")
    sys.exit(0)


if __name__ == "__main__":
    main()
