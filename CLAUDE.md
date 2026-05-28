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
5. **写测试** — 后端 `uv run pytest tests/ -v`，前端 `npx vitest run`，全部通过。不允许假测试（如 `assert True`）
6. **改后提交** — `git add -A && git commit -m "..."` 保存本次改动

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
