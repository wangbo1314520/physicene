"""Java↔Python 通信契约（SRS F2.9/F4.2）：对外 JSON 一律 camelCase。"""
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ChatMessage(CamelModel):
    role: str = "user"
    content: str = ""


class ChatRequest(CamelModel):
    user_id: int
    session_id: str = ""
    scene_id: str | None = None
    record_id: int | None = None  # 实验分析意图用：刚完成的实验记录
    message: str
    history: list[ChatMessage] = Field(default_factory=list)


class ToolCall(CamelModel):
    name: str
    args: dict = Field(default_factory=dict)
    result: dict | str | None = None


class ChatResponse(CamelModel):
    reply: str
    tool_calls: list[ToolCall] = Field(default_factory=list)
    fallback: bool = False
    error_type: str | None = None


class IntentResult(CamelModel):
    intent: str
    confidence: float = 0.5
    entities: dict = Field(default_factory=dict)
    need_clarify: bool = False
