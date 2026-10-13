import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.core.limiter import limiter
from app.core.queue import QueueUnavailable
from app.core.security import get_current_user
from app.db.models import JobStatus, User
from app.db.session import get_db
from app.schemas.job import JobCreatedOut, JobCreatePayload, JobDetailOut, JobPageOut, Language
from app.services.job_service import JobRunning, JobService, ProjectNotFound, TooManyActiveJobs

router = APIRouter()


@router.post("", status_code=status.HTTP_201_CREATED, response_model=JobCreatedOut)
@limiter.limit("20/minute")
def create_job(
    request: Request,
    payload: JobCreatePayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        job = JobService(db).create_job(
            current_user.id, payload.project_id, payload.language, payload.source_code, payload.stdin
        )
    except ProjectNotFound:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    except TooManyActiveJobs:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many jobs in progress. Wait for some to finish before submitting more.",
        )
    except QueueUnavailable:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Execution queue is unavailable. Please try again shortly.",
        )
    return JobCreatedOut(job_id=job.id, status=job.status)


@router.get("", response_model=JobPageOut)
def list_jobs(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    status_filter: Optional[JobStatus] = Query(default=None, alias="status"),
    language: Optional[Language] = Query(default=None),
    project_id: Optional[uuid.UUID] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items, total = JobService(db).list_jobs(current_user.id, skip, limit, status_filter, language, project_id)
    return JobPageOut(items=items, total=total, skip=skip, limit=limit)


@router.get("/{job_id}", response_model=JobDetailOut)
def get_job(job_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    job = JobService(db).get_job(job_id, current_user.id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return job


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(job_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        deleted = JobService(db).delete_job(job_id, current_user.id)
    except JobRunning:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot delete a job while it is running")
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
