from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.job import JobStatsOut
from app.services.job_service import JobService

router = APIRouter()


@router.get("/stats", response_model=JobStatsOut)
def stats(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return JobService(db).stats(current_user.id)
