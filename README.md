# RAG Learn

基于 FastAPI + LangGraph + Qdrant 的 RAG（检索增强生成）知识库问答系统。上传文档，智能检索，AI 回答。

## 功能亮点

- **📄 多格式文档** — 支持 TXT、Markdown、PDF、DOCX，Docling 自动解析
- **🔍 混合检索** — 向量检索 + BM25 关键词 → RRF 融合 → Cross-encoder 精排
- **💬 实时对话** — WebSocket 流式响应，多会话管理，支持编辑/重生成/导出
- **📊 进度追踪** — 上传进度实时展示，刷新不丢失，支持终止/重试
- **🔐 用户系统** — JWT 认证，知识库隔离，速率限制

## 技术栈

| 层级 | 技术 |
|------|------|
| **后端框架** | FastAPI + LangGraph + LangChain |
| **向量数据库** | Qdrant（gRPC，按知识库隔离 collection） |
| **Embedding** | `tencent/Youtu-Embedding` (2B, 2048d, C-MTEB #1) |
| **Reranker** | `Qwen/Qwen3-Reranker-4B` (Cross-encoder) |
| **LLM** | DeepSeek（OpenAI 兼容 API，可替换） |
| **文档解析** | Docling（PDF/DOCX → Markdown） |
| **消息队列** | ARQ + Redis（异步文档处理） |
| **数据库** | PostgreSQL 16（SQLAlchemy async + sync 双引擎） |
| **前端** | React 19 + Vite + TypeScript + Tailwind CSS |
| **状态管理** | Zustand |
| **UI 测试** | Playwright（E2E） |

## 快速开始

### 前置条件

- Docker + Docker Compose
- DeepSeek API Key（或其他 OpenAI 兼容 API）

### 1. 配置环境变量

```bash
cp backend/.env.example backend/.env
```

编辑 `backend/.env`，至少填写：

```env
SECRET_KEY=<生成一个随机密钥>
OPENAI_API_KEY=<你的 API Key>
OPENAI_BASE_URL=<API 端点>
```

生成密钥：`python -c 'import secrets; print(secrets.token_urlsafe(32))'`

### 2. 启动服务

```bash
# 生产模式（React 由 Nginx 托管，访问 http://localhost）
docker compose up --build -d

# 开发模式（热重载，访问 http://localhost:5173）
docker compose -f docker-compose.dev.yml up --watch --build
```

### 3. 开始使用

访问 `http://localhost`（生产）或 `http://localhost:5173`（开发），注册账号后即可：
1. 创建知识库
2. 上传文档（支持拖拽）
3. 等待解析完成，开始提问

## 项目结构

```
fastapi-rag-learn/
├── backend/
│   ├── app/
│   │   ├── api/              # FastAPI 路由（auth, kb, routes, websocket）
│   │   ├── core/             # 配置、数据库、RAG 引擎、认证、Worker
│   │   ├── models/           # SQLAlchemy 模型 + Pydantic schemas
│   │   └── services/         # 知识库业务逻辑
│   ├── tests/                # 110 个 pytest 单元测试
│   ├── pyproject.toml
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api/              # axios + API 函数
│   │   ├── components/       # 可复用组件（chat, shared）
│   │   ├── hooks/            # useChatWS（WebSocket 流式）
│   │   ├── pages/            # Login, KBList, Chat
│   │   ├── router/           # react-router + AuthGuard
│   │   └── stores/           # Zustand（auth, toast）
│   ├── e2e/                  # Playwright E2E 测试
│   └── package.json
├── .github/workflows/ci.yml  # CI/CD 流水线
├── docker-compose.yml        # 生产部署
└── docker-compose.dev.yml    # 开发环境（热重载）
```

## 检索链路

```
用户提问
  → 向量检索 (top-8) + BM25 关键词检索 (top-8)
  → RRF 融合排序
  → Cross-encoder 精排 (top-5 chunks)
  → 拼接上下文 + System Prompt
  → LLM 流式生成回答
```

## 开发指南

### 目录纪律

所有开发命令**必须在对应子目录下执行**，禁止在项目根目录运行：

```bash
# ✅ 正确
cd backend && uv sync
cd backend && uv run pytest tests/ -v
cd frontend && npm install
cd frontend && npx vitest run

# ❌ 错误 — 会在根目录生成残留文件
uv run pytest tests/
npx vitest run
```

### Python 工具链路

```
Black（格式化）→ Ruff（Lint）→ Mypy（类型）→ Pytest + Coverage（测试）→ Safety（安全）
```

```bash
cd backend
uv sync                                                    # 安装依赖
uv run black --check --diff .                              # 格式化检查
uv run ruff check --fix .                                  # Lint
uv run mypy app/                                           # 类型检查
uv run pytest tests/ -v --cov=app --cov-report=term-missing  # 测试 + 覆盖率
uv run safety check --full-report                          # 依赖安全扫描
```

### 前端校验

```bash
cd frontend
npm install
npx biome check --fix src/   # Lint + 格式化
npx tsc --noEmit               # 类型检查
npx vitest run                 # 单元测试
```

### 测试策略

| 层级 | 何时跑 | 内容 |
|------|--------|------|
| **L1** | 每次改动后 | Black + Ruff + Mypy（后端）/ Biome + tsc（前端） |
| **L2** | L1 通过后 | 相关单元测试 |
| **L3** | L2 通过后 | Playwright E2E 冒烟测试 |
| **L4** | push 后 | GitHub Actions 全绿 |

覆盖率：**66%**（110 tests），详见 CI 报告。

## CI/CD

每次 push 到 `master` 自动触发 GitHub Actions：

```
backend job                     frontend job（并行）
├── Black 格式化检查            ├── Biome Lint
├── Ruff Lint                   ├── tsc 类型检查
├── Mypy 类型检查               └── Vitest 单元测试
├── Pytest + Coverage
└── Safety 安全扫描
               ↓
          e2e job（等待前两者通过）
          └── Playwright 完整链路测试
```

## 环境变量

| 变量 | 必填 | 说明 | 默认值 |
|------|:--:|------|--------|
| `SECRET_KEY` | ✅ | JWT 签名密钥 | 无（必须设置） |
| `OPENAI_API_KEY` | ✅ | LLM API 密钥 | 无 |
| `OPENAI_BASE_URL` | ✅ | LLM API 端点 | 无 |
| `DATABASE_URL` | - | PostgreSQL 连接串 | `postgresql+asyncpg://...` |
| `REDIS_URL` | - | Redis 连接串 | `redis://localhost:6379` |
| `QDRANT_URL` | - | Qdrant gRPC 地址 | `http://localhost:6334` |
| `LLM_MODEL` | - | 模型名称 | `deepseek-chat` |
| `EMBEDDING_PROVIDER` | - | `local` 或 `api` | `local` |
| `RERANKER_PROVIDER` | - | `local` 或 `api` | `local` |
| `CORS_ALLOW_ORIGINS` | - | 允许的前端域名 | `http://localhost:5173` |
| `RATE_LIMIT_REQUESTS` | - | 速率限制/周期 | `60` |
| `DB_PASSWORD` | - | Docker 部署用 | `change-me-in-production` |

> **Embedding/Reranker API 模式**：设置 `EMBEDDING_PROVIDER=api` 可跳过本地模型下载（~2GB），改用 OpenAI 兼容 API。详见 `backend/app/core/config.py`。

## License

MIT
