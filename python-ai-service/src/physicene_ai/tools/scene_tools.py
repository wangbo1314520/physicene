"""9 个 Agent 工具（SRS F3.3：run_simulation + list_experiment_records + 7 个自由搭建工具）。

场景操作统一模式：GET 当前场景 → 组装 elements → PUT 全量替换（契约规定）。
"""
from physicene_ai.tools.base import BaseTool
from physicene_ai.tools.java_client import JavaApiError, java_client

ELEMENT_DEFAULTS = {
    "cube": {"scale": {"x": 1, "y": 1}, "isFixed": False, "color": "#4A90D9"},
    "sphere": {"scale": {"x": 1, "y": 1}, "isFixed": False, "color": "#F5C542"},
    "slope": {"scale": {"x": 2, "y": 2.3}, "isFixed": True, "color": "#3ecf8e"},
    "wall": {"scale": {"x": 20, "y": 0.2}, "isFixed": True, "color": "#8a8aa0"},
}


def _next_id(elements: list[dict], etype: str) -> str:
    n = 0
    for el in elements:
        if str(el.get("id", "")).startswith(etype + "_"):
            try:
                n = max(n, int(str(el["id"]).split("_")[-1]))
            except ValueError:
                pass
    return f"{etype}_{n + 1:03d}"


class RunSimulationTool(BaseTool):
    name = "run_simulation"
    description = "加载模板并运行实验（模板名 → 派生场景 → 仿真）"
    args_spec = {"template": "collision|projectile"}

    def execute(self, user_id: int, scene_id, args: dict) -> dict:
        template = args.get("template", "collision")
        scene = java_client.load_template(user_id, f"template_{template}")
        run = java_client.run_simulation(user_id, str(scene["id"]))
        return {"sceneId": scene["id"], "simId": run.get("simId"),
                "recordId": run.get("recordId"), "wsUrl": run.get("wsUrl")}


class ListExperimentRecordsTool(BaseTool):
    name = "list_experiment_records"
    description = "查看当前学生最近的历史实验记录"
    args_spec = {"limit": "默认 5"}

    def execute(self, user_id: int, scene_id, args: dict) -> dict:
        data = java_client.list_records(user_id, int(args.get("limit", 5)))
        items = data.get("items", [])
        return {"total": data.get("total"),
                "items": [{"id": i.get("id"), "status": i.get("status"),
                           "startTime": i.get("startTime")} for i in items]}


class AddElementTool(BaseTool):
    name = "add_element"
    description = "向当前场景添加元件"
    args_spec = {"elementType": "cube|sphere|slope|wall", "position": "{x,y} 可选"}

    def execute(self, user_id: int, scene_id, args: dict) -> dict:
        if not scene_id:
            raise JavaApiError(400, "当前没有打开的场景，请先创建或加载一个场景")
        scene = java_client.get_scene(scene_id, user_id)
        elements: list[dict] = list(scene.get("elements", []))
        etype = args.get("elementType", "cube")
        if etype not in ELEMENT_DEFAULTS:
            raise JavaApiError(400, f"暂不支持的元件类型：{etype}")
        pos = args.get("position") or {"x": 0, "y": 3}
        defaults = ELEMENT_DEFAULTS[etype]
        element = {
            "id": _next_id(elements, etype),
            "type": etype,
            "position": {"x": float(pos.get("x", 0)), "y": float(pos.get("y", 3))},
            "angle": 0,
            "scale": defaults["scale"],
            "properties": {"mass": 1, "friction": 0.1, "restitution": 0.5},
            "initialState": {"velocity": {"x": 0, "y": 0}},
            "isFixed": defaults["isFixed"],
            "color": defaults["color"],
        }
        elements.append(element)
        java_client.update_scene(scene_id, user_id, elements, scene.get("config", {}))
        return {"added": element["id"], "type": etype, "total": len(elements)}


class RemoveElementTool(BaseTool):
    name = "remove_element"
    description = "从场景删除指定元件"
    args_spec = {"elementId": "如 cube_001"}

    def execute(self, user_id: int, scene_id, args: dict) -> dict:
        if not scene_id:
            raise JavaApiError(400, "当前没有打开的场景")
        scene = java_client.get_scene(scene_id, user_id)
        elements: list[dict] = list(scene.get("elements", []))
        target = args.get("elementId") or _last_dynamic_id(elements)
        before = len(elements)
        elements = [e for e in elements if e.get("id") != target]
        if len(elements) == before:
            raise JavaApiError(404, f"场景里没有元件 {target}")
        java_client.update_scene(scene_id, user_id, elements, scene.get("config", {}))
        return {"removed": target, "total": len(elements)}


class MoveElementTool(BaseTool):
    name = "move_element"
    description = "移动元件位置"
    args_spec = {"elementId": "可选", "position": "{x,y}"}

    def execute(self, user_id: int, scene_id, args: dict) -> dict:
        if not scene_id:
            raise JavaApiError(400, "当前没有打开的场景")
        scene = java_client.get_scene(scene_id, user_id)
        elements: list[dict] = list(scene.get("elements", []))
        target = args.get("elementId") or _last_dynamic_id(elements)
        pos = args.get("position") or {}
        moved = None
        for e in elements:
            if e.get("id") == target:
                e["position"] = {"x": float(pos.get("x", e["position"]["x"])),
                                 "y": float(pos.get("y", e["position"]["y"]))}
                moved = target
        if not moved:
            raise JavaApiError(404, f"场景里没有元件 {target}")
        java_client.update_scene(scene_id, user_id, elements, scene.get("config", {}))
        return {"moved": moved, "position": pos}


class RotateElementTool(BaseTool):
    name = "rotate_element"
    description = "旋转元件角度"
    args_spec = {"elementId": "可选", "angle": "弧度或度"}

    def execute(self, user_id: int, scene_id, args: dict) -> dict:
        if not scene_id:
            raise JavaApiError(400, "当前没有打开的场景")
        scene = java_client.get_scene(scene_id, user_id)
        elements: list[dict] = list(scene.get("elements", []))
        target = args.get("elementId") or _last_dynamic_id(elements)
        import math
        angle = float(args.get("angle", math.pi / 6))
        if angle > 2 * math.pi:  # 度 → 弧度
            angle = math.radians(angle)
        found = False
        for e in elements:
            if e.get("id") == target:
                e["angle"] = angle
                found = True
        if not found:
            raise JavaApiError(404, f"场景里没有元件 {target}")
        java_client.update_scene(scene_id, user_id, elements, scene.get("config", {}))
        return {"rotated": target, "angle": angle}


class ModifyElementPropertyTool(BaseTool):
    name = "modify_element_property"
    description = "修改元件物理属性（质量/摩擦/弹性/初速度）"
    args_spec = {"elementId": "可选", "property": "mass|friction|restitution|velocity", "value": "数值或向量"}

    def execute(self, user_id: int, scene_id, args: dict) -> dict:
        if not scene_id:
            raise JavaApiError(400, "当前没有打开的场景")
        scene = java_client.get_scene(scene_id, user_id)
        elements: list[dict] = list(scene.get("elements", []))
        target = args.get("elementId") or _last_dynamic_id(elements)
        prop = args.get("property", "mass")
        value = args.get("value")
        if value is None:
            raise JavaApiError(400, "缺少要修改的数值")
        found = False
        for e in elements:
            if e.get("id") == target:
                if prop == "velocity":
                    v = value if isinstance(value, dict) else {"x": float(value), "y": 0}
                    e.setdefault("initialState", {})["velocity"] = v
                else:
                    e.setdefault("properties", {})[prop] = float(value)
                found = True
        if not found:
            raise JavaApiError(404, f"场景里没有元件 {target}，可以先用 list_elements 看看有哪些")
        java_client.update_scene(scene_id, user_id, elements, scene.get("config", {}))
        return {"modified": target, "property": prop, "value": value}


class ListElementsTool(BaseTool):
    name = "list_elements"
    description = "列出当前场景所有元件"

    def execute(self, user_id: int, scene_id, args: dict) -> dict:
        if not scene_id:
            raise JavaApiError(400, "当前没有打开的场景")
        scene = java_client.get_scene(scene_id, user_id)
        return {"elements": [
            {"id": e.get("id"), "type": e.get("type"),
             "position": e.get("position")} for e in scene.get("elements", [])]}


class ClearSceneTool(BaseTool):
    name = "clear_scene"
    description = "清空当前场景所有元件"

    def execute(self, user_id: int, scene_id, args: dict) -> dict:
        if not scene_id:
            raise JavaApiError(400, "当前没有打开的场景")
        scene = java_client.get_scene(scene_id, user_id)
        java_client.update_scene(scene_id, user_id, [], scene.get("config", {}))
        return {"cleared": True}


def _last_dynamic_id(elements: list[dict]) -> str | None:
    """未指明目标时取最后一个可动元件（学生直觉：改的就是刚放的东西）。"""
    for e in reversed(elements):
        if not e.get("isFixed"):
            return e.get("id")
    return elements[-1].get("id") if elements else None
