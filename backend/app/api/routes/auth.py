from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.limiter import limiter
from app.core.security import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.user import LoginPayload, RefreshPayload, RegisterPayload, TokenOut, UserOut
from app.services import auth_service

router = APIRouter()


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=UserOut)
@limiter.limit("5/minute")
def register(request: Request, payload: RegisterPayload, db: Session = Depends(get_db)):
    try:
        return auth_service.register_user(db, payload.name, payload.email, payload.password)
    except auth_service.EmailAlreadyRegistered:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")


@router.post("/login", response_model=TokenOut)
@limiter.limit("10/minute")
def login(request: Request, payload: LoginPayload, db: Session = Depends(get_db)):
    try:
        return auth_service.authenticate_user(db, payload.email, payload.password)
    except auth_service.InvalidCredentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")


@router.post("/refresh", response_model=TokenOut)
@limiter.limit("30/minute")
def refresh(request: Request, payload: RefreshPayload, db: Session = Depends(get_db)):
    try:
        return auth_service.refresh_tokens(db, payload.refresh_token)
    except auth_service.InvalidCredentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    auth_service.revoke_all_tokens(db, current_user)
