from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = ""
    supabase_url: str = ""
    typesafe_api_key: str = ""
    openai_api_key: str = ""
    openai_chat_model: str = "gpt-6-luna"
    supabase_jwt_secret: str = ""  # solo si el proyecto aún usa la clave legacy HS256
    cors_origins: str = "http://localhost:5173"
    ai_calls_enabled: bool = False
    reset_demo_enabled: bool = False  # POST /admin/reset-demo borra la demo: activarlo a mano

    @property
    def cors_list(self) -> list[str]:
        return [origen.strip() for origen in self.cors_origins.split(",") if origen.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
