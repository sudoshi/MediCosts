from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ProviderAddress(BaseModel):
    street: str | None = None
    city: str | None = None
    state: str | None = None
    zip: str | None = None


class ProviderSearchResult(BaseModel):
    canonical_id: UUID
    npi: str | None = None
    name: str | None = None
    entity_type: str | None = None
    specialty: str | None = None
    address: ProviderAddress = ProviderAddress()
    phone: str | None = None
    accepting_new_patients: bool | None = None
    distance_miles: float | None = None

    model_config = {"from_attributes": True}


class NetworkMembership(BaseModel):
    network_id: UUID
    network_name: str | None = None
    insurer_name: str | None = None
    tier: str | None = None
    in_network: bool = True
    effective_date: str | None = None
    termination_date: str | None = None


class ProviderDetail(BaseModel):
    canonical_id: UUID
    npi: str | None = None
    name: str | None = None
    entity_type: str | None = None
    specialty_primary: str | None = None
    specialty_codes: list[str] = []
    address: ProviderAddress = ProviderAddress()
    lat: float | None = None
    lng: float | None = None
    phone: str | None = None
    accepting_new_patients: bool | None = None
    last_updated: datetime | None = None
    networks: list[NetworkMembership] = []

    model_config = {"from_attributes": True}


class PharmacyResult(BaseModel):
    canonical_id: UUID
    npi: str | None = None
    name: str | None = None
    address: ProviderAddress = ProviderAddress()
    phone: str | None = None
    ncpdp_id: str | None = None
    is_retail: bool | None = None
    is_mail_order: bool | None = None
    is_specialty: bool | None = None
    is_24_hour: bool | None = None
    chains: list[str] = []
    tier: str | None = None
    copay_generic: float | None = None
    copay_brand: float | None = None
    distance_miles: float | None = None

    model_config = {"from_attributes": True}


class LabResult(BaseModel):
    canonical_id: UUID
    npi: str | None = None
    name: str | None = None
    address: ProviderAddress = ProviderAddress()
    phone: str | None = None
    clia_number: str | None = None
    lab_type: str | None = None
    parent_company: str | None = None
    test_categories: list[str] = []
    distance_miles: float | None = None

    model_config = {"from_attributes": True}
