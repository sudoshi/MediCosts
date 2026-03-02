"""Backfill lat/lng on canonical_providers using ZIP centroid approximation.

Usage: python scripts/geocode_providers.py
"""
import asyncio
import os
import time
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

SCHEMA = "clearnetwork"
BATCH_SIZE = 50000


async def main():
    conn = await asyncpg.connect(
        host=os.environ.get("PGHOST", "localhost"),
        port=int(os.environ.get("PGPORT", "5432")),
        user=os.environ.get("PGUSER", "postgres"),
        password=os.environ.get("PGPASSWORD", ""),
        database=os.environ.get("PGDATABASE", "medicosts"),
    )

    # Check how many need geocoding
    total_null = await conn.fetchval(
        f"SELECT count(*) FROM {SCHEMA}.canonical_providers WHERE lat IS NULL AND address_zip IS NOT NULL"
    )
    total_zips = await conn.fetchval(f"SELECT count(*) FROM {SCHEMA}.zip_centroids")

    print(f"Providers needing geocoding: {total_null:,}")
    print(f"ZIP centroids available: {total_zips:,}")

    if total_null == 0:
        print("Nothing to geocode.")
        await conn.close()
        return

    start = time.time()

    # Batch update using ZIP centroid join
    # Process in chunks to avoid long-running transactions
    updated_total = 0
    while True:
        result = await conn.execute(f"""
            UPDATE {SCHEMA}.canonical_providers p
            SET lat = z.lat, lng = z.lng
            FROM {SCHEMA}.zip_centroids z
            WHERE p.address_zip = z.zip
              AND p.lat IS NULL
              AND p.canonical_id IN (
                SELECT canonical_id FROM {SCHEMA}.canonical_providers
                WHERE lat IS NULL AND address_zip IS NOT NULL
                LIMIT {BATCH_SIZE}
              )
        """)
        count = int(result.split()[-1])
        if count == 0:
            break
        updated_total += count
        elapsed = time.time() - start
        print(f"  Updated {updated_total:,} providers ({elapsed:.0f}s)", end="\r")

    elapsed = time.time() - start
    print(f"\n\nDone in {elapsed:.0f}s")
    print(f"  Geocoded: {updated_total:,} providers")

    # Check remaining nulls
    remaining = await conn.fetchval(
        f"SELECT count(*) FROM {SCHEMA}.canonical_providers WHERE lat IS NULL"
    )
    geocoded = await conn.fetchval(
        f"SELECT count(*) FROM {SCHEMA}.canonical_providers WHERE lat IS NOT NULL"
    )
    print(f"  With coordinates: {geocoded:,}")
    print(f"  Still missing:    {remaining:,} (no matching ZIP centroid)")

    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
