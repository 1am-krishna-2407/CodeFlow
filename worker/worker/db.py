"""The worker's view of the jobs schema.

Only the columns the worker reads or writes are declared. The schema itself is owned by the backend's
Alembic migrations; this module must stay compatible with backend/alembic/versions.
"""
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import (
    Column, DateTime, Enum, Float, Integer, MetaData, String, Table, Text, Uuid, create_engine, delete, insert,
    select, update,
)
from sqlalchemy.engine import Engine

metadata = MetaData()

# create_type=False: the enum type belongs to the migrations, the worker never creates it.
job_status = Enum("queued", "running", "completed", "failed", "timeout", name="jobstatus", create_type=False)

jobs = Table(
    "jobs",
    metadata,
    Column("id", Uuid, primary_key=True),
    Column("language", String(32)),
    Column("source_code", Text),
    Column("stdin", Text),
    Column("status", job_status),
    Column("started_at", DateTime(timezone=True)),
    Column("completed_at", DateTime(timezone=True)),
)

job_results = Table(
    "job_results",
    metadata,
    Column("id", Uuid, primary_key=True),
    Column("job_id", Uuid),
    Column("stdout", Text),
    Column("stderr", Text),
    Column("exit_code", Integer),
    Column("execution_time", Float),
    Column("compile_time", Float),
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def make_engine(url: str) -> Engine:
    if url.startswith("sqlite"):
        return create_engine(url, connect_args={"check_same_thread": False})
    return create_engine(url, pool_pre_ping=True)


@dataclass(frozen=True)
class ClaimedJob:
    id: uuid.UUID
    language: str
    source_code: str
    stdin: Optional[str]


class JobStore:
    def __init__(self, engine: Engine):
        self.engine = engine

    def claim(self, job_id: uuid.UUID) -> Optional[ClaimedJob]:
        """Atomically move a job from queued to running. Returns None if someone else got it, or it's gone."""
        with self.engine.begin() as conn:
            claimed = conn.execute(
                update(jobs)
                .where(jobs.c.id == job_id, jobs.c.status == "queued")
                .values(status="running", started_at=utcnow(), completed_at=None)
            ).rowcount
            if claimed != 1:
                return None
            row = conn.execute(
                select(jobs.c.id, jobs.c.language, jobs.c.source_code, jobs.c.stdin).where(jobs.c.id == job_id)
            ).one()
        return ClaimedJob(id=row.id, language=row.language, source_code=row.source_code, stdin=row.stdin)

    def finish(
        self, job_id: uuid.UUID, status: str, stdout: str, stderr: str, exit_code: int, execution_time: Optional[float],
        compile_time: Optional[float] = None,
    ) -> bool:
        with self.engine.begin() as conn:
            # A job recovered after a crash may already have a partial result row.
            conn.execute(delete(job_results).where(job_results.c.job_id == job_id))
            conn.execute(
                insert(job_results).values(
                    id=uuid.uuid4(), job_id=job_id, stdout=stdout, stderr=stderr,
                    exit_code=exit_code, execution_time=execution_time, compile_time=compile_time,
                )
            )
            updated = conn.execute(
                update(jobs)
                .where(jobs.c.id == job_id, jobs.c.status == "running")
                .values(status=status, completed_at=utcnow())
            ).rowcount
        return updated == 1

    def fail(self, job_id: uuid.UUID, message: str) -> bool:
        return self.finish(job_id, "failed", "", message, -1, 0.0)

    def reset_to_queued(self, job_id: uuid.UUID) -> bool:
        with self.engine.begin() as conn:
            return conn.execute(
                update(jobs)
                .where(jobs.c.id == job_id, jobs.c.status == "running")
                .values(status="queued", started_at=None)
            ).rowcount == 1

    def stale_running(self, started_before: datetime) -> List[uuid.UUID]:
        with self.engine.connect() as conn:
            return list(
                conn.execute(
                    select(jobs.c.id).where(jobs.c.status == "running", jobs.c.started_at < started_before)
                ).scalars()
            )
