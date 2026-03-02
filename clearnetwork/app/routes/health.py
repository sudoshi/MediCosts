from fastapi import APIRouter
from sqlalchemy import text

from app.dependencies import DBSession

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check(db: DBSession):
    """Service health check with DB connectivity verification."""
    try:
        result = await db.execute(text("SELECT 1"))
        result.scalar()
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {e}"

    return {
        "status": "ok" if db_status == "connected" else "degraded",
        "service": "clearnetwork",
        "version": "0.1.0",
        "database": db_status,
    }
