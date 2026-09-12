"""健康检查路由（SRS 4.4：readiness 与 liveness 分离，均不查 DeepSeek）。"""

from fastapi import APIRouter

router = APIRouter()

# 骨架占位：第五周接入真实 Chroma / bge-m3 / PaddleOCR 后改为按实际加载状态上报
COMPONENTS: dict[str, str] = {
    "chroma": "NOT_LOADED",
    "bge_m3_model": "NOT_LOADED",
    "paddle_ocr": "NOT_LOADED",
}


@router.get("/health", tags=["health"])
async def health() -> dict:
    """liveness：进程活着即 ok，组件状态仅附加展示。"""
    return {"status": "ok", "components": COMPONENTS}


@router.get("/ready", tags=["health"])
async def ready() -> dict:
    """readiness：三个 AI 组件全部 LOADED 才对外可服务。"""
    is_ready = all(state == "LOADED" for state in COMPONENTS.values())
    return {"ready": is_ready, "components": COMPONENTS}


@router.get("/api/v1/health", tags=["health"])
async def api_v1_health() -> dict:
    """带版本前缀的健康检查别名（与 Java /api/* 命名风格对齐）。"""
    return await health()
