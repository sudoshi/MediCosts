"""Add ZIP centroids table for proximity queries

Revision ID: 003
Revises: 002
Create Date: 2026-03-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "clearnetwork"


def upgrade() -> None:
    op.create_table(
        "zip_centroids",
        sa.Column("zip", sa.String(5), primary_key=True),
        sa.Column("lat", sa.Numeric(9, 6), nullable=False),
        sa.Column("lng", sa.Numeric(9, 6), nullable=False),
        schema=SCHEMA,
    )
    op.execute(
        f"CREATE INDEX idx_zip_centroids_geo ON {SCHEMA}.zip_centroids "
        f"USING GIST (CAST(ST_SetSRID(ST_Point(lng, lat), 4326) AS geography))"
    )


def downgrade() -> None:
    op.drop_table("zip_centroids", schema=SCHEMA)
