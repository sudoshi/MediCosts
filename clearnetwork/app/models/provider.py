import uuid
from datetime import datetime

from sqlalchemy import ARRAY, Boolean, DateTime, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class CanonicalProvider(Base):
    __tablename__ = "canonical_providers"

    canonical_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    npi: Mapped[str | None] = mapped_column(String(10), unique=True, index=True)
    name_canonical: Mapped[str | None] = mapped_column(Text)
    entity_type: Mapped[str | None] = mapped_column(
        String(20)
    )  # individual | facility | lab | pharmacy
    specialty_primary: Mapped[str | None] = mapped_column(Text)
    specialty_codes: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    address_street: Mapped[str | None] = mapped_column(Text)
    address_city: Mapped[str | None] = mapped_column(Text)
    address_state: Mapped[str | None] = mapped_column(String(2))
    address_zip: Mapped[str | None] = mapped_column(String(5))
    lat: Mapped[float | None] = mapped_column(Numeric(9, 6))
    lng: Mapped[float | None] = mapped_column(Numeric(9, 6))
    phone: Mapped[str | None] = mapped_column(Text)
    accepting_new_patients: Mapped[bool | None] = mapped_column(Boolean)
    last_updated: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Pharmacy(Base):
    __tablename__ = "pharmacies"

    canonical_provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True
    )
    ncpdp_id: Mapped[str | None] = mapped_column(String(7))
    is_retail: Mapped[bool | None] = mapped_column(Boolean)
    is_mail_order: Mapped[bool | None] = mapped_column(Boolean)
    is_specialty: Mapped[bool | None] = mapped_column(Boolean)
    is_24_hour: Mapped[bool | None] = mapped_column(Boolean)
    chains: Mapped[list[str] | None] = mapped_column(ARRAY(Text))


class Lab(Base):
    __tablename__ = "labs"

    canonical_provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True
    )
    clia_number: Mapped[str | None] = mapped_column(String(10))
    lab_type: Mapped[str | None] = mapped_column(
        String(20)
    )  # hospital | independent | physician_office
    parent_company: Mapped[str | None] = mapped_column(Text)
    test_categories: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
