"""OCR 服务（SRS F4）：PaddleOCR 3.x（PP-OCRv6）中文识别，置信度 <0.6 触发降级。
注意：paddlepaddle 3.3 Windows CPU 需关闭 MKLDNN（onednn PIR 兼容 bug）。
模型懒加载（首次调用需下载官方小模型，之后走本地缓存）。"""
import base64
import tempfile
import threading
from pathlib import Path

from physicene_ai.utils.logger import logger

MIN_CONFIDENCE = 0.6


class LowConfidenceError(RuntimeError):
    """整体置信度过低 → Java 层转 2004 降级（建议重拍或手动建场景）。"""


class OcrService:
    def __init__(self):
        self._ocr = None
        self._lock = threading.Lock()

    @property
    def ready(self) -> bool:
        return self._ocr is not None

    def _ensure_loaded(self):
        if self._ocr is not None:
            return
        with self._lock:
            if self._ocr is not None:
                return
            from paddleocr import PaddleOCR
            logger.info("懒加载 PaddleOCR（PP-OCRv6 中文）…")
            self._ocr = PaddleOCR(lang="ch", enable_mkldnn=False)

    def recognize(self, image_base64: str) -> dict:
        """base64 图片 → {rawText, confidence, lines[{text, confidence, bbox}]}。"""
        self._ensure_loaded()
        raw = base64.b64decode(image_base64)
        # PaddleOCR 需要文件路径输入（临时文件，用完即删）
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            f.write(raw)
            path = f.name
        try:
            results = self._ocr.predict(path)
        finally:
            Path(path).unlink(missing_ok=True)

        r = results[0]
        texts = [str(t) for t in r.get("rec_texts", [])]
        scores = [float(s) for s in r.get("rec_scores", [])]
        boxes = r.get("rec_boxes", [])
        lines = []
        for i, text in enumerate(texts):
            box = boxes[i] if i < len(boxes) else None
            bbox = None
            if box is not None:
                try:
                    xs = [int(v) for v in (box[0], box[2])]
                    ys = [int(v) for v in (box[1], box[3])]
                    bbox = [[xs[0], ys[0]], [xs[1], ys[0]], [xs[1], ys[1]], [xs[0], ys[1]]]
                except Exception:  # noqa: BLE001 bbox 仅展示用
                    bbox = None
            lines.append({"text": text,
                          "confidence": round(scores[i], 3) if i < len(scores) else 0.0,
                          "bbox": bbox})
        overall = sum(scores) / len(scores) if scores else 0.0
        raw_text = "\n".join(l["text"] for l in lines)
        logger.info("OCR 完成：{} 行，整体置信度 {:.2f}", len(lines), overall)

        if overall < MIN_CONFIDENCE:
            raise LowConfidenceError(f"识别置信度过低（{overall:.2f} < {MIN_CONFIDENCE}），建议重拍")

        return {"rawText": raw_text, "confidence": round(overall, 3), "lines": lines}


ocr_service = OcrService()
