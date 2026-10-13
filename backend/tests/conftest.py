import os

# Must be set before any app module is imported: settings are read at import time.
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SECRET_KEY"] = "test-secret-key-that-is-long-enough-0123456789"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["RATE_LIMIT_STORAGE_URI"] = "memory://"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import queue
from app.db.base import Base
from app.db.models import RoleEnum
from app.db.session import get_db, make_engine
from app.main import app
from app.repositories.user_repo import UserRepository


@pytest.fixture()
def db_engine():
    engine = make_engine("sqlite://", poolclass=StaticPool)
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture()
def db_session_factory(db_engine):
    return sessionmaker(bind=db_engine, autoflush=False, expire_on_commit=False)


@pytest.fixture()
def enqueued(monkeypatch):
    """Replaces Redis with an in-memory list of enqueued job ids."""
    jobs = []
    monkeypatch.setattr(queue, "enqueue_job", jobs.append)
    return jobs


@pytest.fixture()
def client(db_session_factory, enqueued):
    def override_get_db():
        db = db_session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def register(client, email="user@example.com", password="Password123!", name="Test User"):
    return client.post("/api/v1/auth/register", json={"name": name, "email": email, "password": password})


def login(client, email="user@example.com", password="Password123!"):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


@pytest.fixture()
def make_user(client):
    def _make(email="user@example.com", password="Password123!"):
        assert register(client, email=email, password=password).status_code == 201
        tokens = login(client, email=email, password=password).json()
        return {"Authorization": f"Bearer {tokens['access_token']}"}

    return _make


@pytest.fixture()
def auth_headers(make_user):
    return make_user()


@pytest.fixture()
def make_admin(client, make_user, db_session_factory):
    def _make(email="admin@example.com"):
        headers = make_user(email=email)
        with db_session_factory() as db:
            repo = UserRepository(db)
            repo.set_role(repo.get_by_email(email), RoleEnum.admin)
        return headers

    return _make
