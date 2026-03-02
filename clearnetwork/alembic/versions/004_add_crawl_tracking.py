"""Add crawl tracking tables

Revision ID: 004
Revises: 003
Create Date: 2026-03-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "clearnetwork"


def upgrade() -> None:
    op.create_table(
        "crawl_jobs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("insurer_id", UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.insurers.id")),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(20), server_default="running"),
        sa.Column("files_processed", sa.Integer(), server_default="0"),
        sa.Column("providers_found", sa.Integer(), server_default="0"),
        sa.Column("errors", sa.Integer(), server_default="0"),
        sa.Column("error_log", JSONB()),
        schema=SCHEMA,
    )

    op.create_table(
        "crawl_failures",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("crawl_job_id", UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.crawl_jobs.id")),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("error_message", sa.Text()),
        sa.Column("retry_count", sa.Integer(), server_default="0"),
        sa.Column("last_attempt", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_table("crawl_failures", schema=SCHEMA)
    op.drop_table("crawl_jobs", schema=SCHEMA)
