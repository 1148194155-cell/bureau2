"""
应用配置 — pydantic-settings 读取 .env 文件
"""
import os
from pydantic import ConfigDict, Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """全局配置，优先读环境变量，否则走 .env 文件默认值"""
    app_name: str = "Music API"
    debug: bool = True
    database_url: str = "sqlite:///./items.db"
    secret_key: str = Field(
        default=os.urandom(24).hex(),
        validation_alias="JWT_SECRET_KEY",       # 允许 .env 中用 JWT_SECRET_KEY 覆盖
    )
    access_token_expire_minutes: int = 60
    log_level: str = "INFO"

    model_config = ConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
