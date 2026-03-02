"""Insurer Registry Builder — seeds and discovers insurer MRF index URLs.

Usage: python -m crawler.discovery
"""
import asyncio
import json
import os
import uuid
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

SCHEMA = "clearnetwork"
KNOWN_INSURERS_PATH = Path(__file__).parent / "known_insurers.json"


async def seed_known_insurers(conn: asyncpg.Connection):
    """Load curated insurer list from known_insurers.json."""
    with open(KNOWN_INSURERS_PATH) as f:
        insurers = json.load(f)

    inserted = 0
    updated = 0

    for ins in insurers:
        # Check if insurer already exists by name
        existing = await conn.fetchrow(
            f"SELECT id FROM {SCHEMA}.insurers WHERE legal_name = $1",
            ins["legal_name"],
        )

        if existing:
            await conn.execute(
                f"""
                UPDATE {SCHEMA}.insurers SET
                    trade_names = $1, naic_code = $2, states_licensed = $3,
                    plan_types = $4, mrf_index_url = $5
                WHERE legal_name = $6
                """,
                ins.get("trade_names"),
                ins.get("naic_code"),
                ins.get("states_licensed"),
                ins.get("plan_types"),
                ins.get("mrf_index_url"),
                ins["legal_name"],
            )
            updated += 1
        else:
            await conn.execute(
                f"""
                INSERT INTO {SCHEMA}.insurers
                    (id, legal_name, trade_names, naic_code, states_licensed, plan_types, mrf_index_url)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                """,
                uuid.uuid4(),
                ins["legal_name"],
                ins.get("trade_names"),
                ins.get("naic_code"),
                ins.get("states_licensed"),
                ins.get("plan_types"),
                ins.get("mrf_index_url"),
            )
            inserted += 1

    return inserted, updated


async def main():
    conn = await asyncpg.connect(
        host=os.environ.get("PGHOST", "localhost"),
        port=int(os.environ.get("PGPORT", "5432")),
        user=os.environ.get("PGUSER", "postgres"),
        password=os.environ.get("PGPASSWORD", ""),
        database=os.environ.get("PGDATABASE", "medicosts"),
    )

    print("Seeding known insurers...")
    inserted, updated = await seed_known_insurers(conn)
    print(f"  Inserted: {inserted}, Updated: {updated}")

    count = await conn.fetchval(f"SELECT count(*) FROM {SCHEMA}.insurers")
    print(f"  Total insurers in registry: {count}")

    # Show all insurers
    rows = await conn.fetch(
        f"SELECT legal_name, naic_code, mrf_index_url IS NOT NULL AS has_mrf "
        f"FROM {SCHEMA}.insurers ORDER BY legal_name"
    )
    for r in rows:
        mrf = "MRF" if r["has_mrf"] else "   "
        print(f"    [{mrf}] {r['legal_name']} (NAIC: {r['naic_code']})")

    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
