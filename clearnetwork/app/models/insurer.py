import uuid
from datetime import datetime

from sqlalchemy import ARRAY, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import SCHEMA, Base


class Insurer(Base):
    __tablename__ = "insurers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    legal_name: Mapped[str] = mapped_column(Text, nullable=False)
    trade_names: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    naic_code: Mapped[str | None] = mapped_column(String(10))
    states_licensed: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    plan_types: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    mrf_index_url: Mapped[str | None] = mapped_column(Text)
    website: Mapped[str | None] = mapped_column(Text)
    last_crawled: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    networks: Mapped[list["Network"]] = relationship(back_populates="insurer")
    plans: Mapped[list["Plan"]] = relationship(back_populates="insurer")


class Network(Base):
    __tablename__ = "networks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    network_name: Mapped[str | None] = mapped_column(Text)
    insurer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.insurers.id")
    )
    last_updated: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    provider_count: Mapped[int | None] = mapped_column(Integer)
    mrf_source_url: Mapped[str | None] = mapped_column(Text)

    insurer: Mapped[Insurer | None] = relationship(back_populates="networks")
    plans: Mapped[list["Plan"]] = relationship(back_populates="network")


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    insurer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.insurers.id")
    )
    plan_id_cms: Mapped[str | None] = mapped_column(Text)
    plan_name: Mapped[str] = mapped_column(Text, nullable=False)
    plan_type: Mapped[str | None] = mapped_column(String(10))
    metal_tier: Mapped[str | None] = mapped_column(String(10))
    states: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    year: Mapped[int | None] = mapped_column(Integer)
    network_name: Mapped[str | None] = mapped_column(Text)
    network_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{SCHEMA}.networks.id")
    )

    insurer: Mapped[Insurer | None] = relationship(back_populates="plans")
    network: Mapped[Network | None] = relationship(back_populates="plans")
