import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import SCHEMA, Base


class NetworkProvider(Base):
    __tablename__ = "network_providers"

    network_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.networks.id"),
        primary_key=True,
    )
    canonical_provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.canonical_providers.canonical_id"),
        primary_key=True,
    )
    in_network: Mapped[bool] = mapped_column(Boolean, default=True)
    tier: Mapped[str | None] = mapped_column(String(20))
    effective_date: Mapped[date | None] = mapped_column(Date)
    termination_date: Mapped[date | None] = mapped_column(Date)
    last_verified: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PharmacyTier(Base):
    __tablename__ = "pharmacy_tiers"

    network_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.networks.id"),
        primary_key=True,
    )
    pharmacy_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.canonical_providers.canonical_id"),
        primary_key=True,
    )
    tier: Mapped[str | None] = mapped_column(String(20))
    copay_generic: Mapped[float | None] = mapped_column(Numeric(8, 2))
    copay_brand: Mapped[float | None] = mapped_column(Numeric(8, 2))


class NetworkChange(Base):
    __tablename__ = "network_changes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    network_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.networks.id")
    )
    change_type: Mapped[str | None] = mapped_column(String(20))
    canonical_provider_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.canonical_providers.canonical_id"),
    )
    old_value: Mapped[dict | None] = mapped_column(JSONB)
    new_value: Mapped[dict | None] = mapped_column(JSONB)
    effective_date: Mapped[date | None] = mapped_column(Date)
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default="now()"
    )
