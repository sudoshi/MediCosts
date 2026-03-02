from datetime import datetime
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")

DISCLAIMER = (
    "Network status changes frequently. Always verify with your insurer "
    "before receiving care. This data is sourced from publicly mandated "
    "insurer disclosures per 45 CFR §147.211."
)


class ResponseMeta(BaseModel):
    data_source: str | None = None
    last_verified: datetime | None = None
    freshness_warning: str | None = None
    disclaimer: str = DISCLAIMER


class Pagination(BaseModel):
    page: int = 1
    per_page: int = 25
    total: int = 0


class PaginatedResponse(BaseModel, Generic[T]):
    data: list[Any] = Field(default_factory=list)
    pagination: Pagination = Field(default_factory=Pagination)
    meta: ResponseMeta = Field(default_factory=ResponseMeta)


class SingleResponse(BaseModel, Generic[T]):
    data: Any | None = None
    meta: ResponseMeta = Field(default_factory=ResponseMeta)
