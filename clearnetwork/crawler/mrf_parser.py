"""MRF In-Network File Parser — stream-parses massive MRF files to extract provider NPIs.

MRF in-network file structure (simplified):
{
  "in_network": [{
    "negotiation_arrangement": "ffs",
    "name": "...",
    "billing_code_type": "CPT",
    "billing_code": "99213",
    "negotiated_rates": [{
      "provider_references": [1, 2, 3],
      "negotiated_prices": [...]
    }]
  }],
  "provider_references": [{
    "provider_group_id": 1,
    "provider_groups": [{
      "npi": [1234567890, 1234567891],
      "tin": {"type": "ein", "value": "123456789"}
    }]
  }]
}
"""
import asyncio
import gzip
import io
import logging
import os
import uuid
import zipfile
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

logger = logging.getLogger(__name__)

SCHEMA = "clearnetwork"
BATCH_SIZE = 1000

try:
    import ijson
    HAS_IJSON = True
except ImportError:
    HAS_IJSON = False


def _extract_npis_from_stream(f, npis: set[str]):
    """Extract NPIs from a JSON file-like stream using ijson."""
    # Strategy 1: Look for provider_references[].provider_groups[].npi[]
    try:
        for npi in ijson.items(f, "provider_references.item.provider_groups.item.npi.item"):
            npis.add(str(npi).zfill(10))
    except Exception as e:
        logger.warning(f"Strategy 1 failed: {e}")

    # Strategy 2: Rewind and try in_network[].negotiated_rates[].provider_groups[]
    if not npis:
        try:
            f.seek(0)
        except Exception:
            return
        try:
            for item in ijson.items(f, "in_network.item"):
                for rate in item.get("negotiated_rates", []):
                    for group in rate.get("provider_groups", []):
                        for npi in group.get("npi", []):
                            npis.add(str(npi).zfill(10))
        except Exception as e:
            logger.warning(f"Strategy 2 failed: {e}")


async def extract_npis_from_file(file_path: Path) -> set[str]:
    """Extract all unique NPIs from an in-network MRF file using streaming.

    Handles: plain JSON, gzip-compressed JSON, and ZIP archives containing JSON.
    """
    npis = set()

    # Detect format by magic bytes
    with open(file_path, "rb") as check:
        magic = check.read(4)
    is_gzipped = magic[:2] == b"\x1f\x8b"
    is_zip = magic[:4] == b"PK\x03\x04"

    if is_zip:
        # ZIP archive (e.g. Kaiser in-network-rates.zip)
        try:
            with zipfile.ZipFile(file_path, "r") as zf:
                json_names = [n for n in zf.namelist() if n.endswith(".json")]
                if not json_names:
                    logger.warning(f"ZIP archive has no JSON files: {file_path}")
                    return npis
                logger.info(f"    ZIP contains {len(json_names)} JSON file(s)")
                for jname in json_names:
                    with zf.open(jname) as member:
                        if HAS_IJSON:
                            _extract_npis_from_stream(member, npis)
                        else:
                            import json
                            data = json.load(member)
                            for ref in data.get("provider_references", []):
                                for group in ref.get("provider_groups", []):
                                    for npi in group.get("npi", []):
                                        npis.add(str(npi).zfill(10))
        except zipfile.BadZipFile:
            logger.error(f"Bad ZIP file: {file_path}")
        return npis

    opener = gzip.open if is_gzipped else open

    # Detect malformed JSON (e.g. UPMC doubled double-quotes: "" instead of ")
    # Pattern: "value"","next_key":""next_value" — doubled quotes at field boundaries
    needs_sanitize = False
    with opener(file_path, "rb") as f:
        sample = f.read(512)
        if b'"","' in sample or b'":""' in sample:
            needs_sanitize = True

    if needs_sanitize:
        logger.info(f"    Sanitizing malformed JSON (doubled quotes): {file_path.name}")
        with opener(file_path, "rb") as f:
            raw = f.read()
        # Collapse all "" to " — fixes UPMC's doubled-quote encoding bug
        sanitized = raw.replace(b'""', b'"')
        stream = io.BytesIO(sanitized)
        if HAS_IJSON:
            _extract_npis_from_stream(stream, npis)
        else:
            import json
            try:
                data = json.load(stream)
            except Exception as e:
                logger.error(f"Failed to parse sanitized {file_path}: {e}")
                return npis
            for ref in data.get("provider_references", []):
                for group in ref.get("provider_groups", []):
                    for npi in group.get("npi", []):
                        npis.add(str(npi).zfill(10))
        return npis

    if HAS_IJSON:
        with opener(file_path, "rb") as f:
            _extract_npis_from_stream(f, npis)
    else:
        import json
        with opener(file_path, "rt") as f:
            try:
                data = json.load(f)
            except Exception as e:
                logger.error(f"Failed to parse {file_path}: {e}")
                return npis
            for ref in data.get("provider_references", []):
                for group in ref.get("provider_groups", []):
                    for npi in group.get("npi", []):
                        npis.add(str(npi).zfill(10))

    return npis


async def upsert_network_providers(
    conn: asyncpg.Connection,
    network_id: uuid.UUID,
    npis: set[str],
) -> int:
    """Match NPIs against canonical_providers and insert network_provider records."""
    if not npis:
        return 0

    # Batch-lookup canonical_provider_ids by NPI
    npi_list = list(npis)
    linked = 0

    for i in range(0, len(npi_list), BATCH_SIZE):
        batch = npi_list[i : i + BATCH_SIZE]

        # Find matching canonical providers
        rows = await conn.fetch(
            f"SELECT canonical_id, npi FROM {SCHEMA}.canonical_providers WHERE npi = ANY($1)",
            batch,
        )

        if not rows:
            continue

        # Batch upsert using unnest for performance
        provider_ids = [row["canonical_id"] for row in rows]
        network_ids = [network_id] * len(provider_ids)

        await conn.execute(
            f"""
            INSERT INTO {SCHEMA}.network_providers
                (network_id, canonical_provider_id, in_network, last_verified)
            SELECT unnest($1::uuid[]), unnest($2::uuid[]), TRUE, NOW()
            ON CONFLICT (network_id, canonical_provider_id)
            DO UPDATE SET in_network = TRUE, last_verified = NOW()
            """,
            network_ids, provider_ids,
        )
        linked += len(provider_ids)

    return linked
