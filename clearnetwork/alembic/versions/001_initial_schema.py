"""Initial ClearNetwork schema

Revision ID: 001
Revises:
Create Date: 2026-03-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "clearnetwork"

HAS_POSTGIS = False


def _check_postgis(connection):
    global HAS_POSTGIS
    result = connection.execute(
        sa.text(
            "SELECT EXISTS("
            "SELECT 1 FROM pg_available_extensions WHERE name = 'postgis'"
            ")"
        )
    )
    HAS_POSTGIS = result.scalar()


def upgrade() -> None:
    # Check PostGIS availability
    conn = op.get_bind()
    _check_postgis(conn)

    # Create schema
    op.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")

    # Enable extensions (idempotent)
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    if HAS_POSTGIS:
        op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    # --- insurers ---
    op.create_table(
        "insurers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("legal_name", sa.Text(), nullable=False),
        sa.Column("trade_names", sa.ARRAY(sa.Text())),
        sa.Column("naic_code", sa.String(10)),
        sa.Column("states_licensed", sa.ARRAY(sa.Text())),
        sa.Column("plan_types", sa.ARRAY(sa.Text())),
        sa.Column("mrf_index_url", sa.Text()),
        sa.Column("website", sa.Text()),
        sa.Column("last_crawled", sa.DateTime(timezone=True)),
        schema=SCHEMA,
    )

    # --- networks ---
    op.create_table(
        "networks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("network_name", sa.Text()),
        sa.Column("insurer_id", UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.insurers.id")),
        sa.Column("last_updated", sa.DateTime(timezone=True)),
        sa.Column("provider_count", sa.Integer()),
        sa.Column("mrf_source_url", sa.Text()),
        schema=SCHEMA,
    )

    # --- plans ---
    op.create_table(
        "plans",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("insurer_id", UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.insurers.id")),
        sa.Column("plan_id_cms", sa.Text()),
        sa.Column("plan_name", sa.Text(), nullable=False),
        sa.Column("plan_type", sa.String(10)),
        sa.Column("metal_tier", sa.String(10)),
        sa.Column("states", sa.ARRAY(sa.Text())),
        sa.Column("year", sa.Integer()),
        sa.Column("network_name", sa.Text()),
        sa.Column("network_id", UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.networks.id")),
        schema=SCHEMA,
    )

    # --- canonical_providers ---
    op.create_table(
        "canonical_providers",
        sa.Column("canonical_id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("npi", sa.String(10), unique=True),
        sa.Column("name_canonical", sa.Text()),
        sa.Column("entity_type", sa.String(20)),
        sa.Column("specialty_primary", sa.Text()),
        sa.Column("specialty_codes", sa.ARRAY(sa.Text())),
        sa.Column("address_street", sa.Text()),
        sa.Column("address_city", sa.Text()),
        sa.Column("address_state", sa.String(2)),
        sa.Column("address_zip", sa.String(5)),
        sa.Column("lat", sa.Numeric(9, 6)),
        sa.Column("lng", sa.Numeric(9, 6)),
        sa.Column("phone", sa.Text()),
        sa.Column("accepting_new_patients", sa.Boolean()),
        sa.Column("last_updated", sa.DateTime(timezone=True)),
        schema=SCHEMA,
    )

    # --- network_providers ---
    op.create_table(
        "network_providers",
        sa.Column("network_id", UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.networks.id"), primary_key=True),
        sa.Column("canonical_provider_id", UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.canonical_providers.canonical_id"), primary_key=True),
        sa.Column("in_network", sa.Boolean(), server_default="true"),
        sa.Column("tier", sa.String(20)),
        sa.Column("effective_date", sa.Date()),
        sa.Column("termination_date", sa.Date()),
        sa.Column("last_verified", sa.DateTime(timezone=True)),
        schema=SCHEMA,
    )

    # --- pharmacies ---
    op.create_table(
        "pharmacies",
        sa.Column("canonical_provider_id", UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.canonical_providers.canonical_id"), primary_key=True),
        sa.Column("ncpdp_id", sa.String(7)),
        sa.Column("is_retail", sa.Boolean()),
        sa.Column("is_mail_order", sa.Boolean()),
        sa.Column("is_specialty", sa.Boolean()),
        sa.Column("is_24_hour", sa.Boolean()),
        sa.Column("chains", sa.ARRAY(sa.Text())),
        schema=SCHEMA,
    )

    # --- pharmacy_tiers ---
    op.create_table(
        "pharmacy_tiers",
        sa.Column("network_id", UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.networks.id"), primary_key=True),
        sa.Column("pharmacy_id", UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.canonical_providers.canonical_id"), primary_key=True),
        sa.Column("tier", sa.String(20)),
        sa.Column("copay_generic", sa.Numeric(8, 2)),
        sa.Column("copay_brand", sa.Numeric(8, 2)),
        schema=SCHEMA,
    )

    # --- labs ---
    op.create_table(
        "labs",
        sa.Column("canonical_provider_id", UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.canonical_providers.canonical_id"), primary_key=True),
        sa.Column("clia_number", sa.String(10)),
        sa.Column("lab_type", sa.String(20)),
        sa.Column("parent_company", sa.Text()),
        sa.Column("test_categories", sa.ARRAY(sa.Text())),
        schema=SCHEMA,
    )

    # --- network_changes ---
    op.create_table(
        "network_changes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("network_id", UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.networks.id")),
        sa.Column("change_type", sa.String(20)),
        sa.Column("canonical_provider_id", UUID(as_uuid=True), sa.ForeignKey(f"{SCHEMA}.canonical_providers.canonical_id")),
        sa.Column("old_value", JSONB()),
        sa.Column("new_value", JSONB()),
        sa.Column("effective_date", sa.Date()),
        sa.Column("detected_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        schema=SCHEMA,
    )

    # --- Indexes ---
    op.create_index(
        "idx_network_providers_network",
        "network_providers",
        ["network_id"],
        schema=SCHEMA,
    )
    op.create_index(
        "idx_canonical_providers_npi",
        "canonical_providers",
        ["npi"],
        schema=SCHEMA,
    )
    # Full-text search on provider name
    op.execute(
        f"CREATE INDEX idx_canonical_providers_name ON {SCHEMA}.canonical_providers "
        f"USING GIN (to_tsvector('english', name_canonical))"
    )
    # Geographic index
    if HAS_POSTGIS:
        op.execute(
            f"CREATE INDEX idx_canonical_providers_geo ON {SCHEMA}.canonical_providers "
            f"USING GIST (ST_SetSRID(ST_Point(lng, lat), 4326)::geography)"
        )
    else:
        # Fallback: btree indexes on lat/lng for bounding-box queries
        op.create_index(
            "idx_canonical_providers_lat", "canonical_providers", ["lat"], schema=SCHEMA
        )
        op.create_index(
            "idx_canonical_providers_lng", "canonical_providers", ["lng"], schema=SCHEMA
        )
    # GIN index on plan states array
    op.create_index(
        "idx_plans_state",
        "plans",
        ["states"],
        schema=SCHEMA,
        postgresql_using="gin",
    )


def downgrade() -> None:
    for table in [
        "network_changes", "pharmacy_tiers", "pharmacies", "labs",
        "network_providers", "canonical_providers", "plans", "networks", "insurers",
    ]:
        op.drop_table(table, schema=SCHEMA)
    op.execute(f"DROP SCHEMA IF EXISTS {SCHEMA} CASCADE")
