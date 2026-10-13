from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from pydantic import ValidationError
from sqlalchemy import create_engine

from app.core import queue
from app.core.config import Settings, normalize_database_url
from app.core.limiter import limiter
from app.db.base import Base
from tests.conftest import login, register

BACKEND_DIR = Path(__file__).resolve().parents[1]


def test_healthz(client):
    assert client.get("/healthz").json() == {"status": "ok"}


def test_readyz_reports_dependencies(client, monkeypatch):
    monkeypatch.setattr(queue, "ping", lambda: False)
    resp = client.get("/readyz")
    assert resp.status_code == 503
    assert resp.json()["checks"]["queue"] is False

    monkeypatch.setattr(queue, "ping", lambda: True)
    assert client.get("/readyz").status_code == 200


def test_login_is_rate_limited(client):
    register(client)
    limiter.enabled = True
    limiter.reset()
    try:
        codes = [login(client, password="wrong-password").status_code for _ in range(11)]
    finally:
        limiter.enabled = False
        limiter.reset()
    assert codes[:10] == [401] * 10
    assert codes[10] == 429


def test_request_id_is_echoed_only_when_safe(client):
    assert client.get("/healthz", headers={"X-Request-ID": "abc-123"}).headers["X-Request-ID"] == "abc-123"
    injected = client.get("/healthz", headers={"X-Request-ID": "x" * 500}).headers["X-Request-ID"]
    assert injected != "x" * 500


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("postgresql://u:p@db:5432/x", "postgresql+psycopg://u:p@db:5432/x"),
        ("postgres://u:p@db/x", "postgresql+psycopg://u:p@db/x"),
        ("postgresql+psycopg://u:p@db/x", "postgresql+psycopg://u:p@db/x"),
        ("sqlite:///./x.db", "sqlite:///./x.db"),
    ],
)
def test_database_url_driver_is_pinned(raw, expected):
    assert normalize_database_url(raw) == expected


def test_cors_origins_accept_json_or_csv():
    key = "k" * 40
    assert Settings(SECRET_KEY=key, CORS_ORIGINS='["https://a.io", "https://b.io"]').CORS_ORIGINS == ["https://a.io", "https://b.io"]
    assert Settings(SECRET_KEY=key, CORS_ORIGINS="https://a.io, https://b.io").CORS_ORIGINS == ["https://a.io", "https://b.io"]


@pytest.mark.parametrize("secret", ["supersecret", "replace-this-with-secure-random", "short"])
def test_weak_secret_keys_are_rejected(secret):
    with pytest.raises(ValidationError):
        Settings(SECRET_KEY=secret)


def test_migrations_match_models(tmp_path, monkeypatch):
    url = f"sqlite:///{(tmp_path / 'migrate.db').as_posix()}"
    monkeypatch.setattr("app.core.config.settings.DATABASE_URL", url)
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))

    command.upgrade(cfg, "head")
    engine = create_engine(url)
    with engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn), Base.metadata)
    assert diff == []

    command.downgrade(cfg, "base")
    engine.dispose()
