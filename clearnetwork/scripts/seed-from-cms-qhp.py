"""Seed mrf_research from CMS QHP Landscape PY2026 data.

Downloads the CMS QHP Individual Market Medical landscape file and extracts
all unique insurer-state pairs, then upserts them into clearnetwork.mrf_research.

This gives us every marketplace insurer in every FFM state — the canonical
source for who should be publishing MRF files.

Usage:
    python seed-from-cms-qhp.py
"""
import asyncio
import csv
import json
import os
import sys
import tempfile
import zipfile
from io import BytesIO
from pathlib import Path

import aiohttp
import asyncpg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

SCHEMA = "clearnetwork"

# CMS QHP Landscape PY2026 — canonical list of all marketplace insurers
QHP_URL = "https://data.healthcare.gov/datafile/py2026/individual_market_medical.zip"
# CMS Issuer Partner Lookup — additional issuers with state info
ISSUER_PARTNER_URL = "https://data.healthcare.gov/sites/default/files/uploaded_resources/251230_Issuer_Partner_Lookup.csv"


async def get_db_conn():
    return await asyncpg.connect(
        host=os.environ.get("PGHOST", "localhost"),
        port=int(os.environ.get("PGPORT", "5432")),
        user=os.environ.get("PGUSER", "postgres"),
        password=os.environ.get("PGPASSWORD", ""),
        database=os.environ.get("PGDATABASE", "medicosts"),
    )


async def download_qhp_issuers() -> list[dict]:
    """Download and parse the CMS QHP landscape to extract insurer-state pairs."""
    entries = []
    print("Downloading CMS QHP Landscape PY2026...")

    async with aiohttp.ClientSession() as session:
        # Download QHP Landscape
        async with session.get(QHP_URL, timeout=aiohttp.ClientTimeout(total=120)) as resp:
            if resp.status != 200:
                print(f"  QHP download failed: {resp.status}")
                return entries
            data = await resp.read()

        print(f"  Downloaded {len(data):,} bytes")

        # Extract ZIP
        with zipfile.ZipFile(BytesIO(data)) as zf:
            xlsx_name = [n for n in zf.namelist() if n.endswith('.xlsx')][0]
            zf.extract(xlsx_name, '/tmp')
            xlsx_path = f'/tmp/{xlsx_name}'

        # Parse XLSX
        try:
            import openpyxl
        except ImportError:
            print("  ERROR: openpyxl required — pip install openpyxl")
            return entries

        print(f"  Parsing {xlsx_path}...")
        wb = openpyxl.load_workbook(xlsx_path, read_only=True)
        ws = wb.active
        rows_iter = ws.iter_rows(min_row=2, values_only=True)
        headers = list(next(rows_iter))

        seen = set()
        for row in rows_iter:
            d = dict(zip(headers, row))
            state = d.get('State Code')
            issuer = d.get('Issuer Name')
            hios_id = str(d.get('HIOS Issuer ID', ''))
            if state and issuer and (state, issuer) not in seen:
                seen.add((state, issuer))
                entries.append({
                    'state': state,
                    'insurer_name': issuer,
                    'hios_id': hios_id,
                    'cms_source': True,
                })

        wb.close()
        print(f"  Found {len(entries)} unique insurer-state pairs from QHP landscape")

        # Also fetch Issuer Partner Lookup
        print("  Downloading CMS Issuer Partner Lookup...")
        async with session.get(ISSUER_PARTNER_URL, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            if resp.status == 200:
                text = await resp.text()
                reader = csv.DictReader(text.strip().lstrip('\ufeff').splitlines())
                added = 0
                for row in reader:
                    ptype = row.get('Partner Type', '')
                    name = row.get('Partner Name', '').strip()
                    states_str = row.get('States', '')
                    if 'issuer' not in ptype.lower() or not name:
                        continue
                    states = [s.strip() for s in states_str.split(',') if s.strip()]
                    for st in states:
                        if len(st) == 2 and (st, name) not in seen:
                            seen.add((st, name))
                            entries.append({
                                'state': st,
                                'insurer_name': name,
                                'cms_source': True,
                            })
                            added += 1
                print(f"  Added {added} additional entries from Issuer Partner Lookup")

    return entries


async def main():
    entries = await download_qhp_issuers()
    if not entries:
        print("No entries found — exiting")
        return

    conn = await get_db_conn()

    # Upsert all entries into mrf_research
    print(f"\nUpserting {len(entries)} entries into clearnetwork.mrf_research...")
    upserted = 0
    errors = 0
    for e in entries:
        try:
            await conn.execute(f"""
                INSERT INTO {SCHEMA}.mrf_research (
                    id, state, insurer_name, cms_source, researched_at
                ) VALUES (uuid_generate_v4(), $1, $2, $3, NOW())
                ON CONFLICT (state, insurer_name) DO UPDATE SET
                    cms_source = EXCLUDED.cms_source
            """, e['state'], e['insurer_name'], e.get('cms_source', True))
            upserted += 1
        except Exception as ex:
            errors += 1
            if errors <= 3:
                print(f"  Error for {e['state']}/{e['insurer_name']}: {ex}")

    # Summary
    total = await conn.fetchval(f"SELECT count(*) FROM {SCHEMA}.mrf_research")
    unique = await conn.fetchval(f"SELECT count(DISTINCT insurer_name) FROM {SCHEMA}.mrf_research")
    states = await conn.fetchval(f"SELECT count(DISTINCT state) FROM {SCHEMA}.mrf_research")

    print(f"\nResults:")
    print(f"  Upserted: {upserted}, Errors: {errors}")
    print(f"  Total mrf_research entries: {total}")
    print(f"  Unique insurer names:       {unique}")
    print(f"  States covered:             {states}")
    print(f"  Target (700+):              {'REACHED' if unique >= 700 else f'{unique}/700'}")

    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
