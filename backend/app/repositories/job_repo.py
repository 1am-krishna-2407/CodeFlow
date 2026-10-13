import uuid
from typing import List, Optional, Tuple

from sqlalchemy import case, func
from sqlalchemy.orm import Session, joinedload

from app.db.models import Job as DBJob, JobStatus


class JobRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(
        self,
        user_id: uuid.UUID,
        project_id: Optional[uuid.UUID],
        language: str,
        source_code: str,
        stdin: Optional[str],
    ) -> DBJob:
        job = DBJob(user_id=user_id, project_id=project_id, language=language, source_code=source_code, stdin=stdin)
        self.db.add(job)
        self.db.commit()
        return job

    def get_for_user(self, job_id: uuid.UUID, user_id: uuid.UUID) -> Optional[DBJob]:
        return (
            self.db.query(DBJob)
            .options(joinedload(DBJob.result))
            .filter(DBJob.id == job_id, DBJob.user_id == user_id)
            .first()
        )

    def list_for_user(
        self,
        user_id: uuid.UUID,
        skip: int,
        limit: int,
        status: Optional[JobStatus] = None,
        language: Optional[str] = None,
        project_id: Optional[uuid.UUID] = None,
    ) -> Tuple[List[DBJob], int]:
        query = self.db.query(DBJob).filter(DBJob.user_id == user_id)
        if status is not None:
            query = query.filter(DBJob.status == status)
        if language is not None:
            query = query.filter(DBJob.language == language)
        if project_id is not None:
            query = query.filter(DBJob.project_id == project_id)
        total = query.count()
        items = query.order_by(DBJob.created_at.desc(), DBJob.id).offset(skip).limit(limit).all()
        return items, total

    def count_active_for_user(self, user_id: uuid.UUID) -> int:
        return (
            self.db.query(DBJob)
            .filter(DBJob.user_id == user_id, DBJob.status.in_((JobStatus.queued, JobStatus.running)))
            .count()
        )

    def stats_for_user(self, user_id: uuid.UUID) -> dict:
        row = (
            self.db.query(
                func.count(DBJob.id).label("total"),
                func.count(case((DBJob.status == JobStatus.completed, 1))).label("success"),
                func.count(case((DBJob.status == JobStatus.failed, 1))).label("failed"),
                func.count(case((DBJob.status == JobStatus.queued, 1))).label("queued"),
                func.count(case((DBJob.status == JobStatus.running, 1))).label("running"),
                func.count(case((DBJob.status == JobStatus.timeout, 1))).label("timeout"),
            )
            .filter(DBJob.user_id == user_id)
            .one()
        )
        return dict(row._mapping)

    def mark_failed(self, job: DBJob) -> None:
        job.status = JobStatus.failed
        self.db.commit()

    def delete(self, job: DBJob) -> None:
        self.db.delete(job)
        self.db.commit()
