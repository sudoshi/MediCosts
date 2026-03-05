"""Add transparency scoring columns to mrf_research + scoring views

Revision ID: 008
Revises: 007
Create Date: 2026-03-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "clearnetwork"


def upgrade() -> None:
    # Scoring columns on mrf_research
    op.add_column("mrf_research", sa.Column("transparency_score", sa.Integer()), schema=SCHEMA)
    op.add_column("mrf_research", sa.Column("digital_debt_score", sa.Integer()), schema=SCHEMA)
    op.add_column("mrf_research", sa.Column("score_breakdown", JSONB()), schema=SCHEMA)
    op.add_column("mrf_research", sa.Column("last_scored_at", sa.DateTime(timezone=True)), schema=SCHEMA)
    # Probe metadata
    op.add_column("mrf_research", sa.Column("content_type", sa.Text()), schema=SCHEMA)
    op.add_column("mrf_research", sa.Column("response_time_ms", sa.Integer()), schema=SCHEMA)
    op.add_column("mrf_research", sa.Column("ssl_valid", sa.Boolean()), schema=SCHEMA)
    op.add_column("mrf_research", sa.Column("supports_gzip", sa.Boolean()), schema=SCHEMA)
    op.add_column("mrf_research", sa.Column("file_size_bytes", sa.BigInteger()), schema=SCHEMA)
    op.add_column("mrf_research", sa.Column("last_probed_at", sa.DateTime(timezone=True)), schema=SCHEMA)
    op.add_column("mrf_research", sa.Column("data_freshness_days", sa.Integer()), schema=SCHEMA)
    op.add_column("mrf_research", sa.Column("cms_source", sa.Boolean(), server_default="false"), schema=SCHEMA)

    # Indexes for scorecard queries
    op.create_index("idx_mrf_research_state", "mrf_research", ["state"], schema=SCHEMA)
    op.create_index("idx_mrf_research_transparency", "mrf_research", ["transparency_score"], schema=SCHEMA)
    op.create_index("idx_mrf_research_debt", "mrf_research", ["digital_debt_score"], schema=SCHEMA)

    # Views for quick access
    op.execute(f"""
        CREATE OR REPLACE VIEW {SCHEMA}.v_digital_debt_hall_of_shame AS
        SELECT insurer_name, state, digital_debt_score, transparency_score,
               accessibility, mrf_url, http_status, index_type,
               score_breakdown, notes, last_probed_at
        FROM {SCHEMA}.mrf_research
        WHERE digital_debt_score IS NOT NULL AND digital_debt_score >= 50
        ORDER BY digital_debt_score DESC
    """)

    op.execute(f"""
        CREATE OR REPLACE VIEW {SCHEMA}.v_transparency_leaders AS
        SELECT insurer_name, state, transparency_score, digital_debt_score,
               index_type, accessibility, mrf_url, content_type,
               response_time_ms, supports_gzip, score_breakdown,
               last_probed_at
        FROM {SCHEMA}.mrf_research
        WHERE transparency_score IS NOT NULL AND transparency_score >= 70
        ORDER BY transparency_score DESC
    """)

    op.execute(f"""
        CREATE OR REPLACE VIEW {SCHEMA}.v_state_coverage AS
        SELECT state,
               count(*) AS total_insurers,
               count(*) FILTER (WHERE accessibility = 'automatable') AS automatable,
               count(*) FILTER (WHERE accessibility = 'browser_required') AS browser_required,
               count(*) FILTER (WHERE accessibility = 'dead') AS dead,
               count(*) FILTER (WHERE added_to_registry) AS in_registry,
               count(*) FILTER (WHERE crawl_tested AND crawl_result = 'success') AS crawl_success,
               avg(transparency_score) FILTER (WHERE transparency_score IS NOT NULL) AS avg_transparency,
               avg(digital_debt_score) FILTER (WHERE digital_debt_score IS NOT NULL) AS avg_debt
        FROM {SCHEMA}.mrf_research
        GROUP BY state
        ORDER BY state
    """)


def downgrade() -> None:
    op.execute(f"DROP VIEW IF EXISTS {SCHEMA}.v_state_coverage")
    op.execute(f"DROP VIEW IF EXISTS {SCHEMA}.v_transparency_leaders")
    op.execute(f"DROP VIEW IF EXISTS {SCHEMA}.v_digital_debt_hall_of_shame")
    op.drop_index("idx_mrf_research_debt", table_name="mrf_research", schema=SCHEMA)
    op.drop_index("idx_mrf_research_transparency", table_name="mrf_research", schema=SCHEMA)
    op.drop_index("idx_mrf_research_state", table_name="mrf_research", schema=SCHEMA)
    for col in ["cms_source", "data_freshness_days", "last_probed_at", "file_size_bytes",
                "supports_gzip", "ssl_valid", "response_time_ms", "content_type",
                "last_scored_at", "score_breakdown", "digital_debt_score", "transparency_score"]:
        op.drop_column("mrf_research", col, schema=SCHEMA)
