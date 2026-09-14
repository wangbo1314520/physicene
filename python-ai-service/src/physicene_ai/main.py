"""PhysiScene Python AI 服务入口（第一周骨架）。

职责边界（SRS §6.2）：本服务仅接收 Java 经 Feign 转发的内部请求，
不对前端暴露；第四周起接入 Agent/RAG/OCR。
"""

from fastapi import FastAPI

from physicene_ai.api.routes_agent import router as agent_router
from physicene_ai.api.routes_health import router as health_router
from physicene_ai.api.routes_ocr import router as ocr_router
from physicene_ai.utils.logger import logger

app = FastAPI(
    title="PhysiScene AI Service",
    version="0.5.0",
    description="Agent 对话 / RAG 教材检索 / OCR 识题（内部服务，经 Java 网关访问）",
)

app.include_router(health_router)
app.include_router(agent_router)
app.include_router(ocr_router)


@app.get("/", include_in_schema=False)
async def root():
    return {"service": "physicene-ai-service", "docs": "/docs"}


@app.on_event("startup")
async def on_startup():
    logger.info("physicene-ai-service 启动（骨架模式：AI 组件未加载）")
