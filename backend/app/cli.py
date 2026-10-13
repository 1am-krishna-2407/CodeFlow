"""Operator commands. Usage: python -m app.cli promote <email>"""
import argparse
import sys

from app.db.models import RoleEnum
from app.db.session import SessionLocal
from app.repositories.user_repo import UserRepository


def promote(email: str) -> int:
    with SessionLocal() as db:
        repo = UserRepository(db)
        user = repo.get_by_email(email)
        if user is None:
            print(f"No user with email {email}", file=sys.stderr)
            return 1
        repo.set_role(user, RoleEnum.admin)
        print(f"{user.email} is now an admin")
        return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    promote_cmd = sub.add_parser("promote", help="grant the admin role to an existing user")
    promote_cmd.add_argument("email")
    args = parser.parse_args(argv)
    if args.command == "promote":
        return promote(args.email)
    return 2


if __name__ == "__main__":
    sys.exit(main())
