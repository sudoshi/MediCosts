"""Widen crawl_jobs.status to VARCHAR(30) for 'completed_with_errors'

Revision ID: 006
Revises: 005
Create Date: 2026-03-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "clearnetwork"


def upgrade() -> None:
    op.alter_column(
        "crawl_jobs",
        "status",
        type_=sa.String(30),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.alter_column(
        "crawl_jobs",
        "status",
        type_=sa.String(20),
        schema=SCHEMA,
    )
