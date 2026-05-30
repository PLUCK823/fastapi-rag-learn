# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project structure

Monorepo: `backend/` (FastAPI) + `frontend/` (React + Vite).

```
backend/                        frontend/
├── app/                        ├── src/
│   ├── main.py                 │   ├── api/         # axios + API functions
│   ├── api/                    │   ├── components/  # AppLayout
│   │   ├── auth.py             │   ├── hooks/       # useChatWS
│   │   ├── knowledge_base.py   │   ├── pages/       # Login, KBList, Chat
│   │   └── routes.py           │   ├── router/      # react-router + auth guard
│   ├── core/                   │   ├── stores/      # Zustand (authStore)
│   │   ├── config.py           │   ├── types/       # TS interfaces
│   │   ├── database.py         │   ├── App.tsx
│   │   ├── engine.py           │   └── main.tsx
│   │   └── auth.py             ├── biome.json
│   ├── models/                 ├── vitest.config.ts
│   └── services/               └── package.json
├── tests/
├── pyproject.toml
└── uv.lock
```

## Commands

### Backend

```bash
cd backend
uv sync                                          # install deps
uv run ruff check --fix . && uv run mypy app/    # lint + type-check
uv run pytest tests/ -v                          # run tests
uv run uvicorn app.main:app --reload --port 8000 # dev server
```

### Frontend

```bash
cd frontend
npm install                                      # install deps
npx biome check --fix src/                      # lint + format
npx tsc --noEmit                                 # type-check
npx vitest run                                   # run tests
npm run dev                                      # dev server (port 5173)
```

## Development workflow (必须遵守)

每次新增/修改功能时，严格按以下流程操作：

1. **改前提交** — `git add -A && git commit -m "..."` 保存当前状态
2. **实现功能** — 编写/修改代码
3. **校验（后端）** — `cd backend && uv run ruff check --fix . && uv run mypy app/`
4. **校验（前端）** — `cd frontend && npx biome check --fix src/ && npx tsc --noEmit`
5. **单元测试** — 后端 `uv run pytest tests/ -v`，前端 `npx vitest run`，全部通过。不允许假测试（如 `assert True`）
6. **E2E UI测试** — 启动服务后运行 `npx playwright test`，验证完整用户流程
7. **改后提交** — `git add -A && git commit -m "..."` 保存本次改动

### E2E 测试启动命令

```bash
# 启动后端（在 backend 目录）
uv run uvicorn app.main:app --port 8000 --host 127.0.0.1

# 启动前端（在 frontend 目录）
npm run dev

# 运行 E2E 测试（在 frontend 目录）
npx playwright test --reporter=list
```

## Architecture

### Backend: RAG pipeline (FastAPI + LangGraph + ChromaDB)

- `engine.py` — two-node LangGraph: retrieve (BGE embeddings → ChromaDB) → generate (LLM with `[N]` inline citations)
- Lazy init: embeddings (~100MB) and LLM load only on first call
- ChromaDB per knowledge base: `kb_{kb_id}` collections
- Dual SQLAlchemy engine: async (for fastapi-users auth) + sync (for KB CRUD, avoids greenlet issues)
- LLM: DeepSeek via OpenAI-compatible API, swappable in `.env`

### Frontend: React 19 + Vite + TypeScript + Tailwind

- State: Zustand (authStore)
- Router: react-router-dom with AuthGuard (checks localStorage token)
- Streaming: WebSocket `ws://host/ws/{kbId}?token=xxx` via useChatWS hook
- Styling: Tailwind CSS (utility-first, no component lib)
- API: axios instance with JWT interceptor + 401 redirect

## Testing conventions

### Backend (pytest)
- `httpx.AsyncClient` + `ASGITransport` for endpoint tests
- Sync engine for test DB (avoids greenlet)
- Tables dropped/recreated per test via `Base.metadata.drop_all/create_all`
- Mock LLM/embedding external calls in unit tests

### Frontend (Vitest + React Testing Library)
- `jsdom` environment with localStorage polyfill in setupTests.ts
- MSW (Mock Service Worker) for API mocking at network level
- Test user behavior (clicks, typing), not implementation details
- `@testing-library/jest-dom` for DOM assertions

### E2E (Playwright)
- 每个测试使用独立用户（避免数据冲突）
- `--workers=1` 避免 SQLite 数据库锁定
- 测试完整用户流程（注册 → KB → 文档 → 聊天）

## 测试流程规则（必须遵守）

**按改动影响范围分层测试，不全量跑。**

### 三级测试策略

| 层级 | 何时跑 | 耗时 | 范围 |
|------|--------|------|------|
| **L1 — 快速校验** | 每次改动后 | ~5s | lint + type-check（只跑改动的端） |
| **L2 — 相关单元测试** | L1 通过后 | ~20s | 与改动相关的后端 + 前端单元测试 |
| **L3 — 完整链路冒烟** | L2 通过后 | ~15s | 一条完整 E2E 链路 |

### 改动 → 测试映射

| 改动范围 | L1 校验 | L2 相关单元测试 | L3 冒烟 |
|----------|---------|----------------|---------|
| 仅后端代码 | `ruff + mypy` | 相关的后端 test_*.py | `smoke.spec.ts` |
| 仅前端代码 | `biome + tsc` | 相关的前端 *.test.* | `smoke.spec.ts` |
| 前后端都改 | 两边都跑 | 相关的后端 + 前端 | `smoke.spec.ts` |

### L2 按模块选择测试文件

```
改了 backend/app/core/engine.py     → test_knowledge_base.py + test_error_handling.py
改了 backend/app/api/routes.py      → test_knowledge_base.py + test_websocket.py
改了 backend/app/api/knowledge_base.py → test_knowledge_base.py + test_features.py
改了 backend/app/api/auth.py        → test_auth.py + test_profile.py
改了 backend/app/services/          → test_knowledge_base.py
改了 backend/app/core/auth.py       → test_auth.py + test_security.py
改了 frontend 页面组件              → 对应的 Page.test.tsx
改了 frontend hooks                 → 对应的 hook.test.ts
改了 frontend stores                → authStore.test.ts
改了 frontend api/                  → 受影响的 Page.test.tsx
```

### 执行命令

```bash
# L1 — 快速校验
cd backend && uv run ruff check --fix . && uv run mypy app/    # 后端
cd frontend && npx biome check --fix src/ && ./node_modules/.bin/tsc --noEmit  # 前端

# L2 — 相关单元测试（示例）
cd backend && uv run pytest tests/test_knowledge_base.py tests/test_error_handling.py -v
cd frontend && npx vitest run src/pages/ChatPage.test.tsx

# L3 — 完整链路冒烟
# 先启动服务（两个终端窗口），然后：
cd frontend && npx playwright test smoke.spec.ts --reporter=list --workers=1
```

### L3 完整链路覆盖

`smoke.spec.ts` 覆盖一条完整的用户流程：

```
注册 → 登录 → 创建知识库 → 上传文档 → 重命名 KB → RAG 问答 → 登出
```

如果改动涉及**会话（session）**，L3 需额外加跑 `session.spec.ts`。

### 测试修复原则

1. **优先修复代码** — 测试失败通常意味着代码有 bug
2. **其次修复测试** — 如果测试本身有问题（如 selector 不匹配）
3. **保持测试真实性** — 不允许假测试（如 `assert True`）
4. **L2 → L3 顺序** — L2 全部通过后才进入 L3；L3 失败时修复后重新 L3

### 最终验收标准

- ✅ L1 lint + type-check 无错误
- ✅ L2 相关单元测试 100% 通过（后端 + 前端）
- ✅ L3 完整链路冒烟 100% 通过
- ✅ 无假测试（每个测试都有实际验证逻辑）

## Skills (全局)

编写或重构前端代码时，**必须**遵循以下两个全局 Skill：

- **`vercel-react-best-practices`** — Vercel 官方 React 性能优化（70 条规则，8 大类别：消除瀑布流、Bundle 优化、服务端性能、重渲染优化、渲染性能、JS 性能等）
- **`frontend-design`** — Anthropic 官方 UI 设计规范，禁止通用 AI 审美（Inter/Roboto 字体、紫色渐变白底等），要求独特的字体、色彩、空间构图

每次写前端代码前，先参考 vercel-react-best-practices 检查性能模式，再参考 frontend-design 确定视觉方向。
