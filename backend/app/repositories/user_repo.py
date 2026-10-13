import uuid
from typing import List, Optional

from sqlalchemy.orm import Session

from app.db.models import RoleEnum, User as DBUser


class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_email(self, email: str) -> Optional[DBUser]:
        return self.db.query(DBUser).filter(DBUser.email == email.strip().lower()).first()

    def get_by_id(self, id_: uuid.UUID) -> Optional[DBUser]:
        return self.db.get(DBUser, id_)

    def create(self, name: str, email: str, password_hash: str, role: RoleEnum = RoleEnum.user) -> DBUser:
        user = DBUser(name=name, email=email.strip().lower(), password_hash=password_hash, role=role)
        self.db.add(user)
        self.db.commit()
        return user

    def list(self, skip: int = 0, limit: int = 50) -> List[DBUser]:
        return self.db.query(DBUser).order_by(DBUser.created_at).offset(skip).limit(limit).all()

    def count(self) -> int:
        return self.db.query(DBUser).count()

    def set_role(self, user: DBUser, role: RoleEnum) -> DBUser:
        user.role = role
        self.db.commit()
        return user
