"""Agent 对话路由（SRS 6.2）：POST /agent/chat，仅接受 Java 经 Feign 转发的内部调用。"""
from fastapi import APIRouter, Depends, Header, HTTPException

from physicene_ai.core import agent_engine
from physicene_ai.models.contract import ChatRequest, ChatResponse
from physicene_ai.utils.config import settings
from physicene_ai.utils.logger import logger

router = APIRouter()


def require_internal_key(x_internal_key: str = Header(default="")) -> None:
    """共享密钥校验（SRS 4.2：Java↔Python 内部鉴权，不暴露前端）。"""
    if x_internal_key != settings.internal_key:
        raise HTTPException(status_code=401, detail="invalid internal key")


@router.post("/agent/chat", tags=["agent"], dependencies=[Depends(require_internal_key)])
def agent_chat(request: ChatRequest) -> ChatResponse:
    logger.info("agent/chat user={} scene={} msg={}", request.user_id,
                request.scene_id, request.message[:50])
    return agent_engine.handle(request)
