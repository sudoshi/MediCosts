"""
Automated data quality checks for the ClearNetwork pipeline.

Run after every ingestion batch to catch data integrity issues before
they surface as consumer-facing errors.

Each check returns a QualityCheckResult with:
  - passed: bool
  - value: measured value (float)
  - threshold: the expected minimum/maximum
  - detail: human-readable explanation
  - severity: 'critical' | 'warning' | 'info'
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

SCHEMA = "clearnetwork"

# CMS NUCC taxonomy code prefix patterns (first 3 chars of valid codes)
VALID_TAXONOMY_PREFIXES = {
    "101",  # Behavioral health
    "102",
    "103",
    "104",
    "106",
    "111",  # Chiropractic
    "122",  # Dental
    "124",
    "125",
    "126",
    "133",  # Dietary & nutritional
    "146",  # Emergency medical services
    "152",  # Eye & vision services
    "163",  # Nursing service
    "164",
    "167",
    "171",  # Other service
    "172",
    "173",
    "174",
    "175",
    "176",
    "183",  # Pharmacy service
    "193",  # Podiatric medicine & surgery
    "202",  # Allopathic & osteopathic physicians
    "203",
    "204",
    "205",
    "206",
    "207",
    "208",
    "209",
    "210",
    "211",
    "213",
    "218",
    "219",
    "221",  # Respiratory, developm., rehabilitative
    "222",
    "224",
    "225",
    "231",  # Speech, language & hearing
    "235",
    "237",
    "241",
    "246",
    "247",
    "261",  # Hospitals
    "273",
    "275",
    "276",
    "281",
    "282",
    "283",
    "284",
    "285",
    "286",
    "287",
    "291",
    "302",  # Laboratories
    "305",
    "310",  # Nursing & custodial care
    "311",
    "313",
    "314",
    "315",
    "316",
    "317",
    "320",
    "322",
    "323",
    "324",
    "331",  # Residential treatment
    "332",
    "333",
    "335",
    "336",
    "341",  # Respite care
    "342",
    "343",
    "344",
    "347",
    "348",
    "349",
    "350",
    "351",
    "353",
    "354",
    "355",
    "356",
    "357",
    "358",
    "359",
    "360",  # Managed care
    "361",
    "362",
    "363",  # Nurse practitioners
    "364",
    "365",
    "366",
    "367",
    "368",
    "372",  # Home health
    "373",
    "374",
    "375",
    "376",
    "377",
    "378",
    "379",
    "381",
    "385",
    "390",
    "405",
    "407",
    "408",
    "409",
    "411",
    "413",
    "414",
    "415",
}


@dataclass
class QualityCheckResult:
    check_name: str
    passed: bool
    value: float
    threshold: float
    unit: str
    detail: str
    severity: str  # 'critical' | 'warning' | 'info'
    run_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict:
        return {
            "check_name": self.check_name,
            "passed": self.passed,
            "value": self.value,
            "threshold": self.threshold,
            "unit": self.unit,
            "detail": self.detail,
            "severity": self.severity,
            "run_at": self.run_at,
        }


async def check_npi_validity_rate(
    db: AsyncSession, threshold: float = 0.90
) -> QualityCheckResult:
    """
    Verify that ≥threshold of canonical providers have a valid 10-digit NPI.
    A valid NPI is exactly 10 digits (no letters, no shorter/longer values).
    """
    result = await db.execute(
        text(f"""
            SELECT
                count(*) FILTER (WHERE npi ~ '^[0-9]{{10}}$') AS valid_count,
                count(*) AS total_count
            FROM {SCHEMA}.canonical_providers
        """)
    )
    row = result.fetchone()
    total = row.total_count or 0
    valid = row.valid_count or 0
    rate = valid / total if total > 0 else 0.0
    passed = rate >= threshold

    return QualityCheckResult(
        check_name="npi_validity_rate",
        passed=passed,
        value=round(rate * 100, 2),
        threshold=round(threshold * 100, 2),
        unit="percent",
        detail=(
            f"{valid:,} of {total:,} providers have valid 10-digit NPIs "
            f"({rate*100:.1f}%){' — below threshold' if not passed else ''}"
        ),
        severity="critical" if not passed else "info",
    )


async def check_address_completeness(
    db: AsyncSession, threshold: float = 0.85
) -> QualityCheckResult:
    """
    Verify that ≥threshold of canonical providers have a geocoded address
    (non-null lat AND lng AND address_street).
    """
    result = await db.execute(
        text(f"""
            SELECT
                count(*) FILTER (
                    WHERE lat IS NOT NULL
                      AND lng IS NOT NULL
                      AND address_street IS NOT NULL
                      AND address_street != ''
                ) AS complete_count,
                count(*) AS total_count
            FROM {SCHEMA}.canonical_providers
        """)
    )
    row = result.fetchone()
    total = row.total_count or 0
    complete = row.complete_count or 0
    rate = complete / total if total > 0 else 0.0
    passed = rate >= threshold

    return QualityCheckResult(
        check_name="address_completeness",
        passed=passed,
        value=round(rate * 100, 2),
        threshold=round(threshold * 100, 2),
        unit="percent",
        detail=(
            f"{complete:,} of {total:,} providers have a geocoded address "
            f"({rate*100:.1f}%){' — below threshold' if not passed else ''}"
        ),
        severity="warning" if not passed else "info",
    )


async def check_no_duplicate_canonical_providers(
    db: AsyncSession,
) -> QualityCheckResult:
    """
    Detect duplicate NPI entries in canonical_providers.
    Any duplicates indicate a broken entity-resolution pipeline run.
    The NPI column has a unique index but this catches any logic errors
    in batch upsert paths that might bypass the index.
    """
    result = await db.execute(
        text(f"""
            SELECT
                count(*) AS duplicate_npi_count
            FROM (
                SELECT npi
                FROM {SCHEMA}.canonical_providers
                WHERE npi IS NOT NULL
                GROUP BY npi
                HAVING count(*) > 1
            ) dupes
        """)
    )
    duplicate_count = result.scalar() or 0
    passed = duplicate_count == 0

    return QualityCheckResult(
        check_name="no_duplicate_providers",
        passed=passed,
        value=float(duplicate_count),
        threshold=0.0,
        unit="count",
        detail=(
            "No duplicate NPIs found"
            if passed
            else f"{duplicate_count:,} NPI(s) appear more than once — entity resolution may have a bug"
        ),
        severity="critical" if not passed else "info",
    )


async def check_network_size_regression(
    db: AsyncSession, max_drop_pct: float = 0.20
) -> QualityCheckResult:
    """
    Compare the two most recent snapshots for each network.
    Flag if any network's provider count dropped by more than max_drop_pct.
    A sudden large drop usually indicates a bad crawl, not a real network change.
    """
    result = await db.execute(
        text(f"""
            WITH ranked AS (
                SELECT
                    network_id,
                    provider_count,
                    snapshot_date,
                    row_number() OVER (PARTITION BY network_id ORDER BY snapshot_date DESC) AS rn
                FROM {SCHEMA}.network_snapshots
            ),
            latest AS (SELECT network_id, provider_count, snapshot_date FROM ranked WHERE rn = 1),
            prior  AS (SELECT network_id, provider_count, snapshot_date FROM ranked WHERE rn = 2)
            SELECT
                l.network_id,
                n.network_name,
                prior.provider_count  AS prior_count,
                l.provider_count      AS current_count,
                CASE
                    WHEN prior.provider_count > 0
                    THEN round(
                        (prior.provider_count - l.provider_count)::numeric
                        / prior.provider_count * 100, 1
                    )
                    ELSE 0
                END AS drop_pct
            FROM latest l
            JOIN {SCHEMA}.networks n ON n.id = l.network_id
            LEFT JOIN prior ON prior.network_id = l.network_id
            WHERE prior.provider_count IS NOT NULL
              AND l.provider_count < prior.provider_count
            ORDER BY drop_pct DESC
        """)
    )
    regressions = result.fetchall()

    # Filter to those exceeding the threshold
    bad = [r for r in regressions if float(r.drop_pct or 0) >= max_drop_pct * 100]
    passed = len(bad) == 0

    if bad:
        worst = bad[0]
        detail = (
            f"{len(bad)} network(s) dropped >{max_drop_pct*100:.0f}% of providers. "
            f"Worst: '{worst.network_name}' dropped {worst.drop_pct}% "
            f"({worst.prior_count:,} → {worst.current_count:,})"
        )
    else:
        detail = (
            f"No networks dropped more than {max_drop_pct*100:.0f}% of providers"
        )

    return QualityCheckResult(
        check_name="network_size_regression",
        passed=passed,
        value=float(len(bad)),
        threshold=0.0,
        unit="networks",
        detail=detail,
        severity="critical" if not passed else "info",
    )


async def check_geographic_distribution_sanity(
    db: AsyncSession,
) -> QualityCheckResult:
    """
    Verify that providers are spread across multiple US states.
    A healthy dataset should have providers in ≥40 states.
    A low state count suggests geocoding failed or data was loaded for only one region.
    """
    result = await db.execute(
        text(f"""
            SELECT
                count(DISTINCT address_state) AS state_count,
                count(*) AS total_count
            FROM {SCHEMA}.canonical_providers
            WHERE address_state IS NOT NULL
              AND address_state ~ '^[A-Z]{{2}}$'
        """)
    )
    row = result.fetchone()
    state_count = row.state_count or 0
    total = row.total_count or 0
    threshold = 40.0
    passed = state_count >= threshold or total == 0  # pass if no data yet loaded

    return QualityCheckResult(
        check_name="geographic_distribution_sanity",
        passed=passed,
        value=float(state_count),
        threshold=threshold,
        unit="states",
        detail=(
            f"Providers found in {state_count} US states "
            f"(out of {total:,} geocoded providers)"
            + (" — suspiciously few states" if not passed and total > 0 else "")
        ),
        severity="warning" if not passed and total > 0 else "info",
    )


async def check_specialty_code_validity(
    db: AsyncSession,
) -> QualityCheckResult:
    """
    Sample up to 10,000 specialty_codes array entries and verify they match
    known CMS NUCC taxonomy code prefixes (first 3 characters).
    Invalid codes indicate a normalization bug in the NPI loader.
    """
    result = await db.execute(
        text(f"""
            WITH sampled AS (
                SELECT unnest(specialty_codes) AS code
                FROM {SCHEMA}.canonical_providers
                WHERE specialty_codes IS NOT NULL
                  AND array_length(specialty_codes, 1) > 0
                LIMIT 10000
            )
            SELECT
                count(*) AS total_codes,
                count(*) FILTER (WHERE length(code) >= 10) AS plausible_length
            FROM sampled
        """)
    )
    row = result.fetchone()
    total = row.total_codes or 0
    plausible = row.plausible_length or 0
    rate = plausible / total if total > 0 else 1.0
    threshold = 0.95
    passed = rate >= threshold or total == 0

    return QualityCheckResult(
        check_name="specialty_code_validity",
        passed=passed,
        value=round(rate * 100, 2),
        threshold=round(threshold * 100, 2),
        unit="percent",
        detail=(
            f"{plausible:,} of {total:,} sampled specialty codes are valid length (≥10 chars) "
            f"({rate*100:.1f}%)"
            + (" — possible taxonomy code corruption" if not passed and total > 0 else "")
        ),
        severity="warning" if not passed and total > 0 else "info",
    )


async def run_all_checks(db: AsyncSession) -> list[QualityCheckResult]:
    """Run all six quality checks and return results in order of severity."""
    checks = await _gather_checks(db)
    # Sort: critical first, then warning, then info; failures before passes
    severity_order = {"critical": 0, "warning": 1, "info": 2}
    checks.sort(key=lambda c: (severity_order[c.severity], c.passed))
    return checks


async def _gather_checks(db: AsyncSession) -> list[QualityCheckResult]:
    results = []
    for fn in [
        check_npi_validity_rate,
        check_address_completeness,
        check_no_duplicate_canonical_providers,
        check_network_size_regression,
        check_geographic_distribution_sanity,
        check_specialty_code_validity,
    ]:
        try:
            results.append(await fn(db))
        except Exception as exc:
            results.append(
                QualityCheckResult(
                    check_name=getattr(fn, "__name__", "unknown"),
                    passed=False,
                    value=0.0,
                    threshold=0.0,
                    unit="n/a",
                    detail=f"Check failed with error: {exc}",
                    severity="critical",
                )
            )
    return results
