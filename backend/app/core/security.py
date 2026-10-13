import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional, Tuple

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import RoleEnum, User
from app.db.session import get_db

ALGORITHM = "HS256"
TokenType = Literal["access", "refresh"]

_hasher = PasswordHasher()
# Verified against when the email is unknown so a login takes the same time either way.
_DUMMY_HASH = _hasher.hash("codeflow-timing-equaliser")

bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(plain: str, hashed: Optional[str]) -> bool:
    try:
        return _hasher.verify(hashed or _DUMMY_HASH, plain) and hashed is not None
    except (VerificationError, InvalidHashError):
        return False


def create_token(
    user_id: str, token_type: TokenType, expires_delta: Optional[timedelta] = None, version: int = 0
) -> str:
    if expires_delta is None:
        minutes = settings.ACCESS_TOKEN_EXPIRE_MINUTES if token_type == "access" else settings.REFRESH_TOKEN_EXPIRE_MINUTES
        expires_delta = timedelta(minutes=minutes)
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id), "type": token_type, "ver": version,
        "iat": now, "exp": now + expires_delta, "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str, expected_type: TokenType) -> Tuple[uuid.UUID, int]:
    """Return (user id, token version) from a valid token of the expected type, or raise ValueError."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM], options={"require": ["exp", "sub"]})
    except jwt.PyJWTError as exc:
        raise ValueError("invalid token") from exc
    # Without this check a long-lived refresh token would also work as an access token.
    if payload.get("type") != expected_type:
        raise ValueError("wrong token type")
    try:
        return uuid.UUID(payload["sub"]), int(payload.get("ver", 0))
    except (ValueError, TypeError) as exc:
        raise ValueError("invalid subject") from exc


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise _unauthorized()
    try:
        user_id, version = decode_token(credentials.credentials, "access")
    except ValueError:
        raise _unauthorized()
    user = db.get(User, user_id)
    if user is None or user.token_version != version:
        raise _unauthorized()
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != RoleEnum.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")
    return current_user
