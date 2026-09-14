"""AgentEngine 主循环（SRS F3.2）：意图分类 → 低置信反问 → 五分支路由 → 工具执行 → 自然语言回复。

question 分支 Week 4 直连 LLM（第五周接 RAG 教材引用）；工具失败不报错，
转为面向学生的反问（SRS 4.3：Agent 误判 → 反问不报错）。
"""
from physicene_ai.core.intent_classifier import classify
from physicene_ai.core.llm_client import LLMUnavailableError, llm_client
from physicene_ai.models.contract import ChatMessage, ChatRequest, ChatResponse, ToolCall
from physicene_ai.tools.java_client import JavaApiError
from physicene_ai.tools import tool_registry
from physicene_ai.utils.logger import logger

REPLY_SYSTEM_PROMPT = """你是高中物理实验平台 PhysiScene 的 AI 助教"小物"。
学生刚在实验台做操作，你用 1-3 句亲切的中文总结执行结果并给一点物理提示。
不要编造未发生的事情，工具结果里有什么就说什么。"""

QUESTION_SYSTEM_PROMPT = """你是高中物理助教，用简洁清晰的中文回答物理概念问题（3-6 句）。
必要时结合实验场景举例。目前尚未接入教材知识库，回答基于通用物理知识。"""

ANALYZE_SYSTEM_PROMPT = """你是高中物理实验助教，正在和学生一起分析刚做完的仿真实验。
你会拿到实验数据摘要（元件、关键事件、各物理量极值、数据采样）。
分析要求：
1. 先用 1-2 句概括实验过程（结合关键事件时刻）
2. 结合具体数字分析物理规律（如速度变化、能量转化、动量是否守恒），数字要用摘要里的真实数据
3. 指出这个实验验证/展示了什么知识点
4. 给学生留 1 个思考问题（引导深入）
语气亲切，全文 5-8 句，用列表或短段落，不要编造数据里没有的数值。"""


def handle(request: ChatRequest) -> ChatResponse:
    try:
        intent = classify(request.message)
        logger.info("意图: {} conf={:.2f} entities={}", intent.intent,
                    intent.confidence, intent.entities)

        if intent.need_clarify:
            return ChatResponse(
                reply=_clarify_question(request.message),
                tool_calls=[])

        router = {
            "load_template": _handle_load_template,
            "free_build": _handle_free_build,
            "modify": _handle_modify,
            "question": _handle_question,
            "history": _handle_history,
            "analyze": _handle_analyze,
        }
        return router[intent.intent](request, intent.entities)

    except LLMUnavailableError as e:
        logger.error("LLM 不可用: {}", str(e)[:150])
        return ChatResponse(reply="AI 服务暂时繁忙，请稍后再试～",
                            fallback=True, error_type="LLM_UNAVAILABLE")
    except Exception as e:  # noqa: BLE001
        logger.error("AgentEngine 异常: {}", str(e)[:200])
        return ChatResponse(reply="哎呀，助手开小差了，请换个说法再试一次。",
                            fallback=True, error_type="INTERNAL")


def _clarify_question(message: str) -> str:
    return ("不太确定你的意思～你是想：\n"
            "① 做个实验（如「做个小车碰撞实验」）\n"
            "② 搭建元件（如「加一个方块」）\n"
            "③ 改参数（如「把质量改成 3」）\n"
            "④ 问原理（如「什么是动量守恒」）\n"
            "再说一次，带上具体的词好吗？")


def _run_tool(name: str, request: ChatRequest, args: dict) -> tuple[ToolCall | None, dict]:
    """执行工具；失败把错误转成学生友好的反问（不抛出）。"""
    try:
        result = tool_registry.execute(name, request.user_id, request.scene_id, args)
        return ToolCall(name=name, args=args, result=result), result
    except JavaApiError as e:
        logger.warning("工具 {} 失败: {}", name, str(e)[:150])
        friendly = _friendly_error(str(e))
        return ToolCall(name=name, args=args, result=f"error: {e.message}"), {"__error__": friendly}
    except KeyError as e:
        return None, {"__error__": f"未知工具 {e}"}


def _friendly_error(raw: str) -> str:
    if "403" in raw or "无权" in raw:
        return "这个场景好像不是你的哦，先在「我的场景」打开自己的实验吧。"
    if "404" in raw or "不存在" in raw:
        return "没找到对应的内容，要不要先看看场景里有什么？（说「列出元件」）"
    if "400" in raw or "没有打开的场景" in raw:
        return "当前还没有打开的场景，先在实验台新建或加载一个场景吧～"
    if "场景校验未通过" in raw:
        return "这个参数好像不符合物理规则（比如质量必须大于 0），检查一下再试？"
    return "操作没有成功，换个说法试试？"


# ===== 五分支路由 =====

def _handle_load_template(request: ChatRequest, entities: dict) -> ChatResponse:
    template = entities.get("template") or ("collision"
                                            if "抛" not in request.message else "projectile")
    call, result = _run_tool("run_simulation", request, {"template": template})
    if "__error__" in result:
        return ChatResponse(reply=result["__error__"],
                            tool_calls=[call] if call else [])
    scene_id = result.get("sceneId")
    summary = _llm_reply(request, (
        f"已为学生加载「{'小车碰撞' if template == 'collision' else '斜抛运动'}」模板并启动仿真，"
        f"新场景编号 {scene_id}，实验正在运行，画布上可以看到实时画面和 v-t 曲线。"
        f"可提示学生观察{'碰撞瞬间的速度交换与动量守恒' if template == 'collision' else '轨迹抛物线与最高点'}。"))
    return ChatResponse(reply=summary, tool_calls=[call] if call else [])


def _handle_free_build(request: ChatRequest, entities: dict) -> ChatResponse:
    action = entities.get("action", "add")
    etype = entities.get("elementType", "cube")
    tool_map = {
        "add": ("add_element", {"elementType": etype, "position": entities.get("position")}),
        "remove": ("remove_element", {"elementId": entities.get("elementId")}),
        "move": ("move_element", {"elementId": entities.get("elementId"),
                                  "position": entities.get("position")}),
        "rotate": ("rotate_element", {"elementId": entities.get("elementId"),
                                      "angle": entities.get("angle")}),
        "clear": ("clear_scene", {}),
        "list": ("list_elements", {}),
    }
    name, args = tool_map.get(action, ("add_element", {"elementType": etype}))
    # free_build 修改属性前先确认目标存在（SRS F3.2 同工具不同意图的差异）
    call, result = _run_tool(name, request, args)
    if "__error__" in result:
        return ChatResponse(reply=result["__error__"], tool_calls=[call] if call else [])

    type_names = {"cube": "方块", "sphere": "小球", "slope": "斜面", "wall": "地面"}
    if name == "add_element":
        fact = (f"已在场景加入一个{type_names.get(etype, etype)}"
                f"（编号 {result.get('added')}），当前共 {result.get('total')} 个元件")
    elif name == "clear_scene":
        fact = "场景已清空，可以重新开始搭建啦"
    elif name == "list_elements":
        items = result.get("elements", [])
        fact = "当前场景元件：" + ("、".join(
            f"{e['id']}({e['type']})" for e in items) if items else "（空场景）")
    else:
        fact = f"操作完成：{result}"
    return ChatResponse(reply=_llm_reply(request, fact), tool_calls=[call] if call else [])


def _handle_modify(request: ChatRequest, entities: dict) -> ChatResponse:
    prop = entities.get("property", "mass")
    value = entities.get("value")
    if value is None:
        num = None
        import re
        m = re.search(r"(\d+(?:\.\d+)?)", request.message)
        if m:
            value = float(m.group(1))
    args = {"elementId": entities.get("elementId"), "property": prop, "value": value}
    call, result = _run_tool("modify_element_property", request, args)
    if "__error__" in result:
        return ChatResponse(reply=result["__error__"], tool_calls=[call] if call else [])
    prop_names = {"mass": "质量", "friction": "摩擦系数", "restitution": "弹性系数",
                  "velocity": "初速度"}
    fact = (f"已把元件 {result.get('modified')} 的"
            f"{prop_names.get(prop, prop)} 改为 {result.get('value')}"
            f"（重新运行实验后生效）")
    return ChatResponse(reply=_llm_reply(request, fact), tool_calls=[call] if call else [])


def _handle_question(request: ChatRequest, entities: dict) -> ChatResponse:
    """问原理：RAG 教材检索（SRS F3.1）→ 带引用回答；未命中 → 通用回答 +【非教材引用】标注。"""
    from physicene_ai.core.rag_retriever import rag_retriever

    history = [{"role": m.role, "content": m.content} for m in request.history[-10:]]
    try:
        context, hits = rag_retriever.build_context(request.message)
    except Exception as e:  # noqa: BLE001 检索失败降级（SRS：两级降级）
        logger.warning("RAG 检索失败，降级通用回答: {}", str(e)[:120])
        context, hits = "", []

    if hits:
        system = QUESTION_SYSTEM_PROMPT + f"""

你检索到了以下教材片段（回答时以它们为主要依据，并可引用出处）：
{context[:6000]}"""
    else:
        system = QUESTION_SYSTEM_PROMPT + "\n\n（未检索到相关教材片段：基于通用物理知识回答，回答末尾标注【非教材引用】）"

    try:
        result = llm_client.chat(
            [{"role": "system", "content": system}, *history,
             {"role": "user", "content": request.message}],
            max_tokens=2000, temperature=0.7)
        reply = result.content
    except Exception:  # noqa: BLE001 LLM 失败 + 有检索结果 → 直接展示教材片段
        if hits:
            lines = [f"📖 {h['source']} {h['chapter']} P{h['page']}：\n{h['content'][:200]}…" for h in hits[:3]]
            return ChatResponse(reply="AI 暂时繁忙，先给你找到了教材相关片段：\n\n" + "\n\n".join(lines))
        raise

    if hits:
        refs = "\n".join(f"📖 {h['source']} {h['chapter']} 第{h['page']}页"
                         for h in hits[:5])
        reply = f"{reply}\n\n── 教材出处 ──\n{refs}"
    else:
        reply = f"{reply}\n\n【非教材引用】"
    return ChatResponse(reply=reply)


def _handle_analyze(request: ChatRequest, entities: dict) -> ChatResponse:
    """实验分析（第五周新增意图）：拉取真实实验数据 → LLM 结合数据做物理分析。"""
    import json
    args = {"recordId": request.record_id} if request.record_id else {}
    call, result = _run_tool("get_experiment_result", request, args)
    if "__error__" in result:
        return ChatResponse(reply=result["__error__"], tool_calls=[call] if call else [])
    if result.get("__no_record__"):
        return ChatResponse(reply="还没有做完的实验哦～先说「做个小车碰撞实验」跑一场，我再帮你分析。")

    summary = json.dumps(result, ensure_ascii=False, default=str)[:4500]
    if llm_client.mock:
        fact = (f"实验记录 #{result.get('recordId')}（{result.get('totalDuration')}s，"
                f"关键事件 {len(result.get('keyEvents') or [])} 个）。"
                f"mock 模式不生成分析。")
        return ChatResponse(reply=fact, tool_calls=[call] if call else [])
    try:
        reply = llm_client.chat(
            [{"role": "system", "content": ANALYZE_SYSTEM_PROMPT},
             {"role": "user", "content": f"学生问题：「{request.message}」\n\n实验数据摘要：\n{summary}"}],
            max_tokens=1500, temperature=0.5).content
        return ChatResponse(reply=reply, tool_calls=[call] if call else [])
    except Exception:  # noqa: BLE001 LLM 失败给出数据要点
        events = "、".join(f"{e['label']}@{e['t']}s" for e in (result.get("keyEvents") or [])[:4])
        return ChatResponse(
            reply=f"AI 暂时繁忙，先把数据要点给你：实验时长 {result.get('totalDuration')}s；"
                  f"关键事件：{events or '无'}；各物理量范围见曲线图。稍后再让我分析一次？",
            tool_calls=[call] if call else [])


def _handle_history(request: ChatRequest, entities: dict) -> ChatResponse:
    call, result = _run_tool("list_experiment_records", request,
                             {"limit": entities.get("limit", 5)})
    if "__error__" in result:
        return ChatResponse(reply=result["__error__"], tool_calls=[call] if call else [])
    items = result.get("items", [])
    if not items:
        return ChatResponse(reply="还没有实验记录哦，先做个小车碰撞实验试试？（说「做个小车碰撞实验」）",
                            tool_calls=[call] if call else [])
    lines = [f"• 实验 #{i['id']}（{i['status']}）{str(i['startTime'])[:16]}" for i in items]
    return ChatResponse(reply="最近的实验记录：\n" + "\n".join(lines)
                        + "\n做完的实验可以在画布下方回放～",
                        tool_calls=[call] if call else [])


def _llm_reply(request: ChatRequest, fact: str) -> str:
    """工具事实 → 自然语言总结（LLM 失败直接返回事实，不阻塞主流程）。"""
    if llm_client.mock:
        return fact
    try:
        result = llm_client.chat(
            [{"role": "system", "content": REPLY_SYSTEM_PROMPT},
             {"role": "user", "content": f"学生说：「{request.message}」。工具执行结果：{fact}。请总结。"}],
            max_tokens=300, temperature=0.7)
        return result.content or fact
    except Exception:  # noqa: BLE001 回复生成失败降级为事实陈述
        return fact
