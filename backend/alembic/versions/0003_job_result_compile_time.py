"""record compile time separately from program run time

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-13
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("job_results") as batch:
        batch.add_column(sa.Column("compile_time", sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("job_results") as batch:
        batch.drop_column("compile_time")
