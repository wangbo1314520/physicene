# physicene-ai-service

PhysiScene 的 Python AI 服务（第四周接入 Agent/RAG/OCR，当前为第一周骨架）。

## 启动

```bash
# 首次：创建虚拟环境并安装依赖（Python 锁 3.12，V5 验证项）
poetry env use "E:\Program\Python312\python.exe"
poetry install

# 日常启动（8000 端口，仅内网，不对前端暴露）
poetry run uvicorn physicene_ai.main:app --reload --port 8000
```

Swagger：http://localhost:8000/docs

## 结构（SRS §7.3）

```
src/physicene_ai/
├── main.py        # FastAPI 入口
├── api/           # 路由层（不写业务）
├── core/          # agent_engine / rag_retriever / ocr_service（第四、五周）
├── models/        # Pydantic 契约（camelCase 对齐 Java）
├── tools/         # Agent 工具集（第四周）
└── utils/         # logger / config / token_counter
```
