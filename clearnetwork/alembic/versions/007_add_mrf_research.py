"""Add mrf_research knowledge base table for state-level MRF discovery

Revision ID: 007
Revises: 006
Create Date: 2026-03-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "clearnetwork"


def upgrade() -> None:
    op.create_table(
        "mrf_research",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("state", sa.String(2), nullable=False),
        sa.Column("insurer_name", sa.Text(), nullable=False),
        sa.Column("trade_names", sa.ARRAY(sa.Text())),
        sa.Column("market_share_rank", sa.Integer()),
        sa.Column("mrf_url", sa.Text()),
        sa.Column("mrf_url_verified", sa.Boolean(), server_default="false"),
        sa.Column("index_type", sa.Text()),
        sa.Column("date_pattern", sa.Text()),
        sa.Column("http_status", sa.Integer()),
        sa.Column("accessibility", sa.Text()),
        sa.Column("notes", sa.Text()),
        sa.Column("added_to_registry", sa.Boolean(), server_default="false"),
        sa.Column("crawl_tested", sa.Boolean(), server_default="false"),
        sa.Column("crawl_result", sa.Text()),
        sa.Column("researched_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("state", "insurer_name"),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_table("mrf_research", schema=SCHEMA)
