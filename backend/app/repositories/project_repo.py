import uuid
from typing import List, Optional

from sqlalchemy.orm import Session

from app.db.models import Project as DBProject


class ProjectRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, user_id: uuid.UUID, name: str, description: Optional[str] = None) -> DBProject:
        project = DBProject(user_id=user_id, name=name, description=description)
        self.db.add(project)
        self.db.commit()
        return project

    def get_for_user(self, project_id: uuid.UUID, user_id: uuid.UUID) -> Optional[DBProject]:
        return self.db.query(DBProject).filter(DBProject.id == project_id, DBProject.user_id == user_id).first()

    def list_for_user(self, user_id: uuid.UUID) -> List[DBProject]:
        return self.db.query(DBProject).filter(DBProject.user_id == user_id).order_by(DBProject.created_at.desc()).all()

    def delete(self, project: DBProject) -> None:
        self.db.delete(project)
        self.db.commit()
