"""Job lifecycle, reliable queue and recovery, against SQLite + fakeredis."""
import uuid
from datetime import timedelta

import pytest
from sqlalchemy import select

from worker.config import WorkerConfig
from worker.db import job_results, jobs, utcnow
from worker.executors import ExecutionResult, SandboxUnavailable
from worker.main import USER_FACING_ENGINE_ERROR, Worker, process_job
from worker.queue import HEARTBEAT_PREFIX, QUEUE_KEY, JobQueue


class StubSandbox:
    def __init__(self, result=None, error=None):
        self.result, self.error, self.calls = result, error, []

    def run(self, image, script, source, stdin, timeout, limits):
        self.calls.append((image, source, stdin, timeout))
        if self.error:
            raise self.error
        return self.result

    def ensure_image(self, image):
        pass

    def remove_containers_of(self, owner):
        self.cleaned = getattr(self, "cleaned", []) + [owner]
        return 0


def job_row(engine, job_id):
    with engine.connect() as conn:
        job = conn.execute(select(jobs).where(jobs.c.id == job_id)).one()
        result = conn.execute(select(job_results).where(job_results.c.job_id == job_id)).one_or_none()
    return job, result


@pytest.mark.parametrize(
    "result, expected",
    [
        (ExecutionResult("hi\n", "", 0, False, 0.2), "completed"),
        (ExecutionResult("", "Traceback", 1, False, 0.2), "failed"),
        (ExecutionResult("", "timed out", -1, True, 10.0), "timeout"),
    ],
)
def test_process_job_records_outcome(engine, store, add_job, result, expected):
    job_id = add_job(stdin="5\n")
    sandbox = StubSandbox(result)
    assert process_job(str(job_id), store, sandbox, timeout=7) == expected

    job, res = job_row(engine, job_id)
    assert job.status == expected and job.started_at and job.completed_at
    assert (res.stdout, res.stderr, res.exit_code) == (result.stdout, result.stderr, result.exit_code)
    assert sandbox.calls[0][2:] == ("5\n", 7)


def test_sandbox_failure_marks_job_failed_with_generic_message(engine, store, add_job):
    job_id = add_job()
    assert process_job(str(job_id), store, StubSandbox(error=SandboxUnavailable("socket gone")), 5) == "failed"
    job, res = job_row(engine, job_id)
    assert job.status == "failed"
    assert res.stderr == USER_FACING_ENGINE_ERROR  # internal details stay in the logs


def test_unsupported_language_fails_cleanly(engine, store, add_job):
    job_id = add_job(language="cobol")
    assert process_job(str(job_id), store, StubSandbox(), 5) == "failed"
    assert job_row(engine, job_id)[0].status == "failed"


def test_job_is_only_claimed_once(store, add_job):
    job_id = add_job()
    sandbox = StubSandbox(ExecutionResult("", "", 0, False, 0.1))
    assert process_job(str(job_id), store, sandbox, 5) == "completed"
    # A duplicate queue entry for the same job must not run it again.
    assert process_job(str(job_id), store, sandbox, 5) is None
    assert len(sandbox.calls) == 1


def test_missing_or_malformed_jobs_are_skipped(store):
    sandbox = StubSandbox()
    assert process_job(str(uuid.uuid4()), store, sandbox, 5) is None
    assert process_job("not-a-uuid", store, sandbox, 5) is None
    assert sandbox.calls == []


def test_queue_pop_moves_to_processing_until_ack(redis_client, job_queue):
    redis_client.lpush(QUEUE_KEY, "first")
    redis_client.lpush(QUEUE_KEY, "second")
    assert job_queue.pop(timeout=1) == "first"  # FIFO
    assert job_queue.peek_all(job_queue.processing_key) == ["first"]
    job_queue.ack("first")
    assert job_queue.peek_all(job_queue.processing_key) == []


def make_worker(store, job_queue, **config):
    return Worker(WorkerConfig(**{"worker_id": job_queue.worker_id, **config}), job_queue, store, StubSandbox())


def test_jobs_of_a_dead_worker_are_recovered(engine, store, add_job, redis_client):
    job_id = add_job()
    dead = JobQueue(redis_client, "worker-dead")
    redis_client.lpush(QUEUE_KEY, str(job_id))
    assert dead.pop(timeout=1) == str(job_id)
    store.claim(job_id)  # it was mid-run when the worker died; no heartbeat key exists for it

    alive = JobQueue(redis_client, "worker-alive")
    alive.heartbeat()
    worker = make_worker(store, alive)
    assert worker.recover_orphans() == 1
    assert worker.sandbox.cleaned == ["worker-dead"]  # its leftover sandbox containers are removed too

    assert job_row(engine, job_id)[0].status == "queued"
    assert alive.pop(timeout=1) == str(job_id)


def test_live_workers_jobs_are_left_alone(store, add_job, redis_client):
    busy = JobQueue(redis_client, "worker-busy")
    busy.heartbeat()
    redis_client.lpush(QUEUE_KEY, str(add_job()))
    busy.pop(timeout=1)

    other = JobQueue(redis_client, "worker-other")
    assert make_worker(store, other).recover_orphans() == 0
    assert redis_client.exists(HEARTBEAT_PREFIX + "worker-busy")


def test_stale_running_jobs_are_failed(engine, store, add_job, job_queue):
    stale = add_job(status="running", started_at=utcnow() - timedelta(hours=1))
    fresh = add_job(status="running", started_at=utcnow())
    assert make_worker(store, job_queue, timeout_seconds=10).reap_stale() == 1
    assert job_row(engine, stale)[0].status == "failed"
    assert job_row(engine, fresh)[0].status == "running"


def test_worker_schema_matches_backend_models():
    """The worker's table definitions must be a compatible subset of the backend's (schema owner)."""
    models = pytest.importorskip("app.db.models", reason="backend package not importable")
    from worker.db import metadata

    for table in metadata.sorted_tables:
        backend_table = models.Base.metadata.tables[table.name]
        for column in table.columns:
            assert column.name in backend_table.columns, f"{table.name}.{column.name} missing in backend"
            assert type(column.type) is type(backend_table.columns[column.name].type) or column.name == "status"


def test_periodic_recovery_never_touches_own_in_flight_jobs(engine, store, add_job, redis_client):
    """Regression: housekeeping used to treat the worker's own processing list as orphaned every
    sweep, killing its running sandboxes and requeueing jobs that were mid-run."""
    me = JobQueue(redis_client, "worker-self")
    me.heartbeat()
    job_id = add_job()
    redis_client.lpush(QUEUE_KEY, str(job_id))
    me.pop(timeout=1)
    store.claim(job_id)

    worker = make_worker(store, me)
    assert worker.recover_orphans() == 0
    assert getattr(worker.sandbox, "cleaned", []) == []
    assert job_row(engine, job_id)[0].status == "running"
    assert me.peek_all(me.processing_key) == [str(job_id)]

    # After a restart, the same leftovers do belong to a dead incarnation and are recovered.
    assert worker.recover_orphans(at_startup=True) == 1
    assert worker.sandbox.cleaned == ["worker-self"]
    assert job_row(engine, job_id)[0].status == "queued"
