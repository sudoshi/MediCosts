from typing import Annotated

from fastapi import Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session

DBSession = Annotated[AsyncSession, Depends(get_session)]


class PaginationParams:
    def __init__(
        self,
        page: int = Query(1, ge=1, description="Page number"),
        per_page: int = Query(25, ge=1, le=100, description="Results per page"),
    ):
        self.page = page
        self.per_page = per_page
        self.offset = (page - 1) * per_page
