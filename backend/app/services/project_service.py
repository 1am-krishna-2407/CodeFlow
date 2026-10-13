import uuid
from typing import List, Optional

from sqlalchemy.orm import Session

from app.db.models import Project as DBProject
from app.repositories.project_repo import ProjectRepository


class ProjectService:
    def __init__(self, db: Session):
        self.repo = ProjectRepository(db)

    def create_project(self, user_id: uuid.UUID, name: str, description: Optional[str] = None) -> DBProject:
        return self.repo.create(user_id=user_id, name=name, description=description)

    def list_projects(self, user_id: uuid.UUID) -> List[DBProject]:
        return self.repo.list_for_user(user_id)

    def get_project(self, project_id: uuid.UUID, user_id: uuid.UUID) -> Optional[DBProject]:
        return self.repo.get_for_user(project_id, user_id)

    def delete_project(self, project_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        project = self.repo.get_for_user(project_id, user_id)
        if project is None:
            return False
        self.repo.delete(project)
        return True
