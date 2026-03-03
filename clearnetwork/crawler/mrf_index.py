"""MRF Index Parser — parses insurer index.json files to discover in-network file URLs.

CMS Transparency in Coverage format:
{
  "reporting_entity_name": "...",
  "reporting_entity_type": "health insurance issuer",
  "reporting_structure": [{
    "reporting_plans": [{"plan_name": "...", "plan_id": "...", "plan_id_type": "EIN", ...}],
    "in_network_files": [{"description": "...", "location": "https://..."}],
    "allowed_amount_file": {"description": "...", "location": "https://..."}
  }]
}
"""
import asyncio
import gzip
import io
import json as json_mod
import logging
import os
import tempfile
import uuid
from pathlib import Path

import aiohttp
import asyncpg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

logger = logging.getLogger(__name__)

SCHEMA = "clearnetwork"
MRF_CACHE_DIR = Path(__file__).resolve().parents[2] / "data" / "mrf_cache"

# Threshold for switching to streaming download (100 MB)
STREAMING_THRESHOLD = 100 * 1024 * 1024

# Try to import ijson for streaming; fall back to regular json
try:
    import ijson
    HAS_IJSON = True
except ImportError:
    import json
    HAS_IJSON = False
    logger.warning("ijson not available; falling back to json (may use more memory)")


class MRFIndexResult:
    def __init__(self):
        self.entity_name: str | None = None
        self.entity_type: str | None = None
        self.plans: list[dict] = []
        self.in_network_urls: list[str] = []
        self.errors: list[str] = []


def _parse_index_from_stream(stream, result: MRFIndexResult):
    """Parse a CMS MRF index from a file-like stream using ijson (single pass)."""
    try:
        for prefix, event, value in ijson.parse(stream):
            if prefix == "reporting_entity_name":
                result.entity_name = value
            elif prefix == "reporting_entity_type":
                result.entity_type = value
            elif prefix.endswith(".location") and "in_network_files" in prefix:
                if value:
                    result.in_network_urls.append(value)
            elif prefix.endswith(".plan_name") and "reporting_plans" in prefix:
                result.plans.append({"plan_name": value, "plan_id": "", "plan_id_type": "", "plan_market_type": ""})
    except Exception as e:
        result.errors.append(f"ijson parse error: {e}")


def _parse_index_from_bytes(data: bytes, result: MRFIndexResult):
    """Parse a CMS MRF index from bytes using regular json."""
    parsed = json_mod.loads(data)
    result.entity_name = parsed.get("reporting_entity_name")
    result.entity_type = parsed.get("reporting_entity_type")

    for structure in parsed.get("reporting_structure", []):
        for plan in structure.get("reporting_plans", []):
            result.plans.append({
                "plan_name": plan.get("plan_name", ""),
                "plan_id": plan.get("plan_id", ""),
                "plan_id_type": plan.get("plan_id_type", ""),
                "plan_market_type": plan.get("plan_market_type", ""),
            })
        for f in structure.get("in_network_files", []):
            loc = f.get("location", "")
            if loc:
                result.in_network_urls.append(loc)


async def fetch_and_parse_index(url: str, session: aiohttp.ClientSession) -> MRFIndexResult:
    """Fetch and stream-parse an insurer MRF index file.

    For small indexes (< 100MB): buffers in memory (fast).
    For large indexes (>= 100MB, e.g. Anthem 10GB): streams to disk,
    then uses gzip.open() + ijson for near-zero memory parsing.
    """
    result = MRFIndexResult()

    try:
        timeout = aiohttp.ClientTimeout(total=7200)  # 2 hours for large indexes
        async with session.get(url, allow_redirects=True, timeout=timeout) as resp:
            resp.raise_for_status()

            content_length = int(resp.headers.get("content-length", 0))
            is_gzipped = url.endswith(".gz") or resp.headers.get("content-encoding") == "gzip"

            if content_length > STREAMING_THRESHOLD:
                # ---- STREAMING PATH (large files like Anthem 10GB) ----
                logger.info(f"    Large index ({content_length / 1e9:.1f} GB) — streaming to disk...")
                MRF_CACHE_DIR.mkdir(parents=True, exist_ok=True)
                tmp_path = MRF_CACHE_DIR / f"index_{uuid.uuid4().hex}.tmp"

                try:
                    downloaded = 0
                    with open(tmp_path, "wb") as f:
                        async for chunk in resp.content.iter_chunked(1_048_576):  # 1MB chunks
                            f.write(chunk)
                            downloaded += len(chunk)
                            if downloaded % (500 * 1_048_576) == 0:  # Log every 500MB
                                logger.info(f"    Downloaded {downloaded / 1e9:.1f} GB...")

                    logger.info(f"    Download complete ({downloaded / 1e9:.1f} GB). Parsing...")

                    if HAS_IJSON:
                        opener = gzip.open if is_gzipped else open
                        with opener(tmp_path, "rb") as f:
                            _parse_index_from_stream(f, result)
                    else:
                        opener = gzip.open if is_gzipped else open
                        with opener(tmp_path, "rb") as f:
                            data = f.read()
                        _parse_index_from_bytes(data, result)
                finally:
                    tmp_path.unlink(missing_ok=True)
            else:
                # ---- IN-MEMORY PATH (small indexes, fast) ----
                data = await resp.read()
                if is_gzipped:
                    try:
                        data = gzip.decompress(data)
                    except Exception:
                        pass

                if HAS_IJSON:
                    stream = io.BytesIO(data)
                    _parse_index_from_stream(stream, result)
                else:
                    _parse_index_from_bytes(data, result)

    except aiohttp.ClientError as e:
        result.errors.append(f"HTTP error fetching {url}: {e}")
    except Exception as e:
        result.errors.append(f"Error parsing {url}: {e}")

    return result


async def fetch_uhc_blob_index(url: str, session: aiohttp.ClientSession, max_indexes: int = 20) -> MRFIndexResult:
    """Fetch UnitedHealthcare's blob API and parse index files for in-network URLs.

    UHC's blob API returns all ~85K blobs in a single JSON response. Each blob is an
    individual employer's index file with a direct Azure SAS download URL.

    We pick a sample of the largest index files and parse each for in-network file URLs.
    """
    result = MRFIndexResult()
    result.entity_name = "UnitedHealthcare"
    result.entity_type = "health insurance issuer"

    try:
        logger.info(f"    Fetching UHC blob listing from {url[:60]}...")
        timeout = aiohttp.ClientTimeout(total=300)
        async with session.get(url, allow_redirects=True, timeout=timeout) as resp:
            resp.raise_for_status()
            data = await resp.json(content_type=None)

        blobs = data.get("blobs", [])
        logger.info(f"    UHC blob API returned {len(blobs):,} blobs")

        # Filter to index files only (skip allowed-amounts and in-network-rates raw files)
        index_blobs = [b for b in blobs if b.get("name", "").endswith("_index.json")]
        logger.info(f"    Found {len(index_blobs):,} index files")

        # Sort by size descending — larger indexes tend to cover more plans/providers
        index_blobs.sort(key=lambda b: b.get("size", 0), reverse=True)

        # Pick a sample of the largest indexes to parse
        sample = index_blobs[:max_indexes]
        logger.info(f"    Parsing top {len(sample)} index files by size...")

        for idx, blob in enumerate(sample, 1):
            blob_url = blob.get("downloadUrl", "")
            blob_name = blob.get("name", "unknown")
            if not blob_url:
                continue

            try:
                logger.info(f"    [{idx}/{len(sample)}] Parsing sub-index: {blob_name[:80]}...")
                sub_result = await fetch_and_parse_index(blob_url, session)

                # Merge plans and in-network URLs into main result
                result.plans.extend(sub_result.plans)
                result.in_network_urls.extend(sub_result.in_network_urls)
                if sub_result.errors:
                    result.errors.extend(sub_result.errors)

            except Exception as e:
                result.errors.append(f"Error parsing UHC sub-index {blob_name}: {e}")

        # Deduplicate in-network URLs (many employer indexes share the same files)
        unique_urls = list(dict.fromkeys(result.in_network_urls))
        logger.info(
            f"    UHC totals: {len(result.plans)} plans, "
            f"{len(result.in_network_urls)} URLs ({len(unique_urls)} unique)"
        )
        result.in_network_urls = unique_urls

    except aiohttp.ClientError as e:
        result.errors.append(f"HTTP error fetching UHC blob API: {e}")
    except Exception as e:
        result.errors.append(f"Error processing UHC blob API: {e}")

    return result


async def store_index_results(
    conn: asyncpg.Connection,
    insurer_id: uuid.UUID,
    result: MRFIndexResult,
):
    """Store parsed MRF index data into plans and networks tables."""
    # Create a network for this insurer
    network_id = uuid.uuid4()
    await conn.execute(
        f"""
        INSERT INTO {SCHEMA}.networks (id, network_name, insurer_id, mrf_source_url, provider_count)
        VALUES ($1, $2, $3, $4, 0)
        ON CONFLICT DO NOTHING
        """,
        network_id,
        f"{result.entity_name} Network" if result.entity_name else "Unknown Network",
        insurer_id,
        result.in_network_urls[0] if result.in_network_urls else None,
    )

    # Store plans
    plans_inserted = 0
    seen_plan_names = set()
    for plan_data in result.plans:
        plan_name = plan_data.get("plan_name", "").strip()
        if not plan_name or plan_name in seen_plan_names:
            continue
        seen_plan_names.add(plan_name)

        await conn.execute(
            f"""
            INSERT INTO {SCHEMA}.plans (id, insurer_id, plan_id_cms, plan_name, network_id)
            VALUES ($1, $2, $3, $4, $5)
            """,
            uuid.uuid4(),
            insurer_id,
            plan_data.get("plan_id"),
            plan_name,
            network_id,
        )
        plans_inserted += 1

    return network_id, plans_inserted, len(result.in_network_urls)
