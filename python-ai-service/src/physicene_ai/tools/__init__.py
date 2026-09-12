"""工具注册表（SRS F3.3）：Agent 启动时读表；加新工具只加注册条目。"""
from physicene_ai.tools.base import BaseTool
from physicene_ai.tools.scene_tools import (
    AddElementTool,
    ClearSceneTool,
    ListElementsTool,
    ListExperimentRecordsTool,
    ModifyElementPropertyTool,
    MoveElementTool,
    RemoveElementTool,
    RotateElementTool,
    RunSimulationTool,
)

_TOOLS: list[type[BaseTool]] = [
    RunSimulationTool,
    ListExperimentRecordsTool,
    AddElementTool,
    RemoveElementTool,
    MoveElementTool,
    RotateElementTool,
    ModifyElementPropertyTool,
    ListElementsTool,
    ClearSceneTool,
]


class ToolRegistry:
    def __init__(self):
        self.tools: dict[str, BaseTool] = {t.name: t() for t in _TOOLS}

    def get(self, name: str) -> BaseTool | None:
        return self.tools.get(name)

    def execute(self, name: str, user_id: int, scene_id, args: dict) -> dict:
        tool = self.get(name)
        if tool is None:
            raise KeyError(f"非白名单工具: {name}")
        return tool.execute(user_id, scene_id, args or {})

    def summaries(self) -> list[dict]:
        return [{"name": t.name, "description": t.description, "args": t.args_spec}
                for t in self.tools.values()]


tool_registry = ToolRegistry()
