import json
from pathlib import Path
from typing import Annotated, List

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[3]
ENV_FILE = BASE_DIR / ".env"
if not ENV_FILE.exists():
    ENV_FILE = Path.cwd() / ".env"

WEAK_SECRETS = {"supersecret", "secret", "changeme", "replace-this-with-secure-random"}


def normalize_database_url(url: str) -> str:
    """Pin Postgres URLs to the psycopg (v3) driver we ship.

    SQLAlchemy 2.1 maps a bare ``postgresql://`` to psycopg v3 while 2.0 maps it
    to psycopg2, so leaving the driver implicit breaks whenever either moves.
    """
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ENV_FILE), env_file_encoding="utf-8", extra="ignore")

    PROJECT_NAME: str = "CodeFlow"
    # No default: a missing key must fail startup loudly rather than fall back to something guessable.
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7
    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@localhost:5432/codeflow"
    REDIS_URL: str = "redis://localhost:6379/0"
    # Accepts a JSON list or a comma-separated string.
    CORS_ORIGINS: Annotated[List[str], NoDecode] = ["http://localhost:5173"]

    # "memory://" is per-process; use the Redis URL whenever more than one API process runs.
    RATE_LIMIT_STORAGE_URI: str = "memory://"
    RATE_LIMIT_ENABLED: bool = True

    MAX_SOURCE_BYTES: int = 64 * 1024
    MAX_STDIN_BYTES: int = 64 * 1024
    MAX_ACTIVE_JOBS_PER_USER: int = 5

    @field_validator("DATABASE_URL")
    @classmethod
    def _normalize_db_url(cls, v: str) -> str:
        return normalize_database_url(v)

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _parse_cors(cls, v):
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("["):
                parsed = json.loads(v)
                if not isinstance(parsed, list):
                    raise ValueError("CORS_ORIGINS JSON must be a list")
                return [str(o).strip() for o in parsed if str(o).strip()]
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @field_validator("SECRET_KEY")
    @classmethod
    def _secret_key_must_be_strong(cls, v: str) -> str:
        if v.lower() in WEAK_SECRETS or len(v) < 32:
            raise ValueError(
                "SECRET_KEY must be a random value of at least 32 characters. "
                'Generate one with: python -c "import secrets; print(secrets.token_hex(32))"'
            )
        return v


settings = Settings()
