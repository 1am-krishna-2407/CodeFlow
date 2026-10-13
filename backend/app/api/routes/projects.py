import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.project import ProjectCreatePayload, ProjectOut
from app.services.project_service import ProjectService

router = APIRouter()


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ProjectOut)
def create_project(
    payload: ProjectCreatePayload, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return ProjectService(db).create_project(current_user.id, payload.name, payload.description)


@router.get("", response_model=List[ProjectOut])
def list_projects(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ProjectService(db).list_projects(current_user.id)


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = ProjectService(db).get_project(project_id, current_user.id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    if not ProjectService(db).delete_project(project_id, current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
