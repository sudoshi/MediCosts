"""Nightly Crawl Report Generator — produces structured reports + optional email.

Reads from clearnetwork.crawl_stats, mrf_research, crawl_jobs, crawl_failures
to generate a comprehensive nightly report.

Usage:
    python nightly-report.py                # Print to stdout
    python nightly-report.py --email        # Also send via Resend
    python nightly-report.py --json         # Output as JSON
"""
import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

SCHEMA = "clearnetwork"


async def get_db_conn():
    return await asyncpg.connect(
        host=os.environ.get("PGHOST", "localhost"),
        port=int(os.environ.get("PGPORT", "5432")),
        user=os.environ.get("PGUSER", "postgres"),
        password=os.environ.get("PGPASSWORD", ""),
        database=os.environ.get("PGDATABASE", "medicosts"),
    )


async def generate_report(conn) -> dict:
    """Generate the nightly report data structure."""
    now = datetime.now(timezone.utc)
    yesterday = now - timedelta(hours=24)

    # Latest crawl stats
    latest = await conn.fetchrow(
        f"SELECT * FROM {SCHEMA}.crawl_stats ORDER BY recorded_at DESC LIMIT 1"
    )

    # Previous day stats (for delta)
    previous = await conn.fetchrow(f"""
        SELECT * FROM {SCHEMA}.crawl_stats
        WHERE recorded_at < $1
        ORDER BY recorded_at DESC LIMIT 1
    """, yesterday)

    # Coverage summary from mrf_research
    coverage = await conn.fetchrow(f"""
        SELECT
            count(*) AS total_entries,
            count(DISTINCT insurer_name) AS unique_insurers,
            count(DISTINCT state) AS states_covered,
            count(*) FILTER (WHERE accessibility = 'automatable') AS automatable,
            count(*) FILTER (WHERE accessibility = 'browser_required') AS browser_required,
            count(*) FILTER (WHERE accessibility = 'dead') AS dead,
            count(*) FILTER (WHERE accessibility = 'auth_required') AS auth_required,
            count(*) FILTER (WHERE accessibility IS NULL OR accessibility = 'unknown') AS unknown,
            count(*) FILTER (WHERE crawl_tested AND crawl_result = 'success') AS crawl_success,
            count(*) FILTER (WHERE added_to_registry) AS in_registry,
            avg(transparency_score) FILTER (WHERE transparency_score IS NOT NULL) AS avg_transparency,
            avg(digital_debt_score) FILTER (WHERE digital_debt_score IS NOT NULL) AS avg_debt
        FROM {SCHEMA}.mrf_research
    """)

    # State coverage breakdown
    state_coverage = await conn.fetch(f"""
        SELECT state,
               count(*) AS total,
               count(*) FILTER (WHERE accessibility = 'automatable') AS automatable,
               count(*) FILTER (WHERE crawl_tested AND crawl_result = 'success') AS crawled
        FROM {SCHEMA}.mrf_research
        GROUP BY state ORDER BY state
    """)

    # Top 10 digital debt offenders
    debt_offenders = await conn.fetch(f"""
        SELECT DISTINCT ON (insurer_name)
            insurer_name, state, digital_debt_score, accessibility, notes
        FROM {SCHEMA}.mrf_research
        WHERE digital_debt_score IS NOT NULL
        ORDER BY insurer_name, digital_debt_score DESC
    """)
    # Re-sort by score descending, take top 10
    debt_offenders = sorted(debt_offenders, key=lambda r: r["digital_debt_score"], reverse=True)[:10]

    # Top 10 transparency leaders
    transparency_leaders = await conn.fetch(f"""
        SELECT DISTINCT ON (insurer_name)
            insurer_name, state, transparency_score, index_type
        FROM {SCHEMA}.mrf_research
        WHERE transparency_score IS NOT NULL
        ORDER BY insurer_name, transparency_score DESC
    """)
    transparency_leaders = sorted(transparency_leaders, key=lambda r: r["transparency_score"], reverse=True)[:10]

    # Recent failures (last 24h)
    failures = await conn.fetch(f"""
        SELECT cf.url, cf.error_message, cf.retry_count,
               i.legal_name AS insurer_name
        FROM {SCHEMA}.crawl_failures cf
        JOIN {SCHEMA}.crawl_jobs cj ON cf.crawl_job_id = cj.id
        JOIN {SCHEMA}.insurers i ON cj.insurer_id = i.id
        WHERE cf.last_attempt > $1
        ORDER BY cf.last_attempt DESC
        LIMIT 20
    """, yesterday)

    # Recent crawl jobs (last 24h)
    recent_jobs = await conn.fetch(f"""
        SELECT cj.status, count(*) AS cnt,
               sum(cj.files_processed) AS files,
               sum(cj.providers_found) AS providers
        FROM {SCHEMA}.crawl_jobs cj
        WHERE cj.started_at > $1
        GROUP BY cj.status
    """, yesterday)

    # New insurers discovered today
    new_today = await conn.fetchval(f"""
        SELECT count(*) FROM {SCHEMA}.mrf_research
        WHERE researched_at > $1
    """, yesterday)

    return {
        "generated_at": now.isoformat(),
        "coverage": {
            "total_entries": coverage["total_entries"],
            "unique_insurers": coverage["unique_insurers"],
            "target_700": coverage["unique_insurers"] >= 700,
            "states_covered": coverage["states_covered"],
            "automatable": coverage["automatable"],
            "browser_required": coverage["browser_required"],
            "dead": coverage["dead"],
            "auth_required": coverage["auth_required"],
            "unknown": coverage["unknown"],
            "crawl_success": coverage["crawl_success"],
            "in_registry": coverage["in_registry"],
            "avg_transparency": round(float(coverage["avg_transparency"] or 0), 1),
            "avg_debt": round(float(coverage["avg_debt"] or 0), 1),
        },
        "latest_crawl": {
            "insurers_attempted": latest["crawl_insurers_attempted"] if latest else 0,
            "insurers_succeeded": latest["crawl_insurers_succeeded"] if latest else 0,
            "insurers_failed": latest["crawl_insurers_failed"] if latest else 0,
            "files_downloaded": latest["crawl_files_downloaded"] if latest else 0,
            "providers_linked": latest["crawl_providers_linked"] if latest else 0,
            "errors": latest["crawl_errors"] if latest else 0,
            "duration_s": latest["crawl_elapsed_seconds"] if latest else 0,
        } if latest else None,
        "deltas": {
            "new_insurers_today": new_today,
            "providers_delta": (
                (latest["total_providers"] - previous["total_providers"])
                if latest and previous else None
            ),
            "networks_delta": (
                (latest["total_networks"] - previous["total_networks"])
                if latest and previous else None
            ),
        },
        "state_coverage": [
            {"state": r["state"], "total": r["total"], "automatable": r["automatable"], "crawled": r["crawled"]}
            for r in state_coverage
        ],
        "debt_offenders": [
            {"name": r["insurer_name"], "state": r["state"], "score": r["digital_debt_score"],
             "accessibility": r["accessibility"], "notes": r["notes"]}
            for r in debt_offenders
        ],
        "transparency_leaders": [
            {"name": r["insurer_name"], "state": r["state"], "score": r["transparency_score"],
             "index_type": r["index_type"]}
            for r in transparency_leaders
        ],
        "recent_failures": [
            {"insurer": r["insurer_name"], "url": r["url"][:80], "error": r["error_message"][:100],
             "retries": r["retry_count"]}
            for r in failures
        ],
        "recent_jobs": [
            {"status": r["status"], "count": r["cnt"], "files": r["files"], "providers": r["providers"]}
            for r in recent_jobs
        ],
    }


def format_text_report(report: dict) -> str:
    """Format report as human-readable text."""
    c = report["coverage"]
    lc = report.get("latest_crawl") or {}
    d = report.get("deltas", {})

    lines = []
    lines.append(f"=== ClearNetwork Nightly Report — {report['generated_at'][:10]} ===")
    lines.append("")
    lines.append("COVERAGE SUMMARY")
    lines.append(f"  Total insurer-state entries:  {c['total_entries']}")
    lines.append(f"  Unique insurers discovered:   {c['unique_insurers']}")
    lines.append(f"  Target (700+):                {'REACHED' if c['target_700'] else f'{c[\"unique_insurers\"]}/700'}")
    lines.append(f"  States covered:               {c['states_covered']}/51")
    lines.append(f"  Automatable:                  {c['automatable']} ({c['automatable'] * 100 // max(c['total_entries'], 1)}%)")
    lines.append(f"  Browser-required:             {c['browser_required']} ({c['browser_required'] * 100 // max(c['total_entries'], 1)}%)")
    lines.append(f"  Dead/unreachable:             {c['dead']}")
    lines.append(f"  Successfully crawled:         {c['crawl_success']}")
    lines.append(f"  Avg transparency score:       {c['avg_transparency']}")
    lines.append(f"  Avg digital debt score:       {c['avg_debt']}")

    if lc:
        lines.append("")
        lines.append("TONIGHT'S CRAWL")
        lines.append(f"  Insurers attempted:  {lc.get('insurers_attempted', 0)}")
        lines.append(f"  Insurers succeeded:  {lc.get('insurers_succeeded', 0)}")
        lines.append(f"  Insurers failed:     {lc.get('insurers_failed', 0)}")
        lines.append(f"  Files downloaded:    {lc.get('files_downloaded', 0)}")
        lines.append(f"  Providers linked:    {lc.get('providers_linked', 0):,}")
        lines.append(f"  Errors:              {lc.get('errors', 0)}")
        lines.append(f"  Duration:            {lc.get('duration_s', 0)}s")

    if d.get("new_insurers_today"):
        lines.append(f"  New insurers today:  {d['new_insurers_today']}")
    if d.get("providers_delta") is not None:
        lines.append(f"  Provider delta:      {d['providers_delta']:+,}")

    lines.append("")
    lines.append("TOP 10 DIGITAL DEBT OFFENDERS")
    lines.append("-" * 65)
    for i, off in enumerate(report.get("debt_offenders", []), 1):
        lines.append(f"  {i:2d}. {off['name'][:40]:40s} [{off['state']}] score={off['score']}")
        if off.get("notes"):
            lines.append(f"      {off['notes'][:65]}")

    lines.append("")
    lines.append("TOP 10 TRANSPARENCY LEADERS")
    lines.append("-" * 65)
    for i, ldr in enumerate(report.get("transparency_leaders", []), 1):
        idx = ldr.get("index_type") or "unknown"
        lines.append(f"  {i:2d}. {ldr['name'][:40]:40s} [{ldr['state']}] score={ldr['score']} ({idx})")

    if report.get("recent_failures"):
        lines.append("")
        lines.append("RECENT FAILURES (last 24h)")
        lines.append("-" * 65)
        for f in report["recent_failures"][:10]:
            lines.append(f"  {f['insurer'][:30]:30s} {f['error'][:50]}")

    lines.append("")
    lines.append("=" * 65)
    return "\n".join(lines)


def format_html_report(report: dict) -> str:
    """Format report as HTML email."""
    c = report["coverage"]
    lc = report.get("latest_crawl") or {}

    target_color = "#22c55e" if c["target_700"] else "#ef4444"
    target_text = "REACHED" if c["target_700"] else f"{c['unique_insurers']}/700"

    debt_rows = ""
    for i, off in enumerate(report.get("debt_offenders", []), 1):
        debt_rows += f"""<tr>
            <td style="padding:4px 8px">{i}</td>
            <td style="padding:4px 8px">{off['name']}</td>
            <td style="padding:4px 8px">{off['state']}</td>
            <td style="padding:4px 8px;color:#ef4444;font-weight:700">{off['score']}</td>
            <td style="padding:4px 8px;font-size:12px">{off.get('notes','')[:50]}</td>
        </tr>"""

    leader_rows = ""
    for i, ldr in enumerate(report.get("transparency_leaders", []), 1):
        leader_rows += f"""<tr>
            <td style="padding:4px 8px">{i}</td>
            <td style="padding:4px 8px">{ldr['name']}</td>
            <td style="padding:4px 8px">{ldr['state']}</td>
            <td style="padding:4px 8px;color:#22c55e;font-weight:700">{ldr['score']}</td>
            <td style="padding:4px 8px">{ldr.get('index_type','')}</td>
        </tr>"""

    return f"""
    <div style="font-family:Inter,sans-serif;color:#e4e4e7;background:#0c0c0e;padding:24px;max-width:700px">
        <h1 style="color:#3b82f6;font-size:20px;margin-bottom:16px">
            ClearNetwork Nightly Report — {report['generated_at'][:10]}
        </h1>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px">
            <div style="background:#141416;border:1px solid #2a2a2d;border-radius:8px;padding:16px;text-align:center">
                <div style="font-size:28px;font-weight:700;font-family:'JetBrains Mono';color:{target_color}">{target_text}</div>
                <div style="font-size:11px;color:#71717a;text-transform:uppercase">Unique Insurers</div>
            </div>
            <div style="background:#141416;border:1px solid #2a2a2d;border-radius:8px;padding:16px;text-align:center">
                <div style="font-size:28px;font-weight:700;font-family:'JetBrains Mono'">{c['automatable']}</div>
                <div style="font-size:11px;color:#71717a;text-transform:uppercase">Automatable</div>
            </div>
            <div style="background:#141416;border:1px solid #2a2a2d;border-radius:8px;padding:16px;text-align:center">
                <div style="font-size:28px;font-weight:700;font-family:'JetBrains Mono'">{c['states_covered']}/51</div>
                <div style="font-size:11px;color:#71717a;text-transform:uppercase">States Covered</div>
            </div>
        </div>

        <h2 style="color:#60a5fa;font-size:14px;text-transform:uppercase;letter-spacing:1px">Digital Debt Hall of Shame</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px">
            <tr style="border-bottom:1px solid #2a2a2d;color:#71717a;font-size:11px;text-transform:uppercase">
                <th style="padding:4px 8px;text-align:left">#</th>
                <th style="padding:4px 8px;text-align:left">Insurer</th>
                <th style="padding:4px 8px;text-align:left">State</th>
                <th style="padding:4px 8px;text-align:left">Score</th>
                <th style="padding:4px 8px;text-align:left">Issue</th>
            </tr>
            {debt_rows}
        </table>

        <h2 style="color:#22c55e;font-size:14px;text-transform:uppercase;letter-spacing:1px">Transparency Leaders</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px">
            <tr style="border-bottom:1px solid #2a2a2d;color:#71717a;font-size:11px;text-transform:uppercase">
                <th style="padding:4px 8px;text-align:left">#</th>
                <th style="padding:4px 8px;text-align:left">Insurer</th>
                <th style="padding:4px 8px;text-align:left">State</th>
                <th style="padding:4px 8px;text-align:left">Score</th>
                <th style="padding:4px 8px;text-align:left">Type</th>
            </tr>
            {leader_rows}
        </table>

        <p style="font-size:11px;color:#71717a">Generated by ClearNetwork Scout — MediCosts</p>
    </div>
    """


async def send_email_report(report: dict):
    """Send report via Resend API."""
    # Read Resend API key
    project_root = Path(__file__).resolve().parents[2]
    key_file = project_root / ".resendapikey"
    api_key = None
    if key_file.exists():
        api_key = key_file.read_text().strip()
    if not api_key:
        api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        print("WARNING: No Resend API key found — skipping email")
        return

    import aiohttp

    html = format_html_report(report)
    c = report["coverage"]

    async with aiohttp.ClientSession() as session:
        async with session.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": "ClearNetwork <noreply@medicosts.acumenus.net>",
                "to": [os.environ.get("REPORT_EMAIL", "admin@medicosts.app")],
                "subject": f"ClearNetwork Report: {c['unique_insurers']} insurers, "
                           f"{c['automatable']} automatable — {report['generated_at'][:10]}",
                "html": html,
            },
        ) as resp:
            if resp.status in (200, 201):
                data = await resp.json()
                print(f"Email sent: {data.get('id', 'ok')}")
            else:
                text = await resp.text()
                print(f"Email send failed ({resp.status}): {text[:200]}")


async def main(output_json: bool = False, send_email: bool = False):
    conn = await get_db_conn()

    try:
        report = await generate_report(conn)
    except Exception as e:
        print(f"Error generating report: {e}")
        await conn.close()
        return

    await conn.close()

    if output_json:
        print(json.dumps(report, indent=2, default=str))
    else:
        print(format_text_report(report))

    if send_email:
        await send_email_report(report)

    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ClearNetwork Nightly Report")
    parser.add_argument("--email", action="store_true", help="Send report via email")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()

    asyncio.run(main(output_json=args.json, send_email=args.email))
