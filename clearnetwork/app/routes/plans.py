from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select

from app.dependencies import DBSession, PaginationParams
from app.models.insurer import Insurer, Network, Plan
from app.models.network import NetworkProvider
from app.models.provider import CanonicalProvider
from app.schemas.common import Pagination, PaginatedResponse, ResponseMeta, SingleResponse
from app.schemas.plan import (
    NetworkCheckResult,
    PlanCompareEntry,
    PlanCompareProvider,
    PlanCompareResult,
    PlanSearchResult,
)

router = APIRouter(prefix="/plans", tags=["plans"])


@router.get("/search", response_model=PaginatedResponse)
async def search_plans(
    db: DBSession,
    pagination: PaginationParams = Depends(),
    state: str | None = Query(None, description="State filter (2-letter)", max_length=2),
    zip: str | None = Query(None, description="ZIP code", max_length=5),
    plan_type: str | None = Query(None, description="Plan type: HMO, PPO, EPO, POS, HDHP"),
    year: int | None = Query(None, description="Plan year"),
):
    """Search insurance plans by state, type, and year."""
    query = select(Plan, Insurer.legal_name).outerjoin(Insurer, Plan.insurer_id == Insurer.id)
    count_query = select(func.count()).select_from(Plan)

    if state:
        state_filter = Plan.states.any(state.upper())
        query = query.where(state_filter)
        count_query = count_query.where(state_filter)

    if plan_type:
        query = query.where(func.upper(Plan.plan_type) == plan_type.upper())
        count_query = count_query.where(func.upper(Plan.plan_type) == plan_type.upper())

    if year:
        query = query.where(Plan.year == year)
        count_query = count_query.where(Plan.year == year)

    total = (await db.execute(count_query)).scalar() or 0

    query = query.offset(pagination.offset).limit(pagination.per_page)
    result = await db.execute(query)
    rows = result.all()

    data = [
        PlanSearchResult(
            id=plan.id,
            plan_name=plan.plan_name,
            plan_type=plan.plan_type,
            metal_tier=plan.metal_tier,
            insurer_name=insurer_name,
            network_name=plan.network_name,
            states=plan.states or [],
            year=plan.year,
        )
        for plan, insurer_name in rows
    ]

    return PaginatedResponse(
        data=data,
        pagination=Pagination(page=pagination.page, per_page=pagination.per_page, total=total),
        meta=ResponseMeta(),
    )


@router.get("/{plan_id}/network", response_model=SingleResponse)
async def check_network_status(
    db: DBSession,
    plan_id: UUID,
    provider_npi: str = Query(..., description="Provider NPI to check"),
):
    """Check if a specific provider is in-network for a given plan."""
    # Get the plan + its network
    plan_result = await db.execute(select(Plan).where(Plan.id == plan_id))
    plan = plan_result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    if not plan.network_id:
        raise HTTPException(status_code=404, detail="Plan has no associated network")

    # Find the provider
    prov_result = await db.execute(
        select(CanonicalProvider).where(CanonicalProvider.npi == provider_npi)
    )
    provider = prov_result.scalar_one_or_none()
    if not provider:
        raise HTTPException(status_code=404, detail=f"Provider NPI {provider_npi} not found")

    # Check network membership
    np_result = await db.execute(
        select(NetworkProvider).where(
            NetworkProvider.network_id == plan.network_id,
            NetworkProvider.canonical_provider_id == provider.canonical_id,
        )
    )
    np = np_result.scalar_one_or_none()

    check = NetworkCheckResult(
        plan_id=plan.id,
        plan_name=plan.plan_name,
        provider_npi=provider_npi,
        provider_name=provider.name_canonical,
        in_network=np.in_network if np else False,
        tier=np.tier if np else None,
        effective_date=str(np.effective_date) if np and np.effective_date else None,
        termination_date=str(np.termination_date) if np and np.termination_date else None,
    )

    return SingleResponse(data=check, meta=ResponseMeta())


@router.get("/compare", response_model=SingleResponse)
async def compare_plans(
    db: DBSession,
    plan_ids: str = Query(..., description="Comma-separated plan UUIDs"),
    provider_npis: str = Query(..., description="Comma-separated provider NPIs"),
):
    """Compare multiple plans for coverage of specific providers."""
    plan_id_list = [UUID(pid.strip()) for pid in plan_ids.split(",")]
    npi_list = [n.strip() for n in provider_npis.split(",")]

    # Fetch providers
    prov_result = await db.execute(
        select(CanonicalProvider).where(CanonicalProvider.npi.in_(npi_list))
    )
    providers = {p.npi: p for p in prov_result.scalars().all()}

    providers_requested = [
        PlanCompareProvider(npi=npi, name=providers[npi].name_canonical if npi in providers else None)
        for npi in npi_list
    ]

    # Fetch plans with insurer info
    plan_result = await db.execute(
        select(Plan, Insurer.legal_name)
        .outerjoin(Insurer, Plan.insurer_id == Insurer.id)
        .where(Plan.id.in_(plan_id_list))
    )
    plans_data = plan_result.all()

    entries = []
    for plan, insurer_name in plans_data:
        plan_providers = []
        for npi in npi_list:
            prov = providers.get(npi)
            in_network = False
            tier = None
            eff = None
            term = None

            if prov and plan.network_id:
                np_result = await db.execute(
                    select(NetworkProvider).where(
                        NetworkProvider.network_id == plan.network_id,
                        NetworkProvider.canonical_provider_id == prov.canonical_id,
                    )
                )
                np = np_result.scalar_one_or_none()
                if np:
                    in_network = np.in_network
                    tier = np.tier
                    eff = str(np.effective_date) if np.effective_date else None
                    term = str(np.termination_date) if np.termination_date else None

            plan_providers.append(
                NetworkCheckResult(
                    plan_id=plan.id,
                    plan_name=plan.plan_name,
                    provider_npi=npi,
                    provider_name=prov.name_canonical if prov else None,
                    in_network=in_network,
                    tier=tier,
                    effective_date=eff,
                    termination_date=term,
                )
            )

        covered = sum(1 for pp in plan_providers if pp.in_network)
        entries.append(
            PlanCompareEntry(
                plan_id=plan.id,
                plan_name=plan.plan_name,
                insurer_name=insurer_name,
                providers=plan_providers,
                coverage_count=covered,
                coverage_pct=round(covered / len(npi_list) * 100, 1) if npi_list else 0,
            )
        )

    # Sort by coverage count descending
    entries.sort(key=lambda e: e.coverage_count, reverse=True)

    return SingleResponse(
        data=PlanCompareResult(providers_requested=providers_requested, plans=entries),
        meta=ResponseMeta(),
    )
