"""意图分类器（SRS F3.2 五分支）：LLM 单次调用 max_tokens=200 + few-shot；
置信度 <0.7 反问澄清。mock 模式用关键词规则（离线测试通道）。"""
import json
import re

from physicene_ai.core.llm_client import llm_client
from physicene_ai.models.contract import IntentResult
from physicene_ai.utils.logger import logger

INTENTS = ("load_template", "free_build", "modify", "question", "history")

SYSTEM_PROMPT = """你是高中物理实验平台的意图分类器。把学生的话分类为五种意图之一：
- load_template：加载预设实验模板（如"做个小车碰撞实验"、"来一个斜抛"）
- free_build：向场景添加/删除/移动元件（如"加一个方块"、"放个斜面"、"清空场景"）
- modify：修改既有元件参数（如"把方块质量改成3"、"速度变5"）
- question：问物理原理/概念（如"什么是动量守恒"、"为什么能量损失了"）。
  与物理无关的提问（天气、闲聊等）也归 question（不要 needClarify，由回答层标注非教材引用）
- history：查看历史实验记录（如"我昨天的实验呢"、"看看实验记录"）

只输出 JSON（不要解释）：
{"intent":"上述之一","confidence":0.0~1.0,"entities":{...},"needClarify":false}
entities 按意图提取：
- load_template: {"template":"collision"|"projectile"}
- free_build: {"action":"add|remove|move|rotate|clear|list","elementType":"cube|sphere|slope|wall|spring","elementId":null,"position":{"x":0,"y":0}}
- modify: {"elementId":"...", "property":"mass|friction|restitution|velocity", "value":数值或对象}
- question/history: {}

示例：
"做个小车碰撞实验" → {"intent":"load_template","confidence":0.95,"entities":{"template":"collision"},"needClarify":false}
"加一个小车" → {"intent":"free_build","confidence":0.9,"entities":{"action":"add","elementType":"cube"},"needClarify":false}
"把速度变3" → {"intent":"modify","confidence":0.85,"entities":{"property":"velocity","value":3},"needClarify":false}
"什么是动量守恒" → {"intent":"question","confidence":0.97,"entities":{},"needClarify":false}
"我昨天的实验呢" → {"intent":"history","confidence":0.95,"entities":{},"needClarify":false}"""

ELEMENT_WORDS = {"方块": "cube", "小车": "cube", "小球": "sphere", "球": "sphere",
                 "斜面": "slope", "斜坡": "slope", "地面": "wall", "墙": "wall", "墙壁": "wall"}
TEMPLATE_WORDS = {"碰撞": "collision", "小车碰撞": "collision", "动量": "collision",
                  "斜抛": "projectile", "平抛": "projectile", "抛体": "projectile"}


def _keyword_classify(message: str) -> IntentResult:
    """mock/降级通道：关键词规则。"""
    for word, template in TEMPLATE_WORDS.items():
        if word in message and any(v in message for v in ("做个", "来一个", "开始", "加载", "运行", "玩")):
            return IntentResult(intent="load_template", confidence=0.9,
                                entities={"template": template})
    if any(w in message for w in ("为什么", "什么是", "什么叫", "原理", "解释")):
        return IntentResult(intent="question", confidence=0.9)
    if any(w in message for w in ("历史", "记录", "昨天", "上次")):
        return IntentResult(intent="history", confidence=0.85)
    if any(w in message for w in ("改成", "改成个", "调到", "变快", "变慢", "改为", "设置成")):
        prop = "mass"
        if "质量" in message:
            prop = "mass"
        elif "摩擦" in message:
            prop = "friction"
        elif "弹性" in message:
            prop = "restitution"
        elif "速度" in message or "初速" in message:
            prop = "velocity"
        num = re.search(r"(\d+(?:\.\d+)?)", message)
        return IntentResult(intent="modify", confidence=0.8, entities={
            "property": prop, "value": float(num.group(1)) if num else None})
    if any(v in message for v in ("清空", "全部删")):
        return IntentResult(intent="free_build", confidence=0.9,
                            entities={"action": "clear"})
    if any(v in message for v in ("加", "放", "摆", "搭", "添加", "放个", "删", "移到", "挪")):
        action = "add"
        if "删" in message or "移除" in message:
            action = "remove"
        elif "移到" in message or "挪" in message:
            action = "move"
        etype = next((t for w, t in ELEMENT_WORDS.items() if w in message), "cube")
        return IntentResult(intent="free_build", confidence=0.8,
                            entities={"action": action, "elementType": etype})
    return IntentResult(intent="question", confidence=0.4, need_clarify=True)


def classify(message: str) -> IntentResult:
    if llm_client.mock:
        return _keyword_classify(message)
    try:
        result = llm_client.chat(
            [{"role": "system", "content": SYSTEM_PROMPT},
             {"role": "user", "content": message}],
            max_tokens=200, temperature=0.1)
        data = json.loads(_extract_json(result.content))
        intent = data.get("intent", "question")
        if intent not in INTENTS:
            intent = "question"
        confidence = min(1.0, max(0.0, float(data.get("confidence", 0.5))))
        return IntentResult(
            intent=intent,
            confidence=confidence,
            entities=data.get("entities") or {},
            need_clarify=bool(data.get("needClarify", False)) or confidence < 0.7,
        )
    except Exception as e:  # LLM 失败降级到关键词规则（SRS 4.3 可靠性）
        logger.warning("意图分类 LLM 失败，降级关键词规则: {}", str(e)[:150])
        return _keyword_classify(message)


def _extract_json(text: str) -> str:
    m = re.search(r"\{.*\}", text, re.S)
    return m.group(0) if m else text
