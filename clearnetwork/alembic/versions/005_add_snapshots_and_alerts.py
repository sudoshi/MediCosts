"""Add network snapshots and alert subscriptions

Revision ID: 005
Revises: 004
Create Date: 2026-03-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "clearnetwork"


def upgrade() -> None:
    op.create_table(
        "network_snapshots",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("network_id", UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.networks.id")),
        sa.Column("crawl_job_id", UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.crawl_jobs.id")),
        sa.Column("snapshot_date", sa.Date(), server_default=sa.text("CURRENT_DATE")),
        sa.Column("provider_count", sa.Integer()),
        sa.Column("provider_ids", sa.ARRAY(UUID(as_uuid=True))),
        schema=SCHEMA,
    )

    op.create_table(
        "alert_subscriptions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("plan_id", UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.plans.id")),
        sa.Column("provider_npis", sa.ARRAY(sa.Text()), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("active", sa.Boolean(), server_default="true"),
        schema=SCHEMA,
    )

    op.create_index(
        "idx_alert_subs_email", "alert_subscriptions", ["email"], schema=SCHEMA
    )
    op.create_index(
        "idx_alert_subs_plan", "alert_subscriptions", ["plan_id"], schema=SCHEMA
    )


def downgrade() -> None:
    op.drop_table("alert_subscriptions", schema=SCHEMA)
    op.drop_table("network_snapshots", schema=SCHEMA)
