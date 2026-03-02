from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, EmailStr
from sqlalchemy import select, text

from app.dependencies import DBSession
from app.schemas.common import ResponseMeta, SingleResponse

router = APIRouter(prefix="/alerts", tags=["alerts"])

SCHEMA = "clearnetwork"


class SubscribeRequest(BaseModel):
    plan_id: UUID
    provider_npis: list[str]
    email: str


class Subscription(BaseModel):
    id: UUID
    plan_id: UUID
    provider_npis: list[str]
    email: str
    active: bool


@router.post("/subscribe", response_model=SingleResponse, status_code=201)
async def subscribe_alerts(db: DBSession, req: SubscribeRequest):
    """Subscribe to alerts when providers leave a plan's network."""
    result = await db.execute(
        text(
            f"INSERT INTO {SCHEMA}.alert_subscriptions "
            f"(id, plan_id, provider_npis, email) "
            f"VALUES (uuid_generate_v4(), :plan_id, :npis, :email) "
            f"RETURNING id, plan_id, provider_npis, email, active"
        ),
        {"plan_id": req.plan_id, "npis": req.provider_npis, "email": req.email},
    )
    row = result.fetchone()
    await db.commit()

    return SingleResponse(
        data=Subscription(
            id=row[0], plan_id=row[1], provider_npis=row[2],
            email=row[3], active=row[4],
        ),
        meta=ResponseMeta(),
    )


@router.get("/subscriptions", response_model=SingleResponse)
async def list_subscriptions(
    db: DBSession,
    email: str = Query(..., description="Email to look up subscriptions for"),
):
    """List active alert subscriptions for an email."""
    result = await db.execute(
        text(
            f"SELECT id, plan_id, provider_npis, email, active "
            f"FROM {SCHEMA}.alert_subscriptions "
            f"WHERE email = :email AND active = TRUE "
            f"ORDER BY created_at DESC"
        ),
        {"email": email},
    )
    rows = result.fetchall()

    subs = [
        Subscription(id=r[0], plan_id=r[1], provider_npis=r[2], email=r[3], active=r[4])
        for r in rows
    ]

    return SingleResponse(data=subs, meta=ResponseMeta())


@router.delete("/{subscription_id}", status_code=204)
async def unsubscribe(db: DBSession, subscription_id: UUID):
    """Deactivate an alert subscription."""
    result = await db.execute(
        text(
            f"UPDATE {SCHEMA}.alert_subscriptions "
            f"SET active = FALSE WHERE id = :id RETURNING id"
        ),
        {"id": subscription_id},
    )
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Subscription not found")
    await db.commit()
