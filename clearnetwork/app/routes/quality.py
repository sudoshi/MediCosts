"""
Quality monitoring API routes.

Exposes data quality check results, crawl statistics, and network
staleness metrics so the admin dashboard can surface pipeline health
without direct database access.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Query
from sqlalchemy import text

from app.dependencies import DBSession
from app.quality.checks import run_all_checks
from app.schemas.common import ResponseMeta, SingleResponse

router = APIRouter(prefix="/quality", tags=["quality"])

SCHEMA = "clearnetwork"


@router.get("/checks", response_model=SingleResponse)
async def get_quality_checks(db: DBSession):
    """
    Run all automated quality checks against the live database and return results.

    Checks:
    - NPI validity rate (target ≥90%)
    - Address / geocode completeness (target ≥85%)
    - Duplicate canonical providers (target: 0)
    - Network size regression across snapshots (target: no drops >20%)
    - Geographic distribution sanity (target ≥40 states)
    - Specialty code validity (target ≥95%)
    """
    results = await run_all_checks(db)
    summary = {
        "total": len(results),
        "passed": sum(1 for r in results if r.passed),
        "failed": sum(1 for r in results if not r.passed),
        "critical_failures": sum(1 for r in results if not r.passed and r.severity == "critical"),
        "warnings": sum(1 for r in results if not r.passed and r.severity == "warning"),
    }
    return SingleResponse(
        data={"summary": summary, "checks": [r.to_dict() for r in results]},
        meta=ResponseMeta(),
    )


@router.get("/crawl-stats", response_model=SingleResponse)
async def get_crawl_stats(
    db: DBSession,
    limit: int = Query(50, description="Max number of crawl jobs to return"),
):
    """
    Return crawl job statistics per insurer including success rates, last run
    timestamps, provider counts found, and file counts processed.
    """
    # Overall summary
    summary_result = await db.execute(
        text(f"""
            SELECT
                count(*)                                               AS total_jobs,
                count(*) FILTER (WHERE status = 'completed')          AS successful_jobs,
                count(*) FILTER (WHERE status = 'failed')             AS failed_jobs,
                count(*) FILTER (WHERE status = 'running')            AS running_jobs,
                max(completed_at)                                      AS last_completed,
                sum(providers_found)                                   AS total_providers_found,
                sum(files_processed)                                   AS total_files_processed,
                sum(errors)                                            AS total_errors
            FROM {SCHEMA}.crawl_jobs
        """)
    )
    summary_row = summary_result.fetchone()

    total = summary_row.total_jobs or 0
    success = summary_row.successful_jobs or 0
    overall_success_rate = round(success / total * 100, 1) if total > 0 else 0.0

    # Per-insurer breakdown (most recent job per insurer)
    insurer_result = await db.execute(
        text(f"""
            WITH ranked AS (
                SELECT
                    cj.*,
                    i.legal_name AS insurer_name,
                    row_number() OVER (
                        PARTITION BY cj.insurer_id
                        ORDER BY cj.started_at DESC
                    ) AS rn
                FROM {SCHEMA}.crawl_jobs cj
                LEFT JOIN {SCHEMA}.insurers i ON i.id = cj.insurer_id
            ),
            failure_counts AS (
                SELECT
                    cj.insurer_id,
                    count(cf.id) AS failure_count
                FROM {SCHEMA}.crawl_failures cf
                JOIN {SCHEMA}.crawl_jobs cj ON cj.id = cf.crawl_job_id
                GROUP BY cj.insurer_id
            )
            SELECT
                r.insurer_id,
                r.insurer_name,
                r.id           AS last_job_id,
                r.status       AS last_status,
                r.started_at   AS last_started,
                r.completed_at AS last_completed,
                r.files_processed,
                r.providers_found,
                r.errors,
                coalesce(fc.failure_count, 0) AS total_failures,
                extract(epoch FROM (now() - r.completed_at)) / 3600 AS hours_since_crawl
            FROM ranked r
            LEFT JOIN failure_counts fc ON fc.insurer_id = r.insurer_id
            WHERE r.rn = 1
            ORDER BY r.started_at DESC
            LIMIT :limit
        """),
        {"limit": limit},
    )
    insurer_rows = insurer_result.fetchall()

    insurers = [
        {
            "insurer_id": str(row.insurer_id) if row.insurer_id else None,
            "insurer_name": row.insurer_name or "Unknown",
            "last_status": row.last_status,
            "last_started": row.last_started.isoformat() if row.last_started else None,
            "last_completed": row.last_completed.isoformat() if row.last_completed else None,
            "files_processed": row.files_processed or 0,
            "providers_found": row.providers_found or 0,
            "errors": row.errors or 0,
            "total_failures": row.total_failures or 0,
            "hours_since_crawl": round(float(row.hours_since_crawl), 1)
            if row.hours_since_crawl is not None
            else None,
        }
        for row in insurer_rows
    ]

    # Compute per-insurer success rate from all their jobs
    rate_result = await db.execute(
        text(f"""
            SELECT
                insurer_id,
                count(*) AS total,
                count(*) FILTER (WHERE status = 'completed') AS success
            FROM {SCHEMA}.crawl_jobs
            GROUP BY insurer_id
        """)
    )
    rate_map = {str(r.insurer_id): (r.success, r.total) for r in rate_result.fetchall()}

    for ins in insurers:
        iid = ins["insurer_id"]
        if iid and iid in rate_map:
            s, t = rate_map[iid]
            ins["success_rate"] = round(s / t * 100, 1) if t > 0 else 0.0
            ins["all_time_total"] = t
        else:
            ins["success_rate"] = None
            ins["all_time_total"] = 0

    return SingleResponse(
        data={
            "summary": {
                "total_jobs": total,
                "successful_jobs": success,
                "failed_jobs": summary_row.failed_jobs or 0,
                "running_jobs": summary_row.running_jobs or 0,
                "overall_success_rate": overall_success_rate,
                "last_completed": summary_row.last_completed.isoformat()
                if summary_row.last_completed
                else None,
                "total_providers_found": summary_row.total_providers_found or 0,
                "total_files_processed": summary_row.total_files_processed or 0,
                "total_errors": summary_row.total_errors or 0,
            },
            "insurers": insurers,
        },
        meta=ResponseMeta(),
    )


@router.get("/network-staleness", response_model=SingleResponse)
async def get_network_staleness(db: DBSession):
    """
    Return all networks with their last update timestamp and staleness age.
    Networks not updated within 30 days are flagged as stale.
    Networks with no snapshots at all are flagged as never-crawled.
    """
    result = await db.execute(
        text(f"""
            WITH latest_snap AS (
                SELECT
                    network_id,
                    max(snapshot_date)   AS last_snapshot,
                    max(provider_count)  AS latest_provider_count
                FROM {SCHEMA}.network_snapshots
                GROUP BY network_id
            )
            SELECT
                n.id             AS network_id,
                n.network_name,
                i.legal_name     AS insurer_name,
                n.last_updated,
                n.provider_count AS reported_count,
                ls.last_snapshot,
                ls.latest_provider_count,
                extract(epoch FROM (now() - coalesce(ls.last_snapshot, n.last_updated)))
                    / 86400        AS days_stale
            FROM {SCHEMA}.networks n
            LEFT JOIN {SCHEMA}.insurers i ON i.id = n.insurer_id
            LEFT JOIN latest_snap ls ON ls.network_id = n.id
            ORDER BY days_stale DESC NULLS FIRST, n.network_name
        """)
    )
    rows = result.fetchall()

    networks = []
    for row in rows:
        days = float(row.days_stale) if row.days_stale is not None else None
        if days is None:
            status = "never_crawled"
        elif days > 60:
            status = "critical"
        elif days > 30:
            status = "stale"
        else:
            status = "current"

        networks.append(
            {
                "network_id": str(row.network_id),
                "network_name": row.network_name,
                "insurer_name": row.insurer_name or "Unknown",
                "last_updated": row.last_updated.isoformat() if row.last_updated else None,
                "last_snapshot": row.last_snapshot.isoformat() if row.last_snapshot else None,
                "reported_provider_count": row.reported_count or 0,
                "snapshot_provider_count": row.latest_provider_count or 0,
                "days_stale": round(days, 1) if days is not None else None,
                "status": status,
            }
        )

    stale_count = sum(1 for n in networks if n["status"] in ("stale", "critical"))
    critical_count = sum(1 for n in networks if n["status"] == "critical")
    never_count = sum(1 for n in networks if n["status"] == "never_crawled")

    return SingleResponse(
        data={
            "summary": {
                "total_networks": len(networks),
                "current": sum(1 for n in networks if n["status"] == "current"),
                "stale": stale_count,
                "critical": critical_count,
                "never_crawled": never_count,
            },
            "networks": networks,
        },
        meta=ResponseMeta(),
    )


@router.get("/provider-deltas", response_model=SingleResponse)
async def get_provider_deltas(
    db: DBSession,
    limit: int = Query(20, description="Top N networks by absolute change"),
):
    """
    Return provider count changes between the two most recent snapshots per network.
    Large drops (>20%) indicate a possible bad crawl and trigger an alert.
    """
    result = await db.execute(
        text(f"""
            WITH ranked AS (
                SELECT
                    network_id,
                    provider_count,
                    snapshot_date,
                    row_number() OVER (
                        PARTITION BY network_id ORDER BY snapshot_date DESC
                    ) AS rn
                FROM {SCHEMA}.network_snapshots
            ),
            latest AS (SELECT network_id, provider_count, snapshot_date FROM ranked WHERE rn = 1),
            prior  AS (SELECT network_id, provider_count, snapshot_date FROM ranked WHERE rn = 2)
            SELECT
                n.id            AS network_id,
                n.network_name,
                i.legal_name    AS insurer_name,
                prior.provider_count  AS prior_count,
                latest.provider_count AS current_count,
                latest.provider_count - prior.provider_count AS delta,
                CASE
                    WHEN prior.provider_count > 0
                    THEN round(
                        (latest.provider_count - prior.provider_count)::numeric
                        / prior.provider_count * 100, 1
                    )
                    ELSE NULL
                END AS delta_pct,
                prior.snapshot_date  AS prior_date,
                latest.snapshot_date AS current_date
            FROM latest
            JOIN {SCHEMA}.networks n ON n.id = latest.network_id
            LEFT JOIN {SCHEMA}.insurers i ON i.id = n.insurer_id
            LEFT JOIN prior ON prior.network_id = latest.network_id
            WHERE prior.provider_count IS NOT NULL
            ORDER BY abs(latest.provider_count - prior.provider_count) DESC
            LIMIT :limit
        """),
        {"limit": limit},
    )
    rows = result.fetchall()

    deltas = [
        {
            "network_id": str(row.network_id),
            "network_name": row.network_name,
            "insurer_name": row.insurer_name or "Unknown",
            "prior_count": row.prior_count,
            "current_count": row.current_count,
            "delta": row.delta,
            "delta_pct": float(row.delta_pct) if row.delta_pct is not None else None,
            "prior_date": row.prior_date.isoformat() if row.prior_date else None,
            "current_date": row.current_date.isoformat() if row.current_date else None,
            "flag": abs(float(row.delta_pct or 0)) >= 20 and (row.delta or 0) < 0,
        }
        for row in rows
    ]

    flagged = [d for d in deltas if d["flag"]]

    return SingleResponse(
        data={
            "summary": {
                "networks_with_snapshots": len(deltas),
                "flagged_regressions": len(flagged),
            },
            "deltas": deltas,
        },
        meta=ResponseMeta(),
    )


@router.get("/npi-stats", response_model=SingleResponse)
async def get_npi_stats(db: DBSession):
    """
    Return NPI validation statistics broken down by entity type and
    a sample of invalid NPI values for manual inspection.
    """
    breakdown_result = await db.execute(
        text(f"""
            SELECT
                entity_type,
                count(*)                                              AS total,
                count(*) FILTER (WHERE npi ~ '^[0-9]{{10}}$')        AS valid,
                count(*) FILTER (WHERE npi IS NULL)                   AS null_count,
                count(*) FILTER (WHERE npi IS NOT NULL
                                    AND NOT (npi ~ '^[0-9]{{10}}$')) AS invalid_count
            FROM {SCHEMA}.canonical_providers
            GROUP BY entity_type
            ORDER BY total DESC
        """)
    )
    breakdown = [
        {
            "entity_type": row.entity_type or "unknown",
            "total": row.total,
            "valid": row.valid,
            "null_count": row.null_count,
            "invalid_count": row.invalid_count,
            "validity_rate": round(row.valid / row.total * 100, 1) if row.total > 0 else 0.0,
        }
        for row in breakdown_result.fetchall()
    ]

    # Sample up to 20 invalid NPIs for human inspection
    sample_result = await db.execute(
        text(f"""
            SELECT npi, name_canonical, entity_type, address_state
            FROM {SCHEMA}.canonical_providers
            WHERE npi IS NOT NULL
              AND NOT (npi ~ '^[0-9]{{10}}$')
            LIMIT 20
        """)
    )
    invalid_samples = [
        {
            "npi": row.npi,
            "name": row.name_canonical,
            "entity_type": row.entity_type,
            "state": row.address_state,
        }
        for row in sample_result.fetchall()
    ]

    return SingleResponse(
        data={
            "breakdown_by_entity_type": breakdown,
            "invalid_samples": invalid_samples,
        },
        meta=ResponseMeta(),
    )
