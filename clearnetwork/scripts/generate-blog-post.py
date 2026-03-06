"""Daily Blog Post Generator — auto-generates a morning blog post from nightly crawl data.

Exposes insurers hiding behind technical debt and celebrates those adhering
to the Transparency in Coverage Rule (TiC). Posts are stored in the database
and served via the API.

Usage:
    python generate-blog-post.py              # Generate and save today's post
    python generate-blog-post.py --preview    # Preview without saving
    python generate-blog-post.py --email      # Also email the post
"""
import argparse
import asyncio
import json
import os
import random
from datetime import datetime, timezone, timedelta
from pathlib import Path
from textwrap import dedent

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


async def ensure_blog_table(conn):
    """Create blog_posts table if it doesn't exist."""
    await conn.execute(f"""
        CREATE TABLE IF NOT EXISTS {SCHEMA}.blog_posts (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            title TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            summary TEXT,
            content_html TEXT NOT NULL,
            content_markdown TEXT NOT NULL,
            tags TEXT[],
            stats JSONB,
            is_pinned BOOLEAN NOT NULL DEFAULT FALSE
        )
    """)
    await conn.execute(f"""
        CREATE INDEX IF NOT EXISTS idx_blog_posts_published
        ON {SCHEMA}.blog_posts (published_at DESC)
    """)
    # Add is_pinned column if missing (existing tables)
    await conn.execute(f"""
        DO $$ BEGIN
            ALTER TABLE {SCHEMA}.blog_posts ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT FALSE;
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$;
    """)


async def gather_data(conn) -> dict:
    """Gather all data needed for the blog post."""
    now = datetime.now(timezone.utc)
    yesterday = now - timedelta(hours=24)

    # Overall coverage stats
    coverage = await conn.fetchrow(f"""
        SELECT
            count(*) AS total_entries,
            count(DISTINCT insurer_name) AS unique_insurers,
            count(DISTINCT state) AS states,
            count(*) FILTER (WHERE accessibility = 'automatable') AS automatable,
            count(*) FILTER (WHERE accessibility = 'browser_required') AS browser_required,
            count(*) FILTER (WHERE accessibility = 'dead') AS dead,
            count(*) FILTER (WHERE accessibility = 'auth_required') AS auth_blocked,
            count(*) FILTER (WHERE transparency_score IS NOT NULL) AS scored,
            round(avg(transparency_score) FILTER (WHERE transparency_score IS NOT NULL)) AS avg_transparency,
            round(avg(digital_debt_score) FILTER (WHERE digital_debt_score IS NOT NULL)) AS avg_debt,
            count(*) FILTER (WHERE crawl_tested AND crawl_result = 'success') AS successfully_crawled
        FROM {SCHEMA}.mrf_research
    """)

    # Worst offenders — unique by insurer name, highest debt score
    worst = await conn.fetch(f"""
        SELECT DISTINCT ON (insurer_name)
            insurer_name, state, digital_debt_score, accessibility, notes,
            http_status, mrf_url
        FROM {SCHEMA}.mrf_research
        WHERE digital_debt_score IS NOT NULL AND digital_debt_score > 0
        ORDER BY insurer_name, digital_debt_score DESC
    """)
    worst = sorted(worst, key=lambda r: r["digital_debt_score"], reverse=True)

    # Best performers — unique by insurer, highest transparency
    best = await conn.fetch(f"""
        SELECT DISTINCT ON (insurer_name)
            insurer_name, state, transparency_score, index_type, accessibility
        FROM {SCHEMA}.mrf_research
        WHERE transparency_score IS NOT NULL AND transparency_score > 0
        ORDER BY insurer_name, transparency_score DESC
    """)
    best = sorted(best, key=lambda r: r["transparency_score"], reverse=True)

    # New discoveries in last 24h
    new_entries = await conn.fetch(f"""
        SELECT insurer_name, state, accessibility, transparency_score, digital_debt_score
        FROM {SCHEMA}.mrf_research
        WHERE researched_at > $1
        ORDER BY insurer_name
    """, yesterday)

    # Recent crawl failures
    failures = await conn.fetch(f"""
        SELECT cf.url, cf.error_message, i.legal_name AS insurer_name
        FROM {SCHEMA}.crawl_failures cf
        JOIN {SCHEMA}.crawl_jobs cj ON cf.crawl_job_id = cj.id
        JOIN {SCHEMA}.insurers i ON cj.insurer_id = i.id
        WHERE cf.last_attempt > $1
        ORDER BY cf.last_attempt DESC
        LIMIT 10
    """, yesterday)

    # State-level breakdown
    state_stats = await conn.fetch(f"""
        SELECT state,
               count(*) AS total,
               count(*) FILTER (WHERE accessibility = 'automatable') AS automatable,
               count(*) FILTER (WHERE accessibility = 'browser_required') AS browser_req,
               count(*) FILTER (WHERE accessibility = 'dead') AS dead
        FROM {SCHEMA}.mrf_research
        GROUP BY state
        ORDER BY state
    """)

    # States with zero automatable insurers (worst coverage)
    dark_states = [s for s in state_stats if s["automatable"] == 0]

    return {
        "coverage": dict(coverage),
        "worst_offenders": [dict(r) for r in worst[:15]],
        "best_performers": [dict(r) for r in best[:15]],
        "new_entries": [dict(r) for r in new_entries],
        "failures": [dict(r) for r in failures],
        "state_stats": [dict(r) for r in state_stats],
        "dark_states": [dict(r) for r in dark_states],
        "date": now,
    }


def generate_markdown(data: dict) -> tuple[str, str, str]:
    """Generate the blog post in markdown. Returns (title, summary, content)."""
    c = data["coverage"]
    date_str = data["date"].strftime("%B %d, %Y")
    date_slug = data["date"].strftime("%Y-%m-%d")

    # Dynamic title based on findings
    pct_automatable = (c["automatable"] * 100 // max(c["total_entries"], 1))
    titles = [
        f"Day {(data['date'] - datetime(2026, 3, 5, tzinfo=timezone.utc)).days + 1}: "
        f"{c['unique_insurers']} Insurers Scanned — Only {pct_automatable}% Play Fair",
        f"Transparency Report: {c['dead'] + c.get('auth_blocked', 0)} Insurers Still Hiding Their Prices",
        f"{c['unique_insurers']} Health Insurers, {c['automatable']} Comply — The Rest Are Stalling",
    ]
    title = titles[hash(date_slug) % len(titles)]

    summary = (
        f"We scanned {c['unique_insurers']} health insurers across {c['states']} states. "
        f"Only {c['automatable']} ({pct_automatable}%) make their pricing data machine-readable. "
        f"{c['browser_required']} hide behind JavaScript walls, and {c['dead']} have broken or missing links entirely."
    )

    # Build markdown content
    md = []

    md.append(f"# {title}\n")
    md.append(f"*{date_str} — ClearNetwork Daily Transparency Report*\n")
    md.append(f"> {summary}\n")

    # Overview section
    md.append("## The Numbers\n")
    md.append(f"| Metric | Count |")
    md.append(f"|--------|-------|")
    md.append(f"| Total insurer-state entries | **{c['total_entries']}** |")
    md.append(f"| Unique insurers tracked | **{c['unique_insurers']}** |")
    md.append(f"| States + DC covered | **{c['states']}** |")
    md.append(f"| Fully automatable (compliant) | **{c['automatable']}** ({pct_automatable}%) |")
    md.append(f"| Hidden behind JS/browser walls | **{c['browser_required']}** |")
    md.append(f"| Dead links (404/DNS failure) | **{c['dead']}** |")
    md.append(f"| Auth-walled (403 Forbidden) | **{c.get('auth_blocked', 0)}** |")
    md.append(f"| Successfully crawled | **{c['successfully_crawled']}** |")
    md.append(f"| Avg transparency score | **{c['avg_transparency']}/100** |")
    md.append(f"| Avg digital debt score | **{c['avg_debt']}/100** |")
    md.append("")

    # Hall of Shame
    md.append("## The Digital Debt Hall of Shame\n")
    md.append(
        "These insurers are legally required to publish machine-readable pricing files under the "
        "[Transparency in Coverage Rule](https://www.cms.gov/healthplan-price-transparency). "
        "Instead, they hide behind technical barriers, broken links, and JavaScript walls — "
        "making it impossible for consumers to compare prices.\n"
    )
    md.append("| Rank | Insurer | Debt Score | Issue |")
    md.append("|------|---------|-----------|-------|")
    for i, off in enumerate(data["worst_offenders"][:15], 1):
        notes = (off.get("notes") or off.get("accessibility", "")).replace("|", "/")[:60]
        md.append(f"| {i} | **{off['insurer_name']}** | {off['digital_debt_score']}/100 | {notes} |")
    md.append("")

    # Spotlight on worst
    if data["worst_offenders"]:
        worst = data["worst_offenders"][0]
        md.append(f"### Spotlight: {worst['insurer_name']}\n")
        if worst.get("accessibility") == "dead":
            md.append(
                f"{worst['insurer_name']} returns a **{worst.get('http_status', '404')} error** "
                f"when we try to access their MRF index file. This means their pricing data "
                f"is completely inaccessible — a direct violation of federal transparency requirements.\n"
            )
        elif worst.get("accessibility") == "browser_required":
            md.append(
                f"{worst['insurer_name']} serves their transparency page as a JavaScript-heavy web application "
                f"that requires a full browser to access. This defeats the purpose of \"machine-readable\" files — "
                f"you can't programmatically compare prices if you need a web browser to find them.\n"
            )
        elif worst.get("accessibility") == "auth_required":
            md.append(
                f"{worst['insurer_name']} blocks automated access with a **403 Forbidden** response. "
                f"They've placed authentication or CORS barriers in front of data that is legally required "
                f"to be publicly accessible.\n"
            )

    # Transparency Leaders
    md.append("## Transparency Leaders — Who's Doing It Right\n")
    md.append(
        "These insurers deserve recognition for making their pricing data truly accessible "
        "in clean, machine-readable formats:\n"
    )
    md.append("| Rank | Insurer | Score | Format |")
    md.append("|------|---------|-------|--------|")
    for i, ldr in enumerate(data["best_performers"][:10], 1):
        idx_type = ldr.get("index_type") or "unknown"
        fmt_map = {
            "uhc_blob_api": "Clean JSON API",
            "sapphire_hub": "Sapphire MRF Hub",
            "direct_json": "Direct JSON download",
            "dated_s3": "S3 with date pattern",
            "dated_azure": "Azure Blob Storage",
            "dated_cloudfront": "CloudFront CDN",
        }
        fmt = fmt_map.get(idx_type, idx_type)
        md.append(f"| {i} | **{ldr['insurer_name']}** | {ldr['transparency_score']}/100 | {fmt} |")
    md.append("")

    # Dark States
    if data["dark_states"]:
        md.append("## Dark States — Zero Automatable Insurers\n")
        md.append(
            "These states have **no insurers** with properly accessible MRF data. "
            "Every insurer in these states either requires a browser, returns errors, "
            "or hasn't published data at all:\n"
        )
        dark_list = ", ".join(s["state"] for s in data["dark_states"])
        md.append(f"**{dark_list}**\n")

    # Tonight's Struggles
    if data["failures"]:
        md.append("## Tonight's Crawl Struggles\n")
        md.append("Errors we encountered while trying to access insurer pricing data:\n")
        for f in data["failures"][:5]:
            err = (f.get("error_message") or "Unknown error")[:100]
            md.append(f"- **{f['insurer_name']}**: `{err}`")
        md.append("")

    # What this means
    md.append("## Why This Matters\n")
    md.append(
        "The Transparency in Coverage Rule requires all health insurers to publish "
        "machine-readable files (MRFs) containing negotiated rates for every covered item. "
        "This data is supposed to help consumers compare prices and make informed decisions "
        "about their healthcare.\n\n"
        "When insurers hide this data behind JavaScript walls, broken links, or authentication "
        "barriers, they're technically \"publishing\" but making it practically impossible for "
        "anyone — researchers, journalists, startups, or patients — to use the data.\n\n"
        f"We'll keep crawling every night. Currently tracking **{c['unique_insurers']}** insurers. "
        f"Target: **700+**.\n"
    )

    md.append("---\n")
    md.append(
        "*This report is auto-generated by the ClearNetwork crawler, part of the "
        "[MediCosts](https://medicosts.acumenus.net) open healthcare data project. "
        "Data is collected nightly from publicly available sources.*\n"
    )

    content = "\n".join(md)
    return title, summary, content


def markdown_to_html(md: str) -> str:
    """Convert markdown to simple HTML (tables and formatting)."""
    lines = md.split("\n")
    html_lines = []
    in_table = False

    for line in lines:
        stripped = line.strip()

        # Headers
        if stripped.startswith("# "):
            html_lines.append(f'<h1 style="color:#3b82f6;font-size:24px;margin-bottom:8px">{stripped[2:]}</h1>')
        elif stripped.startswith("## "):
            html_lines.append(f'<h2 style="color:#60a5fa;font-size:18px;margin-top:32px;margin-bottom:12px;'
                              f'text-transform:uppercase;letter-spacing:1px;font-size:14px">{stripped[3:]}</h2>')
        elif stripped.startswith("### "):
            html_lines.append(f'<h3 style="color:#e4e4e7;font-size:16px;margin-top:16px">{stripped[4:]}</h3>')
        # Blockquote
        elif stripped.startswith("> "):
            html_lines.append(f'<blockquote style="border-left:3px solid #3b82f6;padding-left:16px;'
                              f'color:#a1a1aa;font-style:italic;margin:16px 0">{stripped[2:]}</blockquote>')
        # Italic
        elif stripped.startswith("*") and stripped.endswith("*") and not stripped.startswith("**"):
            html_lines.append(f'<p style="color:#71717a;font-style:italic;font-size:13px">{stripped[1:-1]}</p>')
        # Table
        elif stripped.startswith("|"):
            if not in_table:
                html_lines.append('<table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0">')
                in_table = True
            if stripped.startswith("|---") or stripped.startswith("| ---"):
                continue  # Skip separator rows
            cells = [c.strip() for c in stripped.split("|")[1:-1]]
            tag = "th" if not any("**" in c for c in cells) and in_table and len(html_lines) < 5 else "td"
            style = 'padding:6px 10px;border-bottom:1px solid #2a2a2d;text-align:left'
            row_cells = "".join(f'<{tag} style="{style}">{c}</{tag}>' for c in cells)
            html_lines.append(f'<tr>{row_cells}</tr>')
        else:
            if in_table:
                html_lines.append('</table>')
                in_table = False
            if stripped.startswith("- "):
                html_lines.append(f'<li style="margin:4px 0;color:#e4e4e7">{stripped[2:]}</li>')
            elif stripped == "---":
                html_lines.append('<hr style="border:none;border-top:1px solid #2a2a2d;margin:24px 0">')
            elif stripped:
                # Bold
                text = stripped.replace("**", "<strong>", 1).replace("**", "</strong>", 1)
                while "**" in text:
                    text = text.replace("**", "<strong>", 1).replace("**", "</strong>", 1)
                # Code
                while "`" in text:
                    text = text.replace("`", '<code style="background:#1e1e21;padding:2px 6px;border-radius:4px;font-family:JetBrains Mono;font-size:12px">', 1)
                    text = text.replace("`", '</code>', 1)
                html_lines.append(f'<p style="color:#e4e4e7;line-height:1.6;margin:8px 0">{text}</p>')

    if in_table:
        html_lines.append('</table>')

    body = "\n".join(html_lines)
    return f'''<div style="font-family:Inter,sans-serif;background:#0c0c0e;color:#e4e4e7;
                           padding:32px;max-width:800px;margin:0 auto">{body}</div>'''


async def save_post(conn, title: str, summary: str, markdown: str, html: str, data: dict):
    """Save blog post to database."""
    date_slug = data["date"].strftime("%Y-%m-%d")
    slug = f"transparency-report-{date_slug}"

    stats = {
        "total_entries": data["coverage"]["total_entries"],
        "unique_insurers": data["coverage"]["unique_insurers"],
        "automatable": data["coverage"]["automatable"],
        "browser_required": data["coverage"]["browser_required"],
        "dead": data["coverage"]["dead"],
    }

    await conn.execute(f"""
        INSERT INTO {SCHEMA}.blog_posts (published_at, title, slug, summary, content_html, content_markdown, tags, stats)
        VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (slug) DO UPDATE SET
            title = EXCLUDED.title,
            summary = EXCLUDED.summary,
            content_html = EXCLUDED.content_html,
            content_markdown = EXCLUDED.content_markdown,
            stats = EXCLUDED.stats,
            published_at = NOW()
    """,
        title, slug, summary, html, markdown,
        ["transparency", "crawl-report", "digital-debt", "healthcare"],
        json.dumps(stats),
    )
    return slug


async def email_post(title: str, html: str, summary: str):
    """Send blog post via Resend email."""
    project_root = Path(__file__).resolve().parents[2]
    key_file = project_root / ".resendapikey"
    api_key = None
    if key_file.exists():
        api_key = key_file.read_text().strip()
    if not api_key:
        api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        print("WARNING: No Resend API key — skipping email")
        return

    import aiohttp
    async with aiohttp.ClientSession() as session:
        async with session.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "from": "ClearNetwork <noreply@medicosts.acumenus.net>",
                "to": [os.environ.get("REPORT_EMAIL", "admin@medicosts.app")],
                "subject": title,
                "html": html,
            },
        ) as resp:
            if resp.status in (200, 201):
                print(f"Email sent: {(await resp.json()).get('id', 'ok')}")
            else:
                print(f"Email failed ({resp.status}): {(await resp.text())[:200]}")


async def main(preview: bool = False, send_email: bool = False):
    conn = await get_db_conn()
    await ensure_blog_table(conn)

    print("Gathering crawl data...")
    data = await gather_data(conn)

    print("Generating blog post...")
    title, summary, markdown = generate_markdown(data)
    html = markdown_to_html(markdown)

    if preview:
        print("\n" + "=" * 70)
        print(markdown)
        print("=" * 70)
    else:
        slug = await save_post(conn, title, summary, markdown, html, data)
        print(f"Blog post saved: {slug}")
        print(f"Title: {title}")

    if send_email:
        await email_post(title, html, summary)

    await conn.close()
    return title


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ClearNetwork Daily Blog Post Generator")
    parser.add_argument("--preview", action="store_true", help="Preview without saving")
    parser.add_argument("--email", action="store_true", help="Also send via email")
    args = parser.parse_args()

    asyncio.run(main(preview=args.preview, send_email=args.email))
