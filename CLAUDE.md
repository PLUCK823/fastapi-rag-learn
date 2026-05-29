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

完成测试任务时，严格按以下流程操作：

### 1. 测试分类与顺序

测试按以下顺序执行，每完成一部分再继续下一部分：

```
第一部分：后端单元测试 (pytest)
├── test_auth.py          # 认证测试
├── test_validation.py    # 输入校验测试
├── test_knowledge_base.py # KB CRUD 测试
├── test_features.py      # 功能测试（分页、上传）
├── test_profile.py       # 用户资料测试
├── test_rate_limit.py    # 速率限制测试
├── test_websocket.py     # WebSocket 集成测试
├── test_security.py      # 安全测试（SQL注入、XSS、JWT）
├── test_edge_cases.py    # 边界测试（超长、Unicode、并发）
└── test_error_handling.py # 错误处理测试

第二部分：前端单元测试 (vitest)
├── authStore.test.ts     # 状态管理测试
├── useChat.test.ts       # Hook 测试
├── ChatMessage.test.tsx  # 组件渲染测试
├── KBListPage.test.tsx   # KB 页面测试
├── ChatPage.test.tsx     # 聊天页面测试
├── LoginPage.test.tsx    # 登录页面测试
├── RegisterPage.test.tsx # 注册页面测试
├── ChatPage.error.test.tsx # 错误处理测试
└── Security.test.tsx     # 安全测试

第三部分：E2E 端到端测试 (Playwright)
├── smoke.spec.ts         # 快速冒烟测试
├── session.spec.ts       # 会话行为测试
└── full.spec.ts          # 全流程测试套件
```

### 2. 测试执行流程

对于每一部分测试：

```
循环执行：
  1. 运行该部分所有测试
  2. 检查测试结果
  3. 如果有失败：
     a. 分析失败原因
     b. 修正代码或测试
     c. 重新运行该部分测试
  4. 如果全部通过：
     a. 记录测试结果
     b. 选择合适时机压缩上下文（使用 /compact）
     c. 继续下一部分测试
  5. 重复直到该部分全部通过

直到所有部分全部通过：
  1. 运行完整测试套件验证
  2. 提交代码
  3. 输出测试总结报告
```

### 3. 上下文压缩时机

在以下时机压缩上下文：

- ✅ 每部分测试全部通过后
- ✅ 修复了多个测试失败后（避免上下文过长）
- ✅ 开始新的测试部分前（清理之前的状态）
- ❌ 测试仍有失败时（保持失败信息用于修复）

### 4. 测试修复原则

修复测试失败时：

1. **优先修复代码** — 测试失败通常意味着代码有 bug
2. **其次修复测试** — 如果测试本身有问题（如 selector 不匹配）
3. **保持测试真实性** — 不允许假测试（如 `assert True`）
4. **验证修复效果** — 修复后重新运行该测试确认通过

### 5. 测试命令

```bash
# 后端单元测试（按部分运行）
cd backend
uv run pytest tests/test_auth.py -v                    # 第一部分：认证
uv run pytest tests/test_validation.py -v              # 第一部分：校验
uv run pytest tests/test_knowledge_base.py -v          # 第一部分：KB
uv run pytest tests/test_features.py -v                # 第一部分：功能
uv run pytest tests/test_profile.py -v                 # 第一部分：资料
uv run pytest tests/test_rate_limit.py -v              # 第一部分：速率
uv run pytest tests/test_websocket.py -v               # 第一部分：WebSocket
uv run pytest tests/test_security.py -v                # 第一部分：安全
uv run pytest tests/test_edge_cases.py -v              # 第一部分：边界
uv run pytest tests/test_error_handling.py -v          # 第一部分：错误
uv run pytest tests/ -v                                # 第一部分：全部

# 前端单元测试（按部分运行）
cd frontend
npx vitest run src/stores/authStore.test.ts            # 第二部分：状态
npx vitest run src/hooks/useChat.test.ts               # 第二部分：Hook
npx vitest run src/components/chat/ChatMessage.test.tsx # 第二部分：组件
npx vitest run src/pages/KBListPage.test.tsx           # 第二部分：KB页面
npx vitest run src/pages/ChatPage.test.tsx             # 第二部分：聊天页面
npx vitest run src/pages/LoginPage.test.tsx            # 第二部分：登录
npx vitest run src/pages/RegisterPage.test.tsx         # 第二部分：注册
npx vitest run src/pages/ChatPage.error.test.tsx       # 第二部分：错误
npx vitest run src/pages/Security.test.tsx             # 第二部分：安全
npx vitest run                                         # 第二部分：全部

# E2E 测试（按部分运行）
cd frontend
npx playwright test smoke.spec.ts --reporter=list --workers=1  # 第三部分：冒烟
npx playwright test session.spec.ts --reporter=list --workers=1 # 第三部分：会话
npx playwright test full.spec.ts --reporter=list --workers=1   # 第三部分：全流程
npx playwright test --reporter=list --workers=1                # 第三部分：全部
```

### 6. 测试报告格式

每部分测试完成后，输出以下格式的报告：

```
## ✅ 第一部分：后端单元测试

| 测试文件 | 测试数 | 通过 | 失败 |
|---------|--------|------|------|
| test_auth.py | 5 | 5 | 0 |
| test_validation.py | 6 | 6 | 0 |
| ... | ... | ... | ... |

**总计：92 passed, 0 failed**

### 修复的问题
- 修复了 JWT user_id 提取错误（使用 'sub' 字段）
- 修复了 KB 列表接口 selector 问题

### 下一步
继续第二部分：前端单元测试
```

### 7. 最终验收标准

所有测试必须满足：

- ✅ 后端单元测试：92+ tests, 100% passed
- ✅ 前端单元测试：51+ tests, 100% passed
- ✅ E2E 测试：10+ tests, 100% passed
- ✅ 无假测试（每个测试都有实际验证逻辑）
- ✅ 覆盖核心功能（认证、CRUD、RAG、WebSocket）
- ✅ 覆盖安全测试（SQL注入、XSS、JWT）
- ✅ 覆盖边界测试（超长、Unicode、并发）
- ✅ 覆盖错误处理（LLM错误、Embedding错误）

## Skills (全局)

编写或重构前端代码时，**必须**遵循以下两个全局 Skill：

- **`vercel-react-best-practices`** — Vercel 官方 React 性能优化（70 条规则，8 大类别：消除瀑布流、Bundle 优化、服务端性能、重渲染优化、渲染性能、JS 性能等）
- **`frontend-design`** — Anthropic 官方 UI 设计规范，禁止通用 AI 审美（Inter/Roboto 字体、紫色渐变白底等），要求独特的字体、色彩、空间构图

每次写前端代码前，先参考 vercel-react-best-practices 检查性能模式，再参考 frontend-design 确定视觉方向。
