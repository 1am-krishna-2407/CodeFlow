import uuid
from datetime import datetime, timezone

import pytest

from app.core import queue
from app.core.config import settings
from app.db.models import Job, JobResult, JobStatus

PY_JOB = {"language": "python", "source_code": 'print("hello")'}


def create_job(client, headers, **overrides):
    return client.post("/api/v1/jobs", json={**PY_JOB, **overrides}, headers=headers)


def set_status(db_session_factory, job_id, status, result=None):
    with db_session_factory() as db:
        job = db.get(Job, uuid.UUID(job_id))
        job.status = status
        if result:
            job.started_at = job.completed_at = datetime.now(timezone.utc)
            db.add(JobResult(job_id=job.id, **result))
        db.commit()


def test_create_list_get_delete(client, auth_headers, enqueued):
    resp = create_job(client, auth_headers, stdin="42\n")
    assert resp.status_code == 201
    job_id = resp.json()["job_id"]
    assert resp.json()["status"] == "queued"
    assert enqueued == [job_id]

    page = client.get("/api/v1/jobs", headers=auth_headers).json()
    assert page["total"] == 1
    assert page["items"][0]["id"] == job_id

    detail = client.get(f"/api/v1/jobs/{job_id}", headers=auth_headers).json()
    assert detail["source_code"] == PY_JOB["source_code"]
    assert detail["stdin"] == "42\n"
    assert detail["result"] is None

    assert client.delete(f"/api/v1/jobs/{job_id}", headers=auth_headers).status_code == 204
    assert client.get(f"/api/v1/jobs/{job_id}", headers=auth_headers).status_code == 404


def test_detail_includes_result(client, auth_headers, db_session_factory):
    job_id = create_job(client, auth_headers).json()["job_id"]
    set_status(db_session_factory, job_id, JobStatus.completed,
               {"stdout": "hello\n", "stderr": "", "exit_code": 0, "execution_time": 0.12})
    detail = client.get(f"/api/v1/jobs/{job_id}", headers=auth_headers).json()
    assert detail["status"] == "completed"
    assert detail["result"] == {
        "stdout": "hello\n", "stderr": "", "exit_code": 0, "execution_time": 0.12, "compile_time": None,
    }


def test_malformed_ids_are_client_errors_not_500s(client, auth_headers):
    assert client.get("/api/v1/jobs/not-a-uuid", headers=auth_headers).status_code == 422
    assert client.delete("/api/v1/jobs/not-a-uuid", headers=auth_headers).status_code == 422
    assert create_job(client, auth_headers, project_id="nope").status_code == 422
    assert client.get(f"/api/v1/jobs/{uuid.uuid4()}", headers=auth_headers).status_code == 404


def test_users_cannot_see_each_others_jobs(client, make_user):
    alice = make_user("alice@example.com")
    bob = make_user("bob@example.com")
    job_id = create_job(client, alice).json()["job_id"]

    assert client.get(f"/api/v1/jobs/{job_id}", headers=bob).status_code == 404
    assert client.delete(f"/api/v1/jobs/{job_id}", headers=bob).status_code == 404
    assert client.get("/api/v1/jobs", headers=bob).json()["total"] == 0


def test_cannot_attach_job_to_another_users_project(client, make_user):
    alice = make_user("alice@example.com")
    bob = make_user("bob@example.com")
    project_id = client.post("/api/v1/projects", json={"name": "Alice's"}, headers=alice).json()["id"]

    assert create_job(client, bob, project_id=project_id).status_code == 404
    assert create_job(client, alice, project_id=project_id).status_code == 201
    # The frontend sends "" for "no project".
    assert create_job(client, alice, project_id="").status_code == 201


@pytest.mark.parametrize(
    "overrides",
    [
        {"language": "bash"},
        {"source_code": ""},
        {"source_code": "   \n"},
        {"source_code": "print(1)\x00"},
        {"source_code": "x" * (settings.MAX_SOURCE_BYTES + 1)},
        # Within the character limit but over the byte limit once encoded.
        {"source_code": "é" * (settings.MAX_SOURCE_BYTES // 2 + 1)},
        {"stdin": "y" * (settings.MAX_STDIN_BYTES + 1)},
    ],
)
def test_job_payload_validation(client, auth_headers, enqueued, overrides):
    assert create_job(client, auth_headers, **overrides).status_code == 422
    assert enqueued == []


def test_queue_outage_fails_job_instead_of_leaving_it_queued(client, auth_headers, monkeypatch):
    def broken(_job_id):
        raise queue.QueueUnavailable("connection refused")

    monkeypatch.setattr(queue, "enqueue_job", broken)
    assert create_job(client, auth_headers).status_code == 503

    items = client.get("/api/v1/jobs", headers=auth_headers).json()["items"]
    assert [j["status"] for j in items] == ["failed"]


def test_active_job_cap(client, auth_headers, db_session_factory):
    ids = [create_job(client, auth_headers).json()["job_id"] for _ in range(settings.MAX_ACTIVE_JOBS_PER_USER)]
    assert create_job(client, auth_headers).status_code == 429

    set_status(db_session_factory, ids[0], JobStatus.completed)
    assert create_job(client, auth_headers).status_code == 201


def test_running_job_cannot_be_deleted(client, auth_headers, db_session_factory):
    job_id = create_job(client, auth_headers).json()["job_id"]
    set_status(db_session_factory, job_id, JobStatus.running)
    assert client.delete(f"/api/v1/jobs/{job_id}", headers=auth_headers).status_code == 409


def test_pagination_and_filters(client, auth_headers, db_session_factory):
    py = [create_job(client, auth_headers).json()["job_id"] for _ in range(3)]
    java = create_job(client, auth_headers, language="java", source_code="class Main {}").json()["job_id"]
    for job_id in py + [java]:
        set_status(db_session_factory, job_id, JobStatus.completed)
    set_status(db_session_factory, py[0], JobStatus.failed)

    page = client.get("/api/v1/jobs?limit=2&skip=0", headers=auth_headers).json()
    assert page["total"] == 4 and len(page["items"]) == 2
    page2 = client.get("/api/v1/jobs?limit=2&skip=2", headers=auth_headers).json()
    assert {j["id"] for j in page["items"]}.isdisjoint({j["id"] for j in page2["items"]})

    assert client.get("/api/v1/jobs?language=java", headers=auth_headers).json()["total"] == 1
    assert client.get("/api/v1/jobs?status=failed", headers=auth_headers).json()["total"] == 1
    assert client.get("/api/v1/jobs?status=bogus", headers=auth_headers).status_code == 422
    assert client.get("/api/v1/jobs?limit=1000", headers=auth_headers).status_code == 422


def test_dashboard_stats(client, auth_headers, db_session_factory):
    a, b, c = (create_job(client, auth_headers).json()["job_id"] for _ in range(3))
    set_status(db_session_factory, a, JobStatus.completed)
    set_status(db_session_factory, b, JobStatus.timeout)
    stats = client.get("/api/v1/dashboard/stats", headers=auth_headers).json()
    assert stats == {"total": 3, "success": 1, "failed": 0, "queued": 1, "running": 0, "timeout": 1}
