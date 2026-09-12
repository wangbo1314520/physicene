"""全局配置（pydantic-settings 读 .env，SRS 4.2：密钥不进代码）。"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"
    internal_key: str = "physicene-internal-2026-dev"
    java_base_url: str = "http://localhost:8080"
    redis_url: str = "redis://localhost:6379/0"
    llm_mock: int = 0

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
