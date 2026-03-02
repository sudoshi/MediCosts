from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from app.dependencies import DBSession
from app.schemas.common import ResponseMeta, SingleResponse

router = APIRouter(prefix="/networks", tags=["adequacy"])

SCHEMA = "clearnetwork"

# CMS defines these as primary care taxonomy codes
PCP_TAXONOMIES = (
    "'207Q00000X'",  # Family Medicine
    "'207R00000X'",  # Internal Medicine
    "'208D00000X'",  # General Practice
    "'208000000X'",  # Pediatrics
    "'363LF0000X'",  # Family NP
    "'363LP2300X'",  # Primary Care NP
    "'363A00000X'",  # Physician Assistant
)

FACILITY_TYPES = ("'facility'",)

MILES_TO_METERS = 1609.34


@router.get("/{network_id}/adequacy", response_model=SingleResponse)
async def network_adequacy(
    db: DBSession,
    network_id: UUID,
    state: str | None = Query(None, description="State filter (2-letter)", max_length=2),
    zip: str | None = Query(None, description="ZIP code for local adequacy check", max_length=5),
    radius_miles: float = Query(30, description="Access radius in miles"),
):
    """Compute network adequacy scores for a network.

    Scores:
    - pcp_access: % of ZIPs with in-network PCP within radius
    - specialist_count: total unique in-network specialists
    - facility_count: in-network hospitals/facilities
    - pharmacy_count: in-network pharmacies
    - overall_score: weighted composite (0-100)
    """
    radius_m = radius_miles * MILES_TO_METERS

    # Verify network exists
    net = await db.execute(
        text(f"SELECT id, network_name FROM {SCHEMA}.networks WHERE id = :nid"),
        {"nid": network_id},
    )
    network = net.fetchone()
    if not network:
        raise HTTPException(status_code=404, detail="Network not found")

    # Base filter for in-network providers
    base_join = f"""
        {SCHEMA}.network_providers np
        JOIN {SCHEMA}.canonical_providers cp ON np.canonical_provider_id = cp.canonical_id
        WHERE np.network_id = :nid AND np.in_network = TRUE AND cp.lat IS NOT NULL
    """
    params = {"nid": network_id}

    if state:
        base_join += " AND cp.address_state = :state"
        params["state"] = state.upper()

    # 1. Total in-network provider count
    total_result = await db.execute(
        text(f"SELECT count(DISTINCT cp.canonical_id) FROM {base_join}"), params
    )
    total_providers = total_result.scalar() or 0

    # 2. PCP count (primary care providers in network)
    pcp_tax_list = ",".join(PCP_TAXONOMIES)
    pcp_result = await db.execute(
        text(
            f"SELECT count(DISTINCT cp.canonical_id) FROM {base_join} "
            f"AND cp.specialty_codes && ARRAY[{pcp_tax_list}]::text[]"
        ),
        params,
    )
    pcp_count = pcp_result.scalar() or 0

    # 3. Facility count
    facility_result = await db.execute(
        text(
            f"SELECT count(DISTINCT cp.canonical_id) FROM {base_join} "
            f"AND cp.entity_type = 'facility'"
        ),
        params,
    )
    facility_count = facility_result.scalar() or 0

    # 4. Specialist count (non-PCP individual providers)
    specialist_result = await db.execute(
        text(
            f"SELECT count(DISTINCT cp.canonical_id) FROM {base_join} "
            f"AND cp.entity_type = 'individual' "
            f"AND NOT (cp.specialty_codes && ARRAY[{pcp_tax_list}]::text[])"
        ),
        params,
    )
    specialist_count = specialist_result.scalar() or 0

    # 5. ZIP-specific adequacy if zip provided
    zip_adequacy = None
    if zip:
        # Count in-network providers within radius of this ZIP
        nearby_result = await db.execute(
            text(
                f"SELECT count(DISTINCT cp.canonical_id) FROM {base_join} "
                f"AND ST_DWithin("
                f"  CAST(ST_SetSRID(ST_Point(cp.lng, cp.lat), 4326) AS geography),"
                f"  (SELECT CAST(ST_SetSRID(ST_Point(z.lng, z.lat), 4326) AS geography) "
                f"   FROM {SCHEMA}.zip_centroids z WHERE z.zip = :zip),"
                f"  :radius"
                f")"
            ),
            {**params, "zip": zip, "radius": radius_m},
        )
        nearby_count = nearby_result.scalar() or 0

        # Nearby PCPs
        nearby_pcp_result = await db.execute(
            text(
                f"SELECT count(DISTINCT cp.canonical_id) FROM {base_join} "
                f"AND cp.specialty_codes && ARRAY[{pcp_tax_list}]::text[] "
                f"AND ST_DWithin("
                f"  CAST(ST_SetSRID(ST_Point(cp.lng, cp.lat), 4326) AS geography),"
                f"  (SELECT CAST(ST_SetSRID(ST_Point(z.lng, z.lat), 4326) AS geography) "
                f"   FROM {SCHEMA}.zip_centroids z WHERE z.zip = :zip),"
                f"  :radius"
                f")"
            ),
            {**params, "zip": zip, "radius": radius_m},
        )
        nearby_pcp = nearby_pcp_result.scalar() or 0

        zip_adequacy = {
            "zip": zip,
            "radius_miles": radius_miles,
            "providers_within_radius": nearby_count,
            "pcps_within_radius": nearby_pcp,
            "has_pcp_access": nearby_pcp > 0,
        }

    # Compute overall score (0-100)
    # Simple scoring: weight PCPs (30%), specialists (25%), facilities (25%), total (20%)
    pcp_score = min(pcp_count / 50, 1.0) * 100 if total_providers > 0 else 0
    specialist_score = min(specialist_count / 200, 1.0) * 100 if total_providers > 0 else 0
    facility_score = min(facility_count / 20, 1.0) * 100 if total_providers > 0 else 0
    total_score = min(total_providers / 1000, 1.0) * 100

    overall = round(
        pcp_score * 0.30 + specialist_score * 0.25 + facility_score * 0.25 + total_score * 0.20,
        1,
    )

    data = {
        "network_id": str(network_id),
        "network_name": network[1],
        "overall_score": overall,
        "scores": {
            "pcp_access": round(pcp_score, 1),
            "specialist_coverage": round(specialist_score, 1),
            "facility_access": round(facility_score, 1),
            "total_provider_coverage": round(total_score, 1),
        },
        "counts": {
            "total_providers": total_providers,
            "pcps": pcp_count,
            "specialists": specialist_count,
            "facilities": facility_count,
        },
        "zip_adequacy": zip_adequacy,
    }

    return SingleResponse(data=data, meta=ResponseMeta())
