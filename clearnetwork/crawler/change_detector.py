"""Network Change Detector — compares crawl snapshots to detect provider changes.

Usage: python -m crawler.change_detector --network-id=UUID
"""
import asyncio
import logging
import os
import uuid
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

logger = logging.getLogger(__name__)
SCHEMA = "clearnetwork"


async def take_snapshot(conn: asyncpg.Connection, network_id: uuid.UUID, crawl_job_id: uuid.UUID | None = None):
    """Save a snapshot of current network membership."""
    rows = await conn.fetch(
        f"SELECT canonical_provider_id FROM {SCHEMA}.network_providers "
        f"WHERE network_id = $1 AND in_network = TRUE",
        network_id,
    )
    provider_ids = [r["canonical_provider_id"] for r in rows]

    snapshot_id = uuid.uuid4()
    await conn.execute(
        f"""
        INSERT INTO {SCHEMA}.network_snapshots
            (id, network_id, crawl_job_id, provider_count, provider_ids)
        VALUES ($1, $2, $3, $4, $5)
        """,
        snapshot_id, network_id, crawl_job_id, len(provider_ids), provider_ids,
    )
    logger.info(f"Snapshot {snapshot_id}: {len(provider_ids):,} providers")
    return snapshot_id, set(provider_ids)


async def detect_changes(
    conn: asyncpg.Connection,
    network_id: uuid.UUID,
    crawl_job_id: uuid.UUID | None = None,
) -> dict:
    """Compare current network state against previous snapshot and record changes."""
    # Get previous snapshot
    prev = await conn.fetchrow(
        f"SELECT id, provider_ids FROM {SCHEMA}.network_snapshots "
        f"WHERE network_id = $1 ORDER BY snapshot_date DESC LIMIT 1",
        network_id,
    )

    # Take current snapshot
    current_snap_id, current_ids = await take_snapshot(conn, network_id, crawl_job_id)

    if not prev:
        logger.info("No previous snapshot — first crawl, no changes to detect")
        return {"added": 0, "removed": 0, "snapshot_id": current_snap_id}

    previous_ids = set(prev["provider_ids"]) if prev["provider_ids"] else set()

    added = current_ids - previous_ids
    removed = previous_ids - current_ids

    # Record changes
    for provider_id in added:
        await conn.execute(
            f"""
            INSERT INTO {SCHEMA}.network_changes
                (id, network_id, change_type, canonical_provider_id, new_value)
            VALUES ($1, $2, 'provider_added', $3, '{{}}'::jsonb)
            """,
            uuid.uuid4(), network_id, provider_id,
        )

    for provider_id in removed:
        await conn.execute(
            f"""
            INSERT INTO {SCHEMA}.network_changes
                (id, network_id, change_type, canonical_provider_id, old_value)
            VALUES ($1, $2, 'provider_removed', $3, '{{}}'::jsonb)
            """,
            uuid.uuid4(), network_id, provider_id,
        )

    result = {
        "added": len(added),
        "removed": len(removed),
        "previous_count": len(previous_ids),
        "current_count": len(current_ids),
        "snapshot_id": current_snap_id,
    }
    logger.info(
        f"Changes detected: +{len(added):,} added, -{len(removed):,} removed "
        f"({len(previous_ids):,} → {len(current_ids):,})"
    )
    return result


async def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--network-id", required=True, help="Network UUID")
    args = parser.parse_args()

    conn = await asyncpg.connect(
        host=os.environ.get("PGHOST", "localhost"),
        port=int(os.environ.get("PGPORT", "5432")),
        user=os.environ.get("PGUSER", "postgres"),
        password=os.environ.get("PGPASSWORD", ""),
        database=os.environ.get("PGDATABASE", "medicosts"),
    )

    result = await detect_changes(conn, uuid.UUID(args.network_id))
    print(f"Change detection result: {result}")
    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
