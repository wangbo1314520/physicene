"""健康检查路由（SRS 4.4：readiness 与 liveness 分离，均不查 DeepSeek）。

三个 AI 组件均为懒加载：进程启动后为 NOT_LOADED，首个 RAG / OCR 请求触发加载后变为 LOADED。
resources 段上报仓库外资源路径及其存在性，用于排查"换机器后模型路径失效"一类部署故障。
"""
import os

from fastapi import APIRouter

from physicene_ai.core.ocr_service import ocr_service
from physicene_ai.core.rag_retriever import rag_retriever
from physicene_ai.utils.config import settings

router = APIRouter()


def _state(loaded: bool) -> str:
    return "LOADED" if loaded else "NOT_LOADED"


def _components() -> dict[str, str]:
    return {
        "chroma": _state(rag_retriever.ready),
        "bge_m3_model": _state(rag_retriever.model_ready),
        "paddle_ocr": _state(ocr_service.ready),
    }


def _resources() -> dict:
    return {
        "bge_m3_path": settings.bge_m3_path,
        "bge_m3_path_exists": os.path.isdir(settings.bge_m3_path),
        "chroma_dir": settings.chroma_dir,
        "chroma_dir_exists": os.path.isdir(settings.chroma_dir),
    }


@router.get("/health", tags=["health"])
async def health() -> dict:
    """liveness：进程活着即 ok，组件状态与资源路径仅附加展示。"""
    return {"status": "ok", "components": _components(), "resources": _resources()}


@router.get("/ready", tags=["health"])
async def ready() -> dict:
    """readiness：三个 AI 组件全部 LOADED 才对外可服务（懒加载，需先预热）。"""
    components = _components()
    is_ready = all(state == "LOADED" for state in components.values())
    return {"ready": is_ready, "components": components}


@router.get("/api/v1/health", tags=["health"])
async def api_v1_health() -> dict:
    """带版本前缀的健康检查别名（与 Java /api/* 命名风格对齐）。"""
    return await health()
