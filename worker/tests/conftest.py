import os
import uuid
from datetime import datetime, timezone

import fakeredis
import pytest
from sqlalchemy import insert
from sqlalchemy.pool import StaticPool
from sqlalchemy import create_engine

from worker.db import JobStore, jobs, metadata
from worker.queue import JobQueue


@pytest.fixture()
def engine():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture()
def store(engine):
    return JobStore(engine)


@pytest.fixture()
def add_job(engine):
    def _add(language="python", source="print(1)", stdin=None, status="queued", started_at=None):
        job_id = uuid.uuid4()
        with engine.begin() as conn:
            conn.execute(
                insert(jobs).values(
                    id=job_id, language=language, source_code=source, stdin=stdin,
                    status=status, started_at=started_at,
                )
            )
        return job_id

    return _add


@pytest.fixture()
def redis_client():
    return fakeredis.FakeRedis()


@pytest.fixture()
def job_queue(redis_client):
    return JobQueue(redis_client, "worker-a")


def docker_available() -> bool:
    if os.getenv("CODEFLOW_SKIP_DOCKER_TESTS"):
        return False
    try:
        import docker

        docker.from_env().ping()
        return True
    except Exception:
        return False


def pytest_collection_modifyitems(config, items):
    if docker_available():
        return
    skip = pytest.mark.skip(reason="Docker daemon not available")
    for item in items:
        if "docker" in item.keywords:
            item.add_marker(skip)


def utc(*args):
    return datetime(*args, tzinfo=timezone.utc)
