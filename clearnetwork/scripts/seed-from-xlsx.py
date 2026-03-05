"""Seed mrf_research from the US Health Insurance Issuers xlsx catalog.

Reads docs/US_Health_Insurance_Issuers_by_Coverage_Area.xlsx and seeds
clearnetwork.mrf_research with all known US health insurance issuers:
  - BCBS Affiliates (49 state entities)
  - Marketplace Issuers by State (with HIOS IDs)
  - SBE Issuers (state-based exchange plans)
  - Medicaid MCOs

Inserts carriers that CMS QHP data misses (regional BCBS, Medicaid MCOs).
Skips rows where (state, insurer_name) already exists — safe to re-run.

Usage:
    python seed-from-xlsx.py
    python seed-from-xlsx.py --xlsx /path/to/other.xlsx
    python seed-from-xlsx.py --dry-run
"""
import argparse
import asyncio
import json
import os
import re
from pathlib import Path

import asyncpg
import openpyxl
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

SCHEMA = "clearnetwork"
DEFAULT_XLSX = Path(__file__).resolve().parents[2] / "docs" / "US_Health_Insurance_Issuers_by_Coverage_Area.xlsx"

# State abbrev → full set of 2-letter codes.  Some xlsx cells say "MD, DC, Northern VA" etc.
STATE_ALIASES = {
    "Northern VA": "VA", "WNY": "NY", "Upstate NY": "NY", "NY Capital Region": "NY",
    "NY (downstate)": "NY", "SE Pennsylvania": "PA", "KC metro (MO/KS)": "MO",
    "PR": "PR",  # Puerto Rico — keep
}
VALID_STATES = set([
    "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN",
    "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH",
    "NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT",
    "VT","VA","WA","WV","WI","WY","PR",
])

# Known MRF URL patterns for parents we can inherit
PARENT_MRF_URLS = {
    "Elevance Health": (
        "https://antm-pt-prod-dataz-nogbd-nophi-us-east1.s3.amazonaws.com/anthem/{date}_anthem_index.json.gz",
        "dated_s3", "YYYY-MM-01",
    ),
    "HCSC": (
        "https://www.hcsc.com/gbd/transparency_in_coverage/machine_readable_toc.json",
        "direct_json", None,
    ),
    "Regence / Cambia": (
        None, "browser_required", None,
    ),
    "Highmark Health": (
        "https://mrfdata.hmhs.com/", "browser_required", None,
    ),
}


def parse_states(raw: str) -> list[str]:
    """Parse a coverage-states cell into a list of valid 2-letter state codes."""
    if not raw:
        return []
    states = []
    for part in re.split(r"[,;/]", str(raw)):
        part = part.strip()
        if not part:
            continue
        # Apply aliases
        resolved = STATE_ALIASES.get(part, part)
        if resolved in VALID_STATES:
            states.append(resolved)
        else:
            # Try to extract a 2-letter code from phrases like "8 states + DC"
            for token in part.split():
                if token in VALID_STATES:
                    states.append(token)
    return list(dict.fromkeys(states))  # dedupe, preserve order


def rows_to_dicts(ws) -> list[dict]:
    headers = [cell.value for cell in ws[1]]
    result = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        d = dict(zip(headers, row))
        if any(v for v in d.values()):
            result.append(d)
    return result


def build_bcbs_entries(ws) -> list[dict]:
    entries = []
    for d in rows_to_dicts(ws):
        name = d.get("BCBS Licensee Name", "").strip()
        if not name:
            continue
        states_raw = d.get("Coverage States", "")
        parent = d.get("Parent/Holding Company", "").strip() or "Independent"
        enroll = d.get("Approximate Enrollment", "")

        states = parse_states(states_raw)
        if not states:
            # Best-effort: skip entries with truly unparseable state lists
            continue

        trade_names = ["BCBS", "Blue Cross Blue Shield"]
        if parent not in ("Independent", ""):
            trade_names.append(parent)

        mrf_url, index_type, date_pattern = None, None, None
        for key, (url, itype, dpat) in PARENT_MRF_URLS.items():
            if key in (parent or ""):
                mrf_url, index_type, date_pattern = url, itype, dpat
                break

        for state in states:
            entries.append({
                "state": state,
                "insurer_name": name,
                "trade_names": trade_names,
                "mrf_url": mrf_url,
                "index_type": index_type,
                "date_pattern": date_pattern,
                "notes": f"BCBS affiliate | Parent: {parent} | Enrollment: {enroll}",
                "cms_source": False,
                "market_segment": "Individual,Group,MA",
            })
    return entries


def build_marketplace_entries(ws) -> list[dict]:
    entries = []
    for d in rows_to_dicts(ws):
        state = (d.get("State") or "").strip().upper()
        name = (d.get("Issuer Name") or "").strip()
        hios = str(d.get("HIOS Issuer ID") or "").strip()
        plan_types = (d.get("Plan Types Offered") or "").strip()
        notes_cell = (d.get("Notes") or "").strip()
        if not state or not name or state not in VALID_STATES:
            continue
        notes = f"HIOS: {hios}" if hios else ""
        if notes_cell:
            notes = (notes + " | " + notes_cell).lstrip(" | ")
        entries.append({
            "state": state,
            "insurer_name": name,
            "trade_names": [],
            "notes": notes,
            "cms_source": True,
            "market_segment": "Individual",
        })
    return entries


def build_sbe_entries(ws) -> list[dict]:
    entries = []
    for d in rows_to_dicts(ws):
        state = (d.get("State") or "").strip().upper()
        name = (d.get("Issuer Name") or "").strip()
        plan_types = (d.get("Plan Types") or "").strip()
        notes_cell = (d.get("Notes") or "").strip()
        if not state or not name or state not in VALID_STATES:
            continue
        entries.append({
            "state": state,
            "insurer_name": name,
            "trade_names": [],
            "notes": notes_cell or None,
            "cms_source": True,
            "market_segment": "SBE",
        })
    return entries


def build_medicaid_entries(ws) -> list[dict]:
    entries = []
    for d in rows_to_dicts(ws):
        state = (d.get("State") or "").strip().upper()
        name = (d.get("MCO Name") or "").strip()
        parent = (d.get("Parent Company") or "").strip()
        enroll = (d.get("Enrollment (Approx.)") or "").strip()
        if not state or not name or state not in VALID_STATES:
            continue
        notes = f"Medicaid MCO | Parent: {parent}"
        if enroll:
            notes += f" | ~{enroll} enrolled"
        entries.append({
            "state": state,
            "insurer_name": name,
            "trade_names": [parent] if parent and parent != "Independent (public)" else [],
            "notes": notes,
            "cms_source": False,
            "market_segment": "Medicaid",
        })
    return entries


async def seed(xlsx_path: Path, dry_run: bool):
    wb = openpyxl.load_workbook(str(xlsx_path), read_only=True)

    all_entries: list[dict] = []
    if "BCBS Affiliates" in wb.sheetnames:
        entries = build_bcbs_entries(wb["BCBS Affiliates"])
        print(f"BCBS Affiliates:         {len(entries)} entries")
        all_entries.extend(entries)
    if "Marketplace Issuers by State" in wb.sheetnames:
        entries = build_marketplace_entries(wb["Marketplace Issuers by State"])
        print(f"Marketplace Issuers:     {len(entries)} entries")
        all_entries.extend(entries)
    if "SBE Issuers" in wb.sheetnames:
        entries = build_sbe_entries(wb["SBE Issuers"])
        print(f"SBE Issuers:             {len(entries)} entries")
        all_entries.extend(entries)
    if "Medicaid MCOs" in wb.sheetnames:
        entries = build_medicaid_entries(wb["Medicaid MCOs"])
        print(f"Medicaid MCOs:           {len(entries)} entries")
        all_entries.extend(entries)

    wb.close()
    print(f"\nTotal entries to seed: {len(all_entries)}")

    if dry_run:
        print("\n[dry-run] Sample entries:")
        for e in all_entries[:5]:
            print(" ", json.dumps(e, default=str))
        return

    conn = await asyncpg.connect(
        host=os.environ.get("PGHOST", "localhost"),
        port=int(os.environ.get("PGPORT", "5432")),
        user=os.environ.get("PGUSER", "postgres"),
        password=os.environ.get("PGPASSWORD", ""),
        database=os.environ.get("PGDATABASE", "medicosts"),
    )

    inserted = skipped = errors = 0
    for e in all_entries:
        try:
            result = await conn.execute(f"""
                INSERT INTO {SCHEMA}.mrf_research (
                    id, state, insurer_name, trade_names,
                    mrf_url, index_type, date_pattern,
                    notes, cms_source, researched_at
                ) VALUES (
                    uuid_generate_v4(), $1, $2, $3,
                    $4, $5, $6,
                    $7, $8, NOW()
                )
                ON CONFLICT (state, insurer_name) DO NOTHING
            """,
                e["state"], e["insurer_name"],
                e.get("trade_names") or [],
                e.get("mrf_url"),
                e.get("index_type"),
                e.get("date_pattern"),
                e.get("notes"),
                e.get("cms_source", False),
            )
            if result == "INSERT 0 1":
                inserted += 1
            else:
                skipped += 1
        except Exception as ex:
            errors += 1
            if errors <= 3:
                print(f"  Error ({e['state']}/{e['insurer_name']}): {ex}")

    total = await conn.fetchval(f"SELECT count(*) FROM {SCHEMA}.mrf_research")
    unique = await conn.fetchval(f"SELECT count(DISTINCT insurer_name) FROM {SCHEMA}.mrf_research")
    states = await conn.fetchval(f"SELECT count(DISTINCT state) FROM {SCHEMA}.mrf_research")
    await conn.close()

    print(f"\nResults: inserted={inserted}, skipped={skipped}, errors={errors}")
    print(f"mrf_research totals: {total} rows | {unique} unique insurers | {states} states")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", default=str(DEFAULT_XLSX), help="Path to xlsx file")
    ap.add_argument("--dry-run", action="store_true", help="Print entries without inserting")
    args = ap.parse_args()

    xlsx_path = Path(args.xlsx)
    if not xlsx_path.exists():
        print(f"ERROR: xlsx not found: {xlsx_path}")
        return

    asyncio.run(seed(xlsx_path, args.dry_run))


if __name__ == "__main__":
    main()
