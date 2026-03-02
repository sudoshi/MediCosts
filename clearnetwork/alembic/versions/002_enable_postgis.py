"""Enable PostGIS and add spatial index

Revision ID: 002
Revises: 001
Create Date: 2026-03-02
"""
from typing import Sequence, Union

from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "clearnetwork"


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    # Drop btree fallback indexes
    op.drop_index("idx_canonical_providers_lat", table_name="canonical_providers", schema=SCHEMA)
    op.drop_index("idx_canonical_providers_lng", table_name="canonical_providers", schema=SCHEMA)

    # Create proper GIST spatial index (use CAST to avoid asyncpg :: parse issue)
    op.execute(
        f"CREATE INDEX idx_canonical_providers_geo ON {SCHEMA}.canonical_providers "
        f"USING GIST (CAST(ST_SetSRID(ST_Point(lng, lat), 4326) AS geography))"
    )


def downgrade() -> None:
    op.execute(
        f"DROP INDEX IF EXISTS {SCHEMA}.idx_canonical_providers_geo"
    )
    op.create_index(
        "idx_canonical_providers_lat", "canonical_providers", ["lat"], schema=SCHEMA
    )
    op.create_index(
        "idx_canonical_providers_lng", "canonical_providers", ["lng"], schema=SCHEMA
    )
