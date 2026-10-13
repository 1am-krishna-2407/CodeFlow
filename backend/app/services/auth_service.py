from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import create_token, decode_token, hash_password, verify_password
from app.db.models import User
from app.repositories.user_repo import UserRepository


class EmailAlreadyRegistered(Exception):
    pass


class InvalidCredentials(Exception):
    pass


def issue_tokens(user: User) -> dict:
    return {
        "access_token": create_token(str(user.id), "access", version=user.token_version),
        "refresh_token": create_token(str(user.id), "refresh", version=user.token_version),
        "token_type": "bearer",
    }


def register_user(db: Session, name: str, email: str, password: str) -> User:
    repo = UserRepository(db)
    if repo.get_by_email(email):
        raise EmailAlreadyRegistered()
    try:
        return repo.create(name=name, email=email, password_hash=hash_password(password))
    except IntegrityError:
        # Two concurrent registrations for the same email: the unique index decides.
        db.rollback()
        raise EmailAlreadyRegistered()


def authenticate_user(db: Session, email: str, password: str) -> dict:
    user = UserRepository(db).get_by_email(email)
    if not verify_password(password, user.password_hash if user else None):
        raise InvalidCredentials()
    return issue_tokens(user)


def refresh_tokens(db: Session, refresh_token: str) -> dict:
    try:
        user_id, version = decode_token(refresh_token, "refresh")
    except ValueError:
        raise InvalidCredentials()
    user = UserRepository(db).get_by_id(user_id)
    if user is None or user.token_version != version:
        raise InvalidCredentials()
    return issue_tokens(user)


def revoke_all_tokens(db: Session, user: User) -> None:
    """Log the user out everywhere: every token issued so far stops working."""
    user.token_version += 1
    db.commit()
