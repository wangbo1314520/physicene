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

    # 仓库外资源（项目磁盘约束：默认落在 E:\Program，换机器/容器用环境变量覆盖）
    bge_m3_path: str = r"E:\Program\models\bge-m3"
    chroma_dir: str = "data/chroma"
    textbooks_dir: str = r"E:\Program\resources\textbooks"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
