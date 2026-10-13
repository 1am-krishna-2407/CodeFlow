import uuid
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session

from app.core import queue
from app.core.config import settings
from app.core.logging import logger
from app.db.models import Job as DBJob, JobStatus
from app.repositories.job_repo import JobRepository
from app.repositories.project_repo import ProjectRepository


class ProjectNotFound(Exception):
    pass


class TooManyActiveJobs(Exception):
    pass


class JobRunning(Exception):
    pass


class JobService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = JobRepository(db)

    def create_job(
        self,
        user_id: uuid.UUID,
        project_id: Optional[uuid.UUID],
        language: str,
        source_code: str,
        stdin: Optional[str] = None,
    ) -> DBJob:
        # Without this, any user could file jobs under another user's project.
        if project_id is not None and ProjectRepository(self.db).get_for_user(project_id, user_id) is None:
            raise ProjectNotFound()
        if self.repo.count_active_for_user(user_id) >= settings.MAX_ACTIVE_JOBS_PER_USER:
            raise TooManyActiveJobs()

        job = self.repo.create(user_id, project_id, language, source_code, stdin)
        try:
            queue.enqueue_job(str(job.id))
        except queue.QueueUnavailable as exc:
            # A job that never reached the queue would sit in "queued" forever; fail it visibly instead.
            logger.error(f"Failed to enqueue job {job.id}: {exc}", extra={"job_id": str(job.id)})
            self.repo.mark_failed(job)
            raise
        return job

    def list_jobs(
        self,
        user_id: uuid.UUID,
        skip: int,
        limit: int,
        status: Optional[JobStatus] = None,
        language: Optional[str] = None,
        project_id: Optional[uuid.UUID] = None,
    ) -> Tuple[List[DBJob], int]:
        return self.repo.list_for_user(user_id, skip, limit, status, language, project_id)

    def get_job(self, job_id: uuid.UUID, user_id: uuid.UUID) -> Optional[DBJob]:
        return self.repo.get_for_user(job_id, user_id)

    def delete_job(self, job_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        job = self.repo.get_for_user(job_id, user_id)
        if job is None:
            return False
        if job.status == JobStatus.running:
            raise JobRunning()
        self.repo.delete(job)
        return True

    def stats(self, user_id: uuid.UUID) -> dict:
        return self.repo.stats_for_user(user_id)
