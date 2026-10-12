"""OCR 与题目解析路由（SRS 6.2 内部接口）：仅 Java 经 Feign 调用。"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from physicene_ai.api.routes_agent import require_internal_key
from physicene_ai.core.event_parser import parse_question
from physicene_ai.core.ocr_service import LowConfidenceError, ocr_service
from physicene_ai.models.contract import CamelModel

router = APIRouter()


class RecognizeRequest(CamelModel):
    image_base64: str


class ParseQuestionRequest(CamelModel):
    ocr_text: str
    upload_id: str = ""


@router.post("/ocr/recognize", tags=["ocr"], dependencies=[Depends(require_internal_key)])
def recognize(request: RecognizeRequest) -> dict:
    # P1.5（2026-10-12 用户裁决 B）：slim 档无 paddleocr 时显式告知档位与切法——
    # find_spec 轻探测不触发重导入；503 语义 = 功能未装而非"稍后再试"（误导）
    import importlib.util
    if importlib.util.find_spec("paddleocr") is None:
        raise HTTPException(status_code=503,
                            detail="OCR 未安装（slim 档）——需 AI_MODE=full 重建 AI 服务（见 docs/Docker-FAQ.md）")
    try:
        return ocr_service.recognize(request.image_base64)
    except LowConfidenceError as e:
        # 契约：422 + code 2004 语义（Java 层降级"建议重拍"）
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/agent/parse-question", tags=["ocr"], dependencies=[Depends(require_internal_key)])
def parse(request: ParseQuestionRequest) -> dict:
    return parse_question(request.ocr_text)
