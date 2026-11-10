"""Configuration from environment variables (see .env.example)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="WB_", env_file=".env", extra="ignore")

    environment: str = "development"
    # Comma-separated list of web origins allowed to call the API.
    allowed_origins: str = "http://localhost:5175,http://localhost:4173"
    # SQLite locally; Render sets a Postgres URL.
    database_url: str = "sqlite:///./waterbuddy.db"
    # Web push keys. Generate a pair with: python -m app.vapid
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:hello@waterbuddy.example"
    # Shared secret for the scheduler trigger (POST /internal/send-due). Empty disables it.
    cron_token: str = ""
    # Also check for due reminders every minute inside the web process.
    scheduler_enabled: bool = False

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def push_configured(self) -> bool:
        return bool(self.vapid_public_key and self.vapid_private_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
