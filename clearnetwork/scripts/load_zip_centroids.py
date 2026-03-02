"""Load ZIP code centroids from Census Bureau Gazetteer file.

Downloads the 2020 ZCTA Gazetteer if not cached, then loads ~33K ZIP centroids
into clearnetwork.zip_centroids for proximity queries.

Usage: python scripts/load_zip_centroids.py
"""
import asyncio
import csv
import io
import os
import sys
import zipfile
from pathlib import Path
from urllib.request import urlopen

import asyncpg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

GAZETTEER_URL = (
    "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2020_Gazetteer/"
    "2020_Gaz_zcta_national.zip"
)
CACHE_ZIP = Path(__file__).resolve().parents[2] / "data" / "2020_Gaz_zcta_national.zip"
CACHE_PATH = Path(__file__).resolve().parents[2] / "data" / "2020_Gaz_zcta_national.txt"
SCHEMA = "clearnetwork"
BATCH_SIZE = 5000


async def main():
    # Download and extract gazetteer if not cached
    if not CACHE_PATH.exists():
        if not CACHE_ZIP.exists():
            print(f"Downloading Census ZCTA Gazetteer...")
            with urlopen(GAZETTEER_URL) as resp:
                data = resp.read()
            CACHE_ZIP.write_bytes(data)
            print(f"  Downloaded {len(data):,} bytes")

        print(f"Extracting {CACHE_ZIP}...")
        with zipfile.ZipFile(CACHE_ZIP) as zf:
            # Find the txt file inside
            txt_names = [n for n in zf.namelist() if n.endswith(".txt")]
            if not txt_names:
                print("ERROR: No .txt file found in ZIP")
                sys.exit(1)
            with zf.open(txt_names[0]) as src, open(CACHE_PATH, "wb") as dst:
                dst.write(src.read())
        print(f"  Extracted to {CACHE_PATH}")
    else:
        print(f"Using cached Gazetteer at {CACHE_PATH}")

    # Parse the tab-delimited file
    # Columns: GEOID, ALAND, AWATER, ALAND_SQMI, AWATER_SQMI, INTPTLAT, INTPTLONG
    records = []
    with open(CACHE_PATH, "r") as f:
        reader = csv.reader(f, delimiter="\t")
        header = next(reader)
        # Find column indices
        geoid_idx = next(i for i, h in enumerate(header) if "GEOID" in h)
        lat_idx = next(i for i, h in enumerate(header) if "INTPTLAT" in h)
        lng_idx = next(i for i, h in enumerate(header) if "INTPTLONG" in h)

        for row in reader:
            if len(row) <= max(geoid_idx, lat_idx, lng_idx):
                continue
            zip_code = row[geoid_idx].strip()[:5]
            try:
                lat = float(row[lat_idx].strip())
                lng = float(row[lng_idx].strip())
            except (ValueError, IndexError):
                continue
            if len(zip_code) == 5:
                records.append((zip_code, lat, lng))

    print(f"Parsed {len(records):,} ZIP centroids")

    # Connect and load
    conn = await asyncpg.connect(
        host=os.environ.get("PGHOST", "localhost"),
        port=int(os.environ.get("PGPORT", "5432")),
        user=os.environ.get("PGUSER", "postgres"),
        password=os.environ.get("PGPASSWORD", ""),
        database=os.environ.get("PGDATABASE", "medicosts"),
    )

    # Clear existing data
    await conn.execute(f"TRUNCATE {SCHEMA}.zip_centroids")

    # Batch insert
    loaded = 0
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i : i + BATCH_SIZE]
        await conn.copy_records_to_table(
            "zip_centroids",
            records=batch,
            columns=["zip", "lat", "lng"],
            schema_name=SCHEMA,
        )
        loaded += len(batch)
        print(f"  Loaded {loaded:,}/{len(records):,} ZIPs", end="\r")

    print(f"\nDone. Loaded {loaded:,} ZIP centroids into {SCHEMA}.zip_centroids")

    count = await conn.fetchval(f"SELECT count(*) FROM {SCHEMA}.zip_centroids")
    print(f"Verification: {count:,} rows in table")

    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
