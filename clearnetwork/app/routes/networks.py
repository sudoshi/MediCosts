from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select

from app.dependencies import DBSession, PaginationParams
from app.models.insurer import Network
from app.models.network import NetworkProvider, PharmacyTier
from app.models.provider import CanonicalProvider, Lab, Pharmacy
from app.schemas.common import Pagination, PaginatedResponse, ResponseMeta
from app.schemas.provider import LabResult, PharmacyResult, ProviderAddress

router = APIRouter(prefix="/networks", tags=["networks"])


@router.get("/{network_id}/pharmacies", response_model=PaginatedResponse)
async def get_network_pharmacies(
    db: DBSession,
    network_id: UUID,
    pagination: PaginationParams = Depends(),
    zip: str | None = Query(None, description="ZIP code filter", max_length=5),
    radius_miles: float = Query(5, description="Search radius in miles"),
    tier: str | None = Query(None, description="Pharmacy tier filter (preferred, standard, etc.)"),
):
    """Find in-network pharmacies for a network, optionally filtered by location and tier."""
    # Verify network exists
    net_result = await db.execute(select(Network).where(Network.id == network_id))
    if not net_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Network not found")

    query = (
        select(CanonicalProvider, Pharmacy, PharmacyTier)
        .join(Pharmacy, CanonicalProvider.canonical_id == Pharmacy.canonical_provider_id)
        .join(
            NetworkProvider,
            (NetworkProvider.canonical_provider_id == CanonicalProvider.canonical_id)
            & (NetworkProvider.network_id == network_id),
        )
        .outerjoin(
            PharmacyTier,
            (PharmacyTier.pharmacy_id == CanonicalProvider.canonical_id)
            & (PharmacyTier.network_id == network_id),
        )
        .where(NetworkProvider.in_network.is_(True))
    )

    count_base = (
        select(func.count())
        .select_from(CanonicalProvider)
        .join(Pharmacy, CanonicalProvider.canonical_id == Pharmacy.canonical_provider_id)
        .join(
            NetworkProvider,
            (NetworkProvider.canonical_provider_id == CanonicalProvider.canonical_id)
            & (NetworkProvider.network_id == network_id),
        )
        .where(NetworkProvider.in_network.is_(True))
    )

    if zip:
        query = query.where(CanonicalProvider.address_zip == zip)
        count_base = count_base.where(CanonicalProvider.address_zip == zip)

    if tier:
        query = query.where(func.lower(PharmacyTier.tier) == tier.lower())
        count_base = count_base.where(func.lower(PharmacyTier.tier) == tier.lower())

    total = (await db.execute(count_base)).scalar() or 0

    query = query.offset(pagination.offset).limit(pagination.per_page)
    result = await db.execute(query)
    rows = result.all()

    data = [
        PharmacyResult(
            canonical_id=prov.canonical_id,
            npi=prov.npi,
            name=prov.name_canonical,
            address=ProviderAddress(
                street=prov.address_street,
                city=prov.address_city,
                state=prov.address_state,
                zip=prov.address_zip,
            ),
            phone=prov.phone,
            ncpdp_id=pharm.ncpdp_id,
            is_retail=pharm.is_retail,
            is_mail_order=pharm.is_mail_order,
            is_specialty=pharm.is_specialty,
            is_24_hour=pharm.is_24_hour,
            chains=pharm.chains or [],
            tier=pt.tier if pt else None,
            copay_generic=float(pt.copay_generic) if pt and pt.copay_generic else None,
            copay_brand=float(pt.copay_brand) if pt and pt.copay_brand else None,
        )
        for prov, pharm, pt in rows
    ]

    return PaginatedResponse(
        data=data,
        pagination=Pagination(page=pagination.page, per_page=pagination.per_page, total=total),
        meta=ResponseMeta(),
    )


@router.get("/{network_id}/labs", response_model=PaginatedResponse)
async def get_network_labs(
    db: DBSession,
    network_id: UUID,
    pagination: PaginationParams = Depends(),
    zip: str | None = Query(None, description="ZIP code filter", max_length=5),
    radius_miles: float = Query(10, description="Search radius in miles"),
):
    """Find in-network labs for a network, optionally filtered by location."""
    net_result = await db.execute(select(Network).where(Network.id == network_id))
    if not net_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Network not found")

    query = (
        select(CanonicalProvider, Lab)
        .join(Lab, CanonicalProvider.canonical_id == Lab.canonical_provider_id)
        .join(
            NetworkProvider,
            (NetworkProvider.canonical_provider_id == CanonicalProvider.canonical_id)
            & (NetworkProvider.network_id == network_id),
        )
        .where(NetworkProvider.in_network.is_(True))
    )

    count_base = (
        select(func.count())
        .select_from(CanonicalProvider)
        .join(Lab, CanonicalProvider.canonical_id == Lab.canonical_provider_id)
        .join(
            NetworkProvider,
            (NetworkProvider.canonical_provider_id == CanonicalProvider.canonical_id)
            & (NetworkProvider.network_id == network_id),
        )
        .where(NetworkProvider.in_network.is_(True))
    )

    if zip:
        query = query.where(CanonicalProvider.address_zip == zip)
        count_base = count_base.where(CanonicalProvider.address_zip == zip)

    total = (await db.execute(count_base)).scalar() or 0

    query = query.offset(pagination.offset).limit(pagination.per_page)
    result = await db.execute(query)
    rows = result.all()

    data = [
        LabResult(
            canonical_id=prov.canonical_id,
            npi=prov.npi,
            name=prov.name_canonical,
            address=ProviderAddress(
                street=prov.address_street,
                city=prov.address_city,
                state=prov.address_state,
                zip=prov.address_zip,
            ),
            phone=prov.phone,
            clia_number=lab.clia_number,
            lab_type=lab.lab_type,
            parent_company=lab.parent_company,
            test_categories=lab.test_categories or [],
        )
        for prov, lab in rows
    ]

    return PaginatedResponse(
        data=data,
        pagination=Pagination(page=pagination.page, per_page=pagination.per_page, total=total),
        meta=ResponseMeta(),
    )
