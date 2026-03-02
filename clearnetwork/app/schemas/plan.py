from uuid import UUID

from pydantic import BaseModel


class PlanSearchResult(BaseModel):
    id: UUID
    plan_name: str
    plan_type: str | None = None
    metal_tier: str | None = None
    insurer_name: str | None = None
    network_name: str | None = None
    states: list[str] = []
    year: int | None = None

    model_config = {"from_attributes": True}


class NetworkCheckResult(BaseModel):
    plan_id: UUID
    plan_name: str | None = None
    provider_npi: str
    provider_name: str | None = None
    in_network: bool
    tier: str | None = None
    effective_date: str | None = None
    termination_date: str | None = None


class PlanCompareProvider(BaseModel):
    npi: str
    name: str | None = None


class PlanCompareEntry(BaseModel):
    plan_id: UUID
    plan_name: str | None = None
    insurer_name: str | None = None
    providers: list[NetworkCheckResult] = []
    coverage_count: int = 0
    coverage_pct: float = 0.0


class PlanCompareResult(BaseModel):
    providers_requested: list[PlanCompareProvider] = []
    plans: list[PlanCompareEntry] = []
