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
    # 后台预热 RAG（bge-m3 + Chroma 约 40–80 s）：否则首个问答会撞 Java Feign 35 s 读超时，
    # 学生看到的是“AI 暂不可用”。预热不阻塞启动；设 RAG_WARMUP=0 可关闭（离线单测）。
    import os
    import threading

    if os.getenv("RAG_WARMUP", "1") == "1":
        def _warm():
            try:
                from physicene_ai.core.rag_retriever import rag_retriever
                rag_retriever._ensure_loaded()  # noqa: SLF001
                logger.info("RAG 预热完成")
            except Exception as exc:  # noqa: BLE001
                logger.warning("RAG 预热失败（问答将退化为纯 LLM）：{}", exc)

        threading.Thread(target=_warm, name="rag-warmup", daemon=True).start()
