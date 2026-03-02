from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, text
from sqlalchemy.orm import aliased

from app.dependencies import DBSession, PaginationParams
from app.models.insurer import Network
from app.models.network import NetworkProvider
from app.models.provider import CanonicalProvider
from app.schemas.common import Pagination, PaginatedResponse, ResponseMeta, SingleResponse
from app.schemas.provider import (
    NetworkMembership,
    ProviderAddress,
    ProviderDetail,
    ProviderSearchResult,
)

router = APIRouter(prefix="/providers", tags=["providers"])


@router.get("/search", response_model=PaginatedResponse)
async def search_providers(
    db: DBSession,
    pagination: PaginationParams = Depends(),
    name: str | None = Query(None, description="Provider name (full-text search)"),
    zip: str | None = Query(None, description="ZIP code for proximity search", max_length=5),
    radius_miles: float = Query(25, description="Search radius in miles"),
    specialty: str | None = Query(None, description="Specialty filter"),
    plan_id: UUID | None = Query(None, description="Filter to providers in this plan's network"),
    state: str | None = Query(None, description="State filter (2-letter code)", max_length=2),
):
    """Search providers by name, location, specialty, and/or plan network."""
    query = select(CanonicalProvider)
    count_query = select(func.count()).select_from(CanonicalProvider)

    # Full-text name search
    if name:
        ts_filter = func.to_tsvector("english", CanonicalProvider.name_canonical).match(name)
        query = query.where(ts_filter)
        count_query = count_query.where(ts_filter)

    # State filter
    if state:
        query = query.where(CanonicalProvider.address_state == state.upper())
        count_query = count_query.where(CanonicalProvider.address_state == state.upper())

    # Specialty filter
    if specialty:
        spec_filter = func.lower(CanonicalProvider.specialty_primary).contains(specialty.lower())
        query = query.where(spec_filter)
        count_query = count_query.where(spec_filter)

    # Plan network filter
    if plan_id:
        from app.models.insurer import Plan

        network_subq = (
            select(NetworkProvider.canonical_provider_id)
            .join(Network, NetworkProvider.network_id == Network.id)
            .join(Plan, Plan.network_id == Network.id)
            .where(Plan.id == plan_id)
            .where(NetworkProvider.in_network.is_(True))
        )
        query = query.where(CanonicalProvider.canonical_id.in_(network_subq))
        count_query = count_query.where(CanonicalProvider.canonical_id.in_(network_subq))

    # ZIP proximity search using PostGIS + zip_centroids table
    if zip:
        radius_meters = radius_miles * 1609.34
        geo_filter = text(
            "ST_DWithin("
            "  CAST(ST_SetSRID(ST_Point(clearnetwork.canonical_providers.lng, "
            "    clearnetwork.canonical_providers.lat), 4326) AS geography),"
            "  (SELECT CAST(ST_SetSRID(ST_Point(z.lng, z.lat), 4326) AS geography) "
            "   FROM clearnetwork.zip_centroids z WHERE z.zip = :zip),"
            "  :radius"
            ")"
        ).bindparams(zip=zip, radius=radius_meters)
        # Only apply geo filter on providers that have coordinates
        has_coords = CanonicalProvider.lat.isnot(None)
        query = query.where(has_coords).where(geo_filter)
        count_query = count_query.where(has_coords).where(geo_filter)

    # Get total count
    total = (await db.execute(count_query)).scalar() or 0

    # Paginate
    query = query.offset(pagination.offset).limit(pagination.per_page)
    result = await db.execute(query)
    providers = result.scalars().all()

    data = [
        ProviderSearchResult(
            canonical_id=p.canonical_id,
            npi=p.npi,
            name=p.name_canonical,
            entity_type=p.entity_type,
            specialty=p.specialty_primary,
            address=ProviderAddress(
                street=p.address_street,
                city=p.address_city,
                state=p.address_state,
                zip=p.address_zip,
            ),
            phone=p.phone,
            accepting_new_patients=p.accepting_new_patients,
        )
        for p in providers
    ]

    return PaginatedResponse(
        data=data,
        pagination=Pagination(page=pagination.page, per_page=pagination.per_page, total=total),
        meta=ResponseMeta(),
    )


@router.get("/{npi}", response_model=SingleResponse)
async def get_provider(db: DBSession, npi: str):
    """Get full provider details by NPI, including all network memberships."""
    result = await db.execute(
        select(CanonicalProvider).where(CanonicalProvider.npi == npi)
    )
    provider = result.scalar_one_or_none()

    if not provider:
        raise HTTPException(status_code=404, detail=f"Provider with NPI {npi} not found")

    # Fetch network memberships
    net_result = await db.execute(
        select(NetworkProvider, Network)
        .join(Network, NetworkProvider.network_id == Network.id)
        .where(NetworkProvider.canonical_provider_id == provider.canonical_id)
    )
    memberships = []
    for np, net in net_result.all():
        memberships.append(
            NetworkMembership(
                network_id=net.id,
                network_name=net.network_name,
                tier=np.tier,
                in_network=np.in_network,
                effective_date=str(np.effective_date) if np.effective_date else None,
                termination_date=str(np.termination_date) if np.termination_date else None,
            )
        )

    detail = ProviderDetail(
        canonical_id=provider.canonical_id,
        npi=provider.npi,
        name=provider.name_canonical,
        entity_type=provider.entity_type,
        specialty_primary=provider.specialty_primary,
        specialty_codes=provider.specialty_codes or [],
        address=ProviderAddress(
            street=provider.address_street,
            city=provider.address_city,
            state=provider.address_state,
            zip=provider.address_zip,
        ),
        lat=float(provider.lat) if provider.lat else None,
        lng=float(provider.lng) if provider.lng else None,
        phone=provider.phone,
        accepting_new_patients=provider.accepting_new_patients,
        last_updated=provider.last_updated,
        networks=memberships,
    )

    return SingleResponse(data=detail, meta=ResponseMeta())
