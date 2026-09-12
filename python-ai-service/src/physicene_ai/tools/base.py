"""Agent 工具基类（SRS F3.3：加新工具只加注册条目，不动 Agent 主循环）。"""
from abc import ABC, abstractmethod


class BaseTool(ABC):
    """一个工具 = 名字 + 描述 + schema + 执行。args 由 AgentEngine 从意图实体填充。"""

    #: 工具名（Agent 回复展示用）
    name: str = ""
    #: 一句话描述（答辩讲"工具注册表"用）
    description: str = ""
    #: 需要哪些参数（文档化；Week 4 实体由意图分类器 LLM 抽取）
    args_spec: dict = {}

    @abstractmethod
    def execute(self, user_id: int, scene_id: str | None, args: dict) -> dict:
        """执行并返回结构化结果（错误抛 JavaApiError 由引擎转自然语言反问）。"""
