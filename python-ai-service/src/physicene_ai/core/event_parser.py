"""EventParser（SRS F4.2）：OCR 文本 → 两步 LLM 解析。
步骤① 纠错（OCR 常见误识别修正，max_tokens=500）
步骤② 结构化（simType + recommendedElements + confidence，max_tokens=1500，few-shot）
置信度 <0.6 → fallbackHint 降级。关键词预路由兜底（LLM 失败时仍可用）。"""
import json
import re

from physicene_ai.core.llm_client import llm_client
from physicene_ai.utils.logger import logger

PARSE_SYSTEM_PROMPT = """你是高中物理实验题目解析器。把 OCR 识别出的物理题文本解析为结构化实验场景。
只输出 JSON：
{"simType":"collision|projectile","recommendedElements":[{"id":"...","type":"cube|sphere|slope|wall","position":{"x":0,"y":0},"properties":{"mass":1,"friction":0,"restitution":0.5},"initialState":{"velocity":{"x":0,"y":0}},"scale":{"x":1,"y":1},"isFixed":false}],"confidence":0.0~1.0,"fallbackHint":null}

规则：
- 小车/滑块/物块 → type "cube"；小球 → "sphere"；斜面 → "slope"；地面 → "wall"（isFixed true，scale x 设 20）
- 两物相向/追及碰撞 → simType "collision"，两 cube 分别给初速
- 抛出/投掷/斜抛/平抛 → simType "projectile"，初速按题意分解（45° 时 x=y=0.707×v0）
- 质量/摩擦/弹性按题目数值填 properties；没说的用默认值
- 题目不属于这两类（如电路、光学）→ confidence 设 0.2，fallbackHint 写"暂不支持该题型，建议手动搭建"
- 坐标系：x 向右 y 向上，地面顶面取 y=0，物体放在地面上方
- 元件 id 用 "car1"/"car2"/"ball" 等简名

示例输入："质量分别为1kg和2kg的两辆小车在光滑水平面上相向运动，速度大小均为3m/s，发生碰撞"
示例输出：{"simType":"collision","recommendedElements":[{"id":"car1","type":"cube","position":{"x":-3,"y":0.5},"properties":{"mass":1,"friction":0,"restitution":0.5},"initialState":{"velocity":{"x":3,"y":0}},"scale":{"x":1,"y":1}},{"id":"car2","type":"cube","position":{"x":3,"y":0.5},"properties":{"mass":2,"friction":0,"restitution":0.5},"initialState":{"velocity":{"x":-3,"y":0}},"scale":{"x":1,"y":1}},{"id":"ground","type":"wall","position":{"x":0,"y":-0.1},"scale":{"x":20,"y":0.2},"isFixed":true}],"confidence":0.92,"fallbackHint":null}"""

KEYWORDS = [("碰撞", "collision"), ("小车", "collision"), ("动量", "collision"), ("相向", "collision"),
            ("斜抛", "projectile"), ("平抛", "projectile"), ("抛出", "projectile"), ("投掷", "projectile")]


def _keyword_fallback(ocr_text: str) -> dict:
    sim = next((s for kw, s in KEYWORDS if kw in ocr_text), None)
    if sim is None:
        return {"simType": "collision", "recommendedElements": [], "confidence": 0.2,
                "fallbackHint": "无法识别题型，建议手动搭建场景"}
    return {"simType": sim, "recommendedElements": [], "confidence": 0.4,
            "fallbackHint": "LLM 暂不可用，已按题型关键词给出模板建议，请手动补充元件"}


def parse_question(ocr_text: str) -> dict:
    """两步解析。返回 {simType, recommendedElements, confidence, fallbackHint}。"""
    if llm_client.mock:
        return _keyword_fallback(ocr_text)
    try:
        # 步骤①：OCR 纠错
        corrected = llm_client.chat(
            [{"role": "system", "content": "修正 OCR 识别物理题文本中的错别字与断句，只输出修正后的原文，不要解释。"},
             {"role": "user", "content": ocr_text[:1500]}],
            max_tokens=500, temperature=0.1).content
        # 步骤②：结构化解析
        raw = llm_client.chat(
            [{"role": "system", "content": PARSE_SYSTEM_PROMPT},
             {"role": "user", "content": corrected[:1500]}],
            max_tokens=1500, temperature=0.1).content
        data = json.loads(_extract_json(raw))
        confidence = float(data.get("confidence", 0))
        result = {
            "simType": data.get("simType", "collision"),
            "recommendedElements": data.get("recommendedElements") or [],
            "confidence": confidence,
            "fallbackHint": data.get("fallbackHint"),
        }
        if confidence < 0.6 and not result["fallbackHint"]:
            result["fallbackHint"] = "题目信息不够明确，建议核对或手动调整"
        logger.info("解析完成：{} conf={:.2f} elements={}", result["simType"],
                    result["confidence"], len(result["recommendedElements"]))
        return result
    except Exception as e:  # noqa: BLE001 LLM 失败 → 关键词兜底（SRS 4.3 可靠性）
        logger.warning("两步解析失败，关键词兜底: {}", str(e)[:150])
        return _keyword_fallback(ocr_text)


def _extract_json(text: str) -> str:
    m = re.search(r"\{.*\}", text, re.S)
    return m.group(0) if m else text
