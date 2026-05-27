# FastAPI + LangGraph + RAG 技术栈

## 概述

本项目是一个**检索增强生成（RAG）** 学习项目，结合了以下核心技术：

### FastAPI

FastAPI 是一个现代、高性能的 Python Web 框架，特点包括：

- 自动生成 OpenAPI 文档（Swagger UI）
- 基于 Python 类型提示的请求验证
- 异步支持，性能可媲美 Node.js
- 使用 Pydantic 进行数据序列化

### LangGraph

LangGraph 是 LangChain 团队推出的**有状态、可编排**的 LLM 应用框架：

- 将 RAG 流程建模为有向图（DAG）
- 支持条件分支和循环
- 内置状态管理
- 适合复杂的多步推理场景

本项目中 LangGraph 编排了两个核心节点：

1. **retrieve** — 从 ChromaDB 向量库中检索相关文档
2. **generate** — 将检索结果作为上下文交给 LLM 生成回答

### ChromaDB

ChromaDB 是一个开源向量数据库，用于存储和检索文档的向量表示：

- 轻量级，可嵌入应用
- 支持多种 embedding 模型
- 基于余弦相似度的语义搜索

### Embedding 模型

本项目使用 **BAAI/bge-small-zh-v1.5** 中文向量模型：

- 专为中文优化
- 模型体积小（约 100MB），适合本地部署
- 由智源研究院（BAAI）开发

## 工作流程

1. 文档摄取（/ingest）→ 文本切割 → 向量化 → 存入 ChromaDB
2. 用户提问（/ask）→ 问题向量化 → 语义检索 → LLM 生成回答

## Docker 部署

项目支持多阶段 Docker 构建，embedding 模型在构建阶段预下载，避免首次请求等待。
