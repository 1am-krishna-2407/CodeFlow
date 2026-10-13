import os
import socket
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

# Local runs pick up the repo-level .env; in containers the variables come from compose.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")


def normalize_database_url(url: str) -> str:
    """Pin Postgres URLs to psycopg v3 (mirrors app.core.config in the backend)."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


def _int(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


@dataclass(frozen=True)
class WorkerConfig:
    database_url: str = field(
        default_factory=lambda: normalize_database_url(
            os.getenv("DATABASE_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/codeflow")
        )
    )
    redis_url: str = field(default_factory=lambda: os.getenv("REDIS_URL", "redis://localhost:6379/0"))
    worker_id: str = field(default_factory=lambda: os.getenv("WORKER_ID") or socket.gethostname())
    concurrency: int = field(default_factory=lambda: max(1, _int("WORKER_CONCURRENCY", 2)))
    timeout_seconds: int = field(default_factory=lambda: _int("EXECUTION_TIMEOUT_SECONDS", 10))
    prepull_images: bool = field(default_factory=lambda: os.getenv("PREPULL_IMAGES", "true").lower() == "true")
    reap_interval_seconds: int = field(default_factory=lambda: _int("REAP_INTERVAL_SECONDS", 60))
