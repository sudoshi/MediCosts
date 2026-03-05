"""50-State Insurer Discovery Scout — brute-force MRF URL discovery + transparency scoring.

Discovers health insurers across all 50 US states by:
1. Scraping the CMS Transparency in Coverage machine-readable index
2. Cross-referencing with our known_insurers.json registry
3. Probing each MRF URL with HEAD requests to classify accessibility
4. Scoring each insurer on transparency vs digital debt
5. Writing results to state-registry/*.json AND upserting to clearnetwork.mrf_research

Usage:
    python -m crawler.scout                          # Full 50-state scan
    python -m crawler.scout --state PA               # Single state
    python -m crawler.scout --probe-only             # Re-probe existing entries (no CMS fetch)
    python -m crawler.scout --score-only             # Re-score existing entries (no probing)
    python -m crawler.scout --export                 # Export state-registry/*.json from DB
"""
import argparse
import asyncio
import json
import logging
import os
import re
import ssl
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import aiohttp
import asyncpg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)-16s %(message)s",
)
logger = logging.getLogger("scout")

SCHEMA = "clearnetwork"
PROJECT_ROOT = Path(__file__).resolve().parents[2]
KNOWN_INSURERS_PATH = Path(__file__).parent / "known_insurers.json"
STATE_REGISTRY_DIR = PROJECT_ROOT / "clearnetwork" / "state-registry"

US_STATES = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
    "DC",
]

# CMS Transparency in Coverage index URL
# This is the master index that lists every insurer's MRF file location
CMS_TIC_INDEX_URL = "https://transparency-in-coverage.cms.gov/index.json"

# Well-known insurer MRF landing pages to scrape for TOC URLs
KNOWN_MRF_LANDING_PAGES = {
    "uhc": "https://transparency-in-coverage.uhc.com/api/v1/uhc/blobs/",
    "anthem": "https://antm-pt-prod-dataz-nogbd-nophi-us-east1.s3.amazonaws.com/anthem/",
    "cigna": "https://d25kgz5rikkq4n.cloudfront.net/cost_transparency/",
    "aetna": "https://health1.aetna.com/app/public/#/one/insurerCode=AETNA_I&brandCode=ALICSI/machine-readable-transparency-in-coverage",
    "humana": "https://developers.humana.com/syntheticdata/healthplan-price-transparency",
    "centene": "https://www.centene.com/price-transparency-files.html",
    "kaiser": "https://healthy.kaiserpermanente.org/front-door/machine-readable",
    "molina": "https://www.molinahealthcare.com/members/common/en-us/Pages/machine-readable-files.aspx",
}

# Sapphire MRF Hub carriers — common BCBS hosting platform
SAPPHIRE_HUB_PATTERN = re.compile(r"https?://[\w.-]+\.sapphiremrfhub\.com")

# Azure Blob carriers (HCSC family)
HCSC_AZURE_PATTERN = re.compile(r"https?://app\d+\.blob\.core\.windows\.net")


# ──────────────────────────────────────────────────────────────────────
# Database helpers
# ──────────────────────────────────────────────────────────────────────

async def get_db_conn():
    return await asyncpg.connect(
        host=os.environ.get("PGHOST", "localhost"),
        port=int(os.environ.get("PGPORT", "5432")),
        user=os.environ.get("PGUSER", "postgres"),
        password=os.environ.get("PGPASSWORD", ""),
        database=os.environ.get("PGDATABASE", "medicosts"),
    )


async def upsert_research_entry(conn, entry: dict):
    """Upsert a single insurer research entry into mrf_research."""
    await conn.execute(f"""
        INSERT INTO {SCHEMA}.mrf_research (
            id, state, insurer_name, trade_names, market_share_rank,
            mrf_url, mrf_url_verified, index_type, date_pattern,
            http_status, accessibility, notes,
            content_type, response_time_ms, ssl_valid, supports_gzip,
            file_size_bytes, last_probed_at, data_freshness_days,
            transparency_score, digital_debt_score, score_breakdown,
            last_scored_at, cms_source, researched_at
        ) VALUES (
            uuid_generate_v4(), $1, $2, $3, $4,
            $5, $6, $7, $8,
            $9, $10, $11,
            $12, $13, $14, $15,
            $16, $17, $18,
            $19, $20, $21,
            $22, $23, NOW()
        )
        ON CONFLICT (state, insurer_name) DO UPDATE SET
            trade_names = COALESCE(EXCLUDED.trade_names, {SCHEMA}.mrf_research.trade_names),
            mrf_url = COALESCE(EXCLUDED.mrf_url, {SCHEMA}.mrf_research.mrf_url),
            mrf_url_verified = EXCLUDED.mrf_url_verified,
            index_type = COALESCE(EXCLUDED.index_type, {SCHEMA}.mrf_research.index_type),
            date_pattern = COALESCE(EXCLUDED.date_pattern, {SCHEMA}.mrf_research.date_pattern),
            http_status = EXCLUDED.http_status,
            accessibility = EXCLUDED.accessibility,
            notes = EXCLUDED.notes,
            content_type = EXCLUDED.content_type,
            response_time_ms = EXCLUDED.response_time_ms,
            ssl_valid = EXCLUDED.ssl_valid,
            supports_gzip = EXCLUDED.supports_gzip,
            file_size_bytes = EXCLUDED.file_size_bytes,
            last_probed_at = EXCLUDED.last_probed_at,
            data_freshness_days = EXCLUDED.data_freshness_days,
            transparency_score = EXCLUDED.transparency_score,
            digital_debt_score = EXCLUDED.digital_debt_score,
            score_breakdown = EXCLUDED.score_breakdown,
            last_scored_at = EXCLUDED.last_scored_at,
            cms_source = EXCLUDED.cms_source
    """,
        entry["state"],
        entry["insurer_name"],
        entry.get("trade_names"),
        entry.get("market_share_rank"),
        entry.get("mrf_url"),
        entry.get("mrf_url_verified", False),
        entry.get("index_type"),
        entry.get("date_pattern"),
        entry.get("http_status"),
        entry.get("accessibility"),
        entry.get("notes"),
        entry.get("content_type"),
        entry.get("response_time_ms"),
        entry.get("ssl_valid"),
        entry.get("supports_gzip"),
        entry.get("file_size_bytes"),
        entry.get("last_probed_at"),
        entry.get("data_freshness_days"),
        entry.get("transparency_score"),
        entry.get("digital_debt_score"),
        json.dumps(entry.get("score_breakdown")) if entry.get("score_breakdown") else None,
        entry.get("last_scored_at"),
        entry.get("cms_source", False),
    )


# ──────────────────────────────────────────────────────────────────────
# Transparency scoring
# ──────────────────────────────────────────────────────────────────────

def compute_scores(entry: dict) -> dict:
    """Compute transparency_score (0-100) and digital_debt_score (0-100)."""
    t_score = 0  # transparency (higher = better)
    d_score = 0  # digital debt (higher = worse)
    breakdown = {}

    accessibility = entry.get("accessibility", "unknown")
    http_status = entry.get("http_status")
    content_type = entry.get("content_type", "")
    response_time = entry.get("response_time_ms", 0)
    ssl_valid = entry.get("ssl_valid")
    supports_gzip = entry.get("supports_gzip")
    file_size = entry.get("file_size_bytes", 0)
    freshness_days = entry.get("data_freshness_days")

    # 1. Accessibility (biggest factor)
    if accessibility == "automatable":
        t_score += 30
        breakdown["accessibility"] = "+30 (automatable)"
    elif accessibility == "browser_required":
        d_score += 30
        breakdown["accessibility"] = "+30 debt (browser required)"
    elif accessibility == "dead":
        d_score += 40
        breakdown["accessibility"] = "+40 debt (dead/unreachable)"
    elif accessibility == "auth_required":
        d_score += 25
        breakdown["accessibility"] = "+25 debt (auth wall)"

    # 2. Valid HTTP response
    if http_status == 200:
        t_score += 10
        breakdown["http_status"] = "+10 (200 OK)"
    elif http_status == 403:
        d_score += 15
        breakdown["http_status"] = "+15 debt (403 Forbidden)"
    elif http_status == 404:
        d_score += 20
        breakdown["http_status"] = "+20 debt (404 Not Found)"
    elif http_status and http_status >= 500:
        d_score += 10
        breakdown["http_status"] = "+10 debt (server error)"

    # 3. Content type indicates machine-readable data
    if content_type:
        ct_lower = content_type.lower()
        if "json" in ct_lower or "gzip" in ct_lower or "octet-stream" in ct_lower:
            t_score += 15
            breakdown["content_type"] = "+15 (machine-readable)"
        elif "html" in ct_lower:
            d_score += 15
            breakdown["content_type"] = "+15 debt (returns HTML, not data)"

    # 4. Gzip/streaming support
    if supports_gzip:
        t_score += 10
        breakdown["gzip"] = "+10 (gzip supported)"

    # 5. Response time
    if response_time and response_time > 0:
        if response_time < 5000:
            t_score += 10
            breakdown["response_time"] = f"+10 ({response_time}ms < 5s)"
        elif response_time > 30000:
            d_score += 5
            breakdown["response_time"] = f"+5 debt ({response_time}ms > 30s)"

    # 6. SSL validity
    if ssl_valid is True:
        t_score += 5
        breakdown["ssl"] = "+5 (valid SSL)"
    elif ssl_valid is False:
        d_score += 10
        breakdown["ssl"] = "+10 debt (SSL issues)"

    # 7. Data freshness
    if freshness_days is not None:
        if freshness_days <= 30:
            t_score += 15
            breakdown["freshness"] = f"+15 ({freshness_days}d old, fresh)"
        elif freshness_days > 90:
            d_score += 10
            breakdown["freshness"] = f"+10 debt ({freshness_days}d old, stale)"

    # 8. File size sanity
    if file_size and file_size > 50 * 1024 * 1024 * 1024:  # >50GB
        d_score += 10
        breakdown["file_size"] = "+10 debt (>50GB without chunking)"

    # 9. Known index type bonus
    index_type = entry.get("index_type", "")
    if index_type in ("direct_json", "dated_s3", "dated_azure", "dated_cloudfront", "dated_hmhs", "sapphire_hub", "uhc_blob_api"):
        t_score += 5
        breakdown["index_type"] = f"+5 (known pattern: {index_type})"

    # Cap at 100
    t_score = min(100, max(0, t_score))
    d_score = min(100, max(0, d_score))

    now = datetime.now(timezone.utc)
    entry["transparency_score"] = t_score
    entry["digital_debt_score"] = d_score
    entry["score_breakdown"] = breakdown
    entry["last_scored_at"] = now
    return entry


# ──────────────────────────────────────────────────────────────────────
# URL probing
# ──────────────────────────────────────────────────────────────────────

def classify_index_type(url: str) -> tuple[str, str | None]:
    """Classify a MRF URL into an index type and optional date pattern."""
    if not url:
        return "unknown", None

    parsed = urlparse(url)
    domain = parsed.netloc.lower()

    # UHC blob API
    if "transparency-in-coverage.uhc.com" in domain:
        return "uhc_blob_api", None

    # Sapphire hub (BCBS carriers)
    if "sapphiremrfhub.com" in domain:
        return "sapphire_hub", None

    # Azure blob storage (HCSC family)
    if ".blob.core.windows.net" in domain:
        return "dated_azure", "YYYY-MM-DD"

    # S3 buckets
    if ".s3.amazonaws.com" in domain or ".s3." in domain:
        return "dated_s3", "YYYY-MM-DD"

    # CloudFront
    if ".cloudfront.net" in domain:
        return "dated_cloudfront", "YYYY-MM"

    # Direct JSON link
    if url.endswith(".json") or url.endswith(".json.gz"):
        return "direct_json", None

    # HTML page — likely browser_required
    if parsed.path.endswith((".html", ".page", ".aspx", ".php")) or "#" in url:
        return "browser_required", None

    return "unknown", None


async def probe_url(session: aiohttp.ClientSession, url: str, timeout: float = 30.0) -> dict:
    """Probe a URL with HEAD + GET fallback, returning metadata."""
    result = {
        "mrf_url": url,
        "http_status": None,
        "content_type": None,
        "response_time_ms": None,
        "ssl_valid": None,
        "supports_gzip": None,
        "file_size_bytes": None,
        "accessibility": "unknown",
        "mrf_url_verified": False,
        "last_probed_at": datetime.now(timezone.utc),
        "notes": "",
    }

    if not url:
        result["accessibility"] = "dead"
        result["notes"] = "No URL provided"
        return result

    try:
        start = time.monotonic()
        headers = {"Accept-Encoding": "gzip, deflate"}

        # Try HEAD first
        try:
            async with session.head(
                url, allow_redirects=True, headers=headers,
                timeout=aiohttp.ClientTimeout(total=timeout),
                ssl=True,
            ) as resp:
                elapsed = int((time.monotonic() - start) * 1000)
                result["http_status"] = resp.status
                result["content_type"] = resp.headers.get("Content-Type", "")
                result["response_time_ms"] = elapsed
                result["file_size_bytes"] = resp.content_length
                result["ssl_valid"] = True
                result["supports_gzip"] = "gzip" in resp.headers.get("Content-Encoding", "")

                if resp.status == 405:
                    # HEAD not allowed, try GET with range
                    raise aiohttp.ClientResponseError(
                        request_info=resp.request_info,
                        history=resp.history,
                        status=405,
                    )
        except (aiohttp.ClientResponseError,) as e:
            if getattr(e, "status", 0) == 405:
                # Fallback to GET with Range header (only first byte)
                start = time.monotonic()
                async with session.get(
                    url, allow_redirects=True, headers={**headers, "Range": "bytes=0-0"},
                    timeout=aiohttp.ClientTimeout(total=timeout),
                ) as resp:
                    elapsed = int((time.monotonic() - start) * 1000)
                    result["http_status"] = resp.status
                    result["content_type"] = resp.headers.get("Content-Type", "")
                    result["response_time_ms"] = elapsed
                    result["ssl_valid"] = True
            else:
                raise

        # Classify accessibility based on response
        status = result["http_status"]
        ct = (result["content_type"] or "").lower()

        if status == 200 or status == 206:
            if "html" in ct:
                result["accessibility"] = "browser_required"
                result["notes"] = "Returns HTML — likely requires browser/JS"
            else:
                result["accessibility"] = "automatable"
                result["mrf_url_verified"] = True
        elif status == 301 or status == 302:
            result["accessibility"] = "automatable"
            result["notes"] = f"Redirects ({status})"
        elif status == 403:
            result["accessibility"] = "auth_required"
            result["notes"] = "403 Forbidden — auth/CORS wall"
        elif status == 404:
            result["accessibility"] = "dead"
            result["notes"] = "404 Not Found"
        elif status == 429:
            result["accessibility"] = "rate_limited"
            result["notes"] = "429 Too Many Requests on first probe"
        elif status and status >= 500:
            result["accessibility"] = "server_error"
            result["notes"] = f"Server error ({status})"

    except aiohttp.ClientSSLError as e:
        result["ssl_valid"] = False
        result["accessibility"] = "dead"
        result["notes"] = f"SSL error: {str(e)[:200]}"
    except aiohttp.ClientConnectorError as e:
        result["accessibility"] = "dead"
        result["notes"] = f"Connection error: {str(e)[:200]}"
    except asyncio.TimeoutError:
        result["accessibility"] = "dead"
        result["notes"] = f"Timeout after {timeout}s"
    except Exception as e:
        result["accessibility"] = "dead"
        result["notes"] = f"Probe error: {type(e).__name__}: {str(e)[:200]}"

    return result


# ──────────────────────────────────────────────────────────────────────
# CMS Transparency Index discovery
# ──────────────────────────────────────────────────────────────────────

async def fetch_cms_index(session: aiohttp.ClientSession) -> list[dict]:
    """Fetch the CMS Transparency in Coverage index to discover all insurer MRF URLs.

    The CMS maintains a JSON index listing every insurer that has published MRF files.
    Returns a list of {insurer_name, mrf_url, states} entries.
    """
    entries = []

    # The CMS index may not be a single JSON file — it's spread across
    # multiple sources. We use a combination approach:
    # 1. The CMS machine-readable PUF (Public Use File) for QHP insurers
    # 2. Direct scraping of known insurer MRF landing pages
    # 3. Our existing known_insurers.json as a seed

    # Try CMS QHP landscape data for insurer listings per state
    qhp_url = "https://data.cms.gov/provider-data/api/1/datastore/query/b8in-sz6k"
    try:
        async with session.get(
            qhp_url,
            params={"limit": 5000, "offset": 0},
            timeout=aiohttp.ClientTimeout(total=60),
        ) as resp:
            if resp.status == 200:
                data = await resp.json(content_type=None)
                results = data.get("results", data) if isinstance(data, dict) else data
                if isinstance(results, list):
                    seen = set()
                    for row in results:
                        name = row.get("issuer_name") or row.get("plan_marketing_name", "")
                        state = row.get("state_code") or row.get("state", "")
                        if name and state and (name, state) not in seen:
                            seen.add((name, state))
                            entries.append({
                                "insurer_name": name,
                                "state": state,
                                "cms_source": True,
                            })
                    logger.info("CMS QHP index: found %d unique insurer-state pairs", len(entries))
    except Exception as e:
        logger.warning("CMS QHP index fetch failed: %s — continuing with other sources", e)

    # Also try CMS marketplace PUF for issuer data
    puf_url = "https://data.cms.gov/provider-data/api/1/datastore/query/xu44-u5ti"
    try:
        async with session.get(
            puf_url,
            params={"limit": 5000, "offset": 0},
            timeout=aiohttp.ClientTimeout(total=60),
        ) as resp:
            if resp.status == 200:
                data = await resp.json(content_type=None)
                results = data.get("results", data) if isinstance(data, dict) else data
                if isinstance(results, list):
                    seen = {(e["insurer_name"], e["state"]) for e in entries}
                    new_count = 0
                    for row in results:
                        name = row.get("issuer_name") or row.get("organization_name", "")
                        state = row.get("state") or row.get("state_code", "")
                        if name and state and len(state) == 2 and (name, state) not in seen:
                            seen.add((name, state))
                            entries.append({
                                "insurer_name": name,
                                "state": state,
                                "cms_source": True,
                            })
                            new_count += 1
                    logger.info("CMS PUF index: found %d additional insurer-state pairs", new_count)
    except Exception as e:
        logger.warning("CMS PUF index fetch failed: %s — continuing", e)

    return entries


async def merge_known_insurers(entries: list[dict]) -> list[dict]:
    """Merge our curated known_insurers.json into the discovered entries."""
    with open(KNOWN_INSURERS_PATH) as f:
        known = json.load(f)

    seen = {(e["insurer_name"], e["state"]) for e in entries}
    added = 0

    for ins in known:
        states = ins.get("states_licensed", [])
        if states == ["ALL"]:
            states = US_STATES

        for state in states:
            if (ins["legal_name"], state) not in seen:
                seen.add((ins["legal_name"], state))
                entries.append({
                    "insurer_name": ins["legal_name"],
                    "trade_names": ins.get("trade_names"),
                    "state": state,
                    "mrf_url": ins.get("mrf_index_url"),
                    "index_type": ins.get("index_type"),
                    "date_pattern": ins.get("date_pattern"),
                    "cms_source": False,
                })
                added += 1
            else:
                # Update existing entries with our curated data
                for e in entries:
                    if e["insurer_name"] == ins["legal_name"] and e["state"] == state:
                        if not e.get("mrf_url") and ins.get("mrf_index_url"):
                            e["mrf_url"] = ins["mrf_index_url"]
                        if not e.get("index_type") and ins.get("index_type"):
                            e["index_type"] = ins["index_type"]
                        if not e.get("trade_names") and ins.get("trade_names"):
                            e["trade_names"] = ins["trade_names"]
                        break

    logger.info("Merged known_insurers.json: added %d state-level entries", added)
    return entries


# ──────────────────────────────────────────────────────────────────────
# MRF URL search heuristics
# ──────────────────────────────────────────────────────────────────────

def guess_mrf_urls(insurer_name: str) -> list[str]:
    """Generate plausible MRF URLs based on insurer name patterns.

    CMS requires every insurer to publish MRF files. Many use common patterns.
    """
    # Normalize name for URL construction
    slug = re.sub(r"[^a-z0-9]+", "-", insurer_name.lower()).strip("-")
    slug_underscore = slug.replace("-", "_")
    slug_no_sep = slug.replace("-", "")

    candidates = []

    # Common patterns insurers use:
    now = datetime.now()
    date_ymd = now.strftime("%Y-%m-%d")
    date_ym = now.strftime("%Y-%m")
    date_ym01 = now.strftime("%Y-%m-01")

    # Sapphire MRF Hub (used by many BCBS plans)
    candidates.append(f"https://{slug_no_sep}.sapphiremrfhub.com/tocs/current/{slug}")
    candidates.append(f"https://{slug}.sapphiremrfhub.com/tocs/current/{slug}")

    # Common self-hosted patterns
    candidates.append(f"https://mrf.{slug_no_sep}.com/")
    candidates.append(f"https://transparency.{slug_no_sep}.com/")
    candidates.append(f"https://www.{slug_no_sep}.com/machine-readable-files")

    return candidates


# ──────────────────────────────────────────────────────────────────────
# Main scout pipeline
# ──────────────────────────────────────────────────────────────────────

async def scout_states(
    states: list[str] | None = None,
    probe: bool = True,
    score: bool = True,
    export: bool = True,
    max_concurrent_probes: int = 20,
):
    """Run the full scout pipeline for specified states (or all 50+DC)."""
    target_states = states or US_STATES
    logger.info("Scout starting for %d states: %s", len(target_states), ", ".join(target_states))

    conn = await get_db_conn()

    # Ensure state-registry dir exists
    STATE_REGISTRY_DIR.mkdir(parents=True, exist_ok=True)

    connector = aiohttp.TCPConnector(limit=max_concurrent_probes, ssl=False)
    timeout = aiohttp.ClientTimeout(total=120)
    async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:

        # Phase 1: Discover insurers from CMS + known registry
        logger.info("Phase 1: Discovering insurers from CMS indexes...")
        entries = await fetch_cms_index(session)
        entries = await merge_known_insurers(entries)

        # Filter to target states
        entries = [e for e in entries if e.get("state") in target_states]
        logger.info("Total entries for target states: %d", len(entries))

        # Phase 2: For entries without MRF URLs, try heuristic search
        logger.info("Phase 2: Searching for MRF URLs for %d entries without URLs...",
                     sum(1 for e in entries if not e.get("mrf_url")))
        sem = asyncio.Semaphore(max_concurrent_probes)

        async def try_heuristic_urls(entry):
            if entry.get("mrf_url"):
                return
            candidates = guess_mrf_urls(entry["insurer_name"])
            async with sem:
                for url in candidates:
                    try:
                        async with session.head(
                            url, allow_redirects=True,
                            timeout=aiohttp.ClientTimeout(total=10),
                        ) as resp:
                            if resp.status == 200:
                                ct = resp.headers.get("Content-Type", "").lower()
                                if "json" in ct or "gzip" in ct or "octet" in ct:
                                    entry["mrf_url"] = url
                                    idx_type, date_pat = classify_index_type(url)
                                    entry["index_type"] = idx_type
                                    entry["date_pattern"] = date_pat
                                    logger.info("  Found MRF URL for %s: %s",
                                                entry["insurer_name"], url[:80])
                                    return
                    except Exception:
                        continue

        # Run heuristic searches in parallel
        tasks = [try_heuristic_urls(e) for e in entries if not e.get("mrf_url")]
        if tasks:
            await asyncio.gather(*tasks)
            found = sum(1 for e in entries if e.get("mrf_url"))
            logger.info("After heuristic search: %d/%d entries have MRF URLs", found, len(entries))

        # Phase 3: Probe all URLs
        if probe:
            logger.info("Phase 3: Probing %d URLs...",
                         sum(1 for e in entries if e.get("mrf_url")))

            async def probe_entry(entry):
                if not entry.get("mrf_url"):
                    entry["accessibility"] = "dead"
                    entry["notes"] = "No MRF URL found"
                    return
                # Classify index type if not already set
                if not entry.get("index_type"):
                    idx_type, date_pat = classify_index_type(entry["mrf_url"])
                    entry["index_type"] = idx_type
                    entry["date_pattern"] = date_pat
                # Skip probing for known browser_required types
                if entry.get("index_type") == "browser_required":
                    entry["accessibility"] = "browser_required"
                    entry["notes"] = "Known browser-required index type"
                    entry["last_probed_at"] = datetime.now(timezone.utc)
                    return
                async with sem:
                    probe_result = await probe_url(session, entry["mrf_url"])
                    entry.update(probe_result)

            await asyncio.gather(*[probe_entry(e) for e in entries])

            probed = sum(1 for e in entries if e.get("last_probed_at"))
            automatable = sum(1 for e in entries if e.get("accessibility") == "automatable")
            logger.info("Probing complete: %d probed, %d automatable", probed, automatable)

        # Phase 4: Score all entries
        if score:
            logger.info("Phase 4: Computing transparency scores...")
            for entry in entries:
                compute_scores(entry)

        # Phase 5: Upsert to database
        logger.info("Phase 5: Upserting %d entries to database...", len(entries))
        upserted = 0
        errors = 0
        for entry in entries:
            try:
                await upsert_research_entry(conn, entry)
                upserted += 1
            except Exception as e:
                errors += 1
                if errors <= 5:
                    logger.warning("DB upsert error for %s/%s: %s",
                                   entry.get("state"), entry.get("insurer_name"), e)

        logger.info("Database: %d upserted, %d errors", upserted, errors)

        # Phase 6: Export state registry JSON files
        if export:
            logger.info("Phase 6: Exporting state registry files...")
            export_state_registry(entries)

    # Print summary
    await print_summary(conn, target_states)
    await conn.close()


def export_state_registry(entries: list[dict]):
    """Write state-registry/{STATE}.json files from entries."""
    by_state: dict[str, list] = {}
    for e in entries:
        st = e.get("state", "")
        if st:
            by_state.setdefault(st, []).append(e)

    for state, state_entries in sorted(by_state.items()):
        out_path = STATE_REGISTRY_DIR / f"{state}.json"
        # Serialize datetime objects
        serializable = []
        for e in sorted(state_entries, key=lambda x: x.get("transparency_score") or 0, reverse=True):
            clean = {}
            for k, v in e.items():
                if isinstance(v, datetime):
                    clean[k] = v.isoformat()
                else:
                    clean[k] = v
            serializable.append(clean)

        with open(out_path, "w") as f:
            json.dump(serializable, f, indent=2, default=str)

    logger.info("Exported %d state registry files to %s", len(by_state), STATE_REGISTRY_DIR)


async def print_summary(conn, states: list[str]):
    """Print a summary of scout results."""
    total = await conn.fetchval(
        f"SELECT count(*) FROM {SCHEMA}.mrf_research WHERE state = ANY($1)", states
    )
    automatable = await conn.fetchval(
        f"SELECT count(*) FROM {SCHEMA}.mrf_research WHERE state = ANY($1) AND accessibility = 'automatable'",
        states,
    )
    browser = await conn.fetchval(
        f"SELECT count(*) FROM {SCHEMA}.mrf_research WHERE state = ANY($1) AND accessibility = 'browser_required'",
        states,
    )
    dead = await conn.fetchval(
        f"SELECT count(*) FROM {SCHEMA}.mrf_research WHERE state = ANY($1) AND accessibility = 'dead'",
        states,
    )
    unique_insurers = await conn.fetchval(
        f"SELECT count(DISTINCT insurer_name) FROM {SCHEMA}.mrf_research WHERE state = ANY($1)",
        states,
    )

    # Top 5 debt offenders
    debt_rows = await conn.fetch(f"""
        SELECT insurer_name, state, digital_debt_score, accessibility, notes
        FROM {SCHEMA}.mrf_research
        WHERE state = ANY($1) AND digital_debt_score IS NOT NULL
        ORDER BY digital_debt_score DESC LIMIT 10
    """, states)

    # Top 5 transparency leaders
    trans_rows = await conn.fetch(f"""
        SELECT insurer_name, state, transparency_score, index_type
        FROM {SCHEMA}.mrf_research
        WHERE state = ANY($1) AND transparency_score IS NOT NULL
        ORDER BY transparency_score DESC LIMIT 10
    """, states)

    print(f"""
{'=' * 70}
  SCOUT SUMMARY — {len(states)} states scanned
{'=' * 70}

  Total insurer-state entries:  {total}
  Unique insurers:              {unique_insurers}
  Automatable:                  {automatable} ({automatable * 100 // max(total, 1)}%)
  Browser-required:             {browser} ({browser * 100 // max(total, 1)}%)
  Dead/unreachable:             {dead} ({dead * 100 // max(total, 1)}%)
  Target for registry (700+):   {'REACHED' if unique_insurers >= 700 else f'{unique_insurers}/700'}

{'─' * 70}
  TOP 10 DIGITAL DEBT OFFENDERS
{'─' * 70}""")
    for i, r in enumerate(debt_rows, 1):
        print(f"  {i:2d}. {r['insurer_name'][:40]:40s} [{r['state']}] score={r['digital_debt_score']}")
        if r["notes"]:
            print(f"      {r['notes'][:70]}")

    print(f"""
{'─' * 70}
  TOP 10 TRANSPARENCY LEADERS
{'─' * 70}""")
    for i, r in enumerate(trans_rows, 1):
        idx = r["index_type"] or "unknown"
        print(f"  {i:2d}. {r['insurer_name'][:40]:40s} [{r['state']}] score={r['transparency_score']} ({idx})")

    print(f"\n{'=' * 70}")


# ──────────────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="50-State Insurer MRF Discovery Scout")
    parser.add_argument("--state", action="append",
                        help="Specific state(s) to scan (can repeat). Default: all 50+DC")
    parser.add_argument("--probe-only", action="store_true",
                        help="Re-probe existing entries without CMS discovery")
    parser.add_argument("--score-only", action="store_true",
                        help="Re-score existing entries without probing")
    parser.add_argument("--export", action="store_true",
                        help="Export state-registry/*.json from DB")
    parser.add_argument("--no-export", action="store_true",
                        help="Skip exporting state registry files")
    parser.add_argument("--concurrency", type=int, default=20,
                        help="Max concurrent HTTP probes (default: 20)")
    args = parser.parse_args()

    states = [s.upper() for s in args.state] if args.state else None

    asyncio.run(scout_states(
        states=states,
        probe=not args.score_only,
        score=not args.probe_only or args.score_only,
        export=not args.no_export,
        max_concurrent_probes=args.concurrency,
    ))


if __name__ == "__main__":
    main()
