"""DeepSeek LLM 客户端（SRS F3.5：超时 8s、重试 3 次退避 1/2/4s、带 usage 返回）。

mock 模式（LLM_MOCK=1）供离线测试：不联网，返回确定性占位，
意图路由由 IntentClassifier 的关键词规则兜底。
"""
import time

from openai import OpenAI

from physicene_ai.utils.config import settings
from physicene_ai.utils.logger import logger


class LLMUnavailableError(RuntimeError):
    pass

class KeyMissingError(LLMUnavailableError):
    """BYOK 未配置：DEEPSEEK_API_KEY 缺失（与通用 LLM 故障区分——前端给配置指引而非"繁忙"）"""


class LLMResult:
    def __init__(self, content: str, usage: dict):
        self.content = content
        self.usage = usage


class LLMClient:
    def __init__(self):
        self._client = None

    @property
    def client(self) -> OpenAI:
        if self._client is None:
            self._client = OpenAI(
                api_key=settings.deepseek_api_key,
                base_url=settings.deepseek_base_url,
                timeout=8.0,
                max_retries=0,  # 重试自己控制（1/2/4s 退避）
            )
        return self._client

    @property
    def mock(self) -> bool:
        return settings.llm_mock == 1 or not settings.deepseek_api_key

    def chat(self, messages: list[dict], max_tokens: int = 2000,
             temperature: float = 0.7) -> LLMResult:
        if not settings.deepseek_api_key:
            # BYOK（2026-10-12 定案）：未配 key 是 clone 后常态——显式指引而非 mock 文案
            raise KeyMissingError("DEEPSEEK_API_KEY 未配置（BYOK：部署者自带 key，见 README「AI 配置」）")
        if self.mock:
            return LLMResult("[mock] LLM 未接入，仅规则模式可用", {"total_tokens": 0})

        last_err: Exception | None = None
        for attempt, backoff in enumerate([1, 2, 4], start=1):
            try:
                resp = self.client.chat.completions.create(
                    model=settings.deepseek_model,
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
                usage = {
                    "prompt_tokens": resp.usage.prompt_tokens,
                    "completion_tokens": resp.usage.completion_tokens,
                    "total_tokens": resp.usage.total_tokens,
                }
                return LLMResult(resp.choices[0].message.content or "", usage)
            except Exception as e:  # noqa: BLE001 统一退避重试
                last_err = e
                logger.warning("LLM 调用失败(第{}次): {}", attempt, str(e)[:200])
                if attempt < 3:
                    time.sleep(backoff)
        raise LLMUnavailableError(f"DeepSeek 连续 3 次失败: {last_err}")


llm_client = LLMClient()
