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
import logging
import os
import uuid
from pathlib import Path

import aiohttp
import asyncpg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

logger = logging.getLogger(__name__)

SCHEMA = "clearnetwork"

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


async def fetch_and_parse_index(url: str, session: aiohttp.ClientSession) -> MRFIndexResult:
    """Fetch and stream-parse an insurer MRF index file."""
    result = MRFIndexResult()

    try:
        async with session.get(url, allow_redirects=True, timeout=aiohttp.ClientTimeout(total=300)) as resp:
            resp.raise_for_status()

            # Read content (handle gzip)
            data = await resp.read()
            if url.endswith(".gz") or resp.headers.get("content-encoding") == "gzip":
                try:
                    data = gzip.decompress(data)
                except Exception:
                    pass  # might not actually be gzipped

            if HAS_IJSON:
                # Stream parse with ijson
                stream = io.BytesIO(data)

                # Extract entity info
                for prefix, event, value in ijson.parse(stream):
                    if prefix == "reporting_entity_name":
                        result.entity_name = value
                    elif prefix == "reporting_entity_type":
                        result.entity_type = value

                # Reset and extract in-network file URLs
                stream.seek(0)
                try:
                    for item in ijson.items(stream, "reporting_structure.item"):
                        # Extract plans
                        for plan in item.get("reporting_plans", []):
                            result.plans.append({
                                "plan_name": plan.get("plan_name", ""),
                                "plan_id": plan.get("plan_id", ""),
                                "plan_id_type": plan.get("plan_id_type", ""),
                                "plan_market_type": plan.get("plan_market_type", ""),
                            })

                        # Extract in-network file URLs
                        for f in item.get("in_network_files", []):
                            loc = f.get("location", "")
                            if loc:
                                result.in_network_urls.append(loc)
                except Exception as e:
                    result.errors.append(f"ijson parse error: {e}")
            else:
                # Regular json parse (higher memory)
                import json
                parsed = json.loads(data)
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

    except aiohttp.ClientError as e:
        result.errors.append(f"HTTP error fetching {url}: {e}")
    except Exception as e:
        result.errors.append(f"Error parsing {url}: {e}")

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
