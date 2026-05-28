# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies (uses uv)
uv sync

# Run dev server
uvicorn app.main:app --reload --port 8000

# Lint & type-check
uv run ruff check --fix .       # auto-fix lint issues
uv run mypy app/                # type-check

# Docker dev
docker compose up --build       # foreground
docker compose up -d --build    # background
docker compose down             # stop
```

## Development workflow (必须遵守)

每次新增/修改功能时，严格按以下流程操作：

1. **改前提交** — 修改任何代码之前，先 `git add -A && git commit -m "..."` 保存当前状态
2. **实现功能** — 编写/修改代码
3. **校验** — `uv run ruff check --fix . && uv run mypy app/`，确保零告警
4. **写测试** — 在 `tests/` 目录下写真实的功能测试，`uv run pytest tests/ -v` 必须全部通过。测试要覆盖正常路径和边界情况，不允许写假测试（如 `assert True`）
5. **改后提交** — `git add -A && git commit -m "..."` 保存本次改动

### 测试约定

- 测试框架：pytest
- FastAPI 测试用 `httpx.AsyncClient` + `asgi_transport`
- 测试文件命名：`tests/test_<模块名>.py`
- 对涉及 LLM/embedding 调用的模块，测试应 mock 掉外部依赖，只验证逻辑正确性

## Architecture

**RAG pipeline with FastAPI + LangGraph + ChromaDB**

```
app/
├── main.py              # FastAPI app, startup auto-ingest
├── api/routes.py        # POST /ask, POST /ingest
├── core/config.py       # All settings via env vars + hardcoded defaults
├── core/engine.py       # RAG engine: LangGraph orchestration, lazy init
├── models/schemas.py    # Pydantic request/response models
└── services/ingest.py   # Document loading, chunking, vector store insertion
```

### RAG flow

`engine.py` builds a two-node LangGraph `StateGraph`:
1. **retrieve** — embeds the user question with BGE (`BAAI/bge-small-zh-v1.5`, runs locally), queries ChromaDB for top-k chunks via cosine similarity
2. **generate** — concatenates retrieved chunks into a Chinese prompt, calls the LLM (DeepSeek via OpenAI-compatible API) to produce an answer

The entire engine uses **lazy initialization**: nothing loads on import. `_init()` runs on the first call to `ask()` or `get_vectorstore()`, instantiating embeddings, LLM, vectorstore, retriever, and the compiled graph. This avoids loading the embedding model (~100MB) until actually needed.

### LLM provider pattern

The code uses `ChatOpenAI` with a custom `base_url`, making the LLM provider swappable via `.env`:
- **DeepSeek**: `OPENAI_BASE_URL=https://api.deepseek.com/v1`, `LLM_MODEL=deepseek-chat`
- **OpenAI native**: omit `OPENAI_BASE_URL`, set `LLM_MODEL=gpt-4o`

### Startup auto-ingest

`main.py` registers a `startup` event that checks if `chroma_db/` is empty. If so, it runs `ingest_documents()` to load all `.txt` and `.md` files from `documents/`, chunk them (size 300, overlap 50, Chinese-aware separators), and insert into ChromaDB.

### Vector store

ChromaDB persists to `chroma_db/` (SQLite under the hood). The directory is gitignored. In Docker, it's a named volume (`chroma_data`). Documents are read-only in Docker but writable locally.

### Key config constants

| Constant | Default | Source |
|---|---|---|
| `LLM_MODEL` | `deepseek-chat` | `.env` |
| `OPENAI_BASE_URL` | `None` | `.env` |
| `EMBEDDING_MODEL` | `BAAI/bge-small-zh-v1.5` | hardcoded |
| `CHUNK_SIZE` | 300 | hardcoded |
| `CHUNK_OVERLAP` | 50 | hardcoded |
| `RETRIEVAL_K` | 3 | hardcoded |
| `CHROMA_DIR` | `<project>/chroma_db` | derived |
| `DOCUMENTS_DIR` | `<project>/documents` | derived |
