import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user, require_admin
from app.db.models import RoleEnum, User
from app.db.session import get_db
from app.repositories.user_repo import UserRepository
from app.schemas.user import RoleUpdatePayload, UserOut

router = APIRouter()


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("", response_model=List[UserOut])
def list_users(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return UserRepository(db).list(skip=skip, limit=limit)


@router.patch("/{user_id}/role", response_model=UserOut)
def update_role(
    user_id: uuid.UUID,
    payload: RoleUpdatePayload,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    repo = UserRepository(db)
    user = repo.get_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.id == admin.id and payload.role != RoleEnum.admin:
        # Stops the last admin from locking everyone out by accident.
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Admins cannot demote themselves")
    return repo.set_role(user, payload.role)
