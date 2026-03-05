"""50-State Parallel Crawler — runs the MRF crawl pipeline across all states.

Uses state-registry/*.json as input (produced by scout.py), crawls all
automatable insurers per state, and feeds results into the clearnetwork
PostgreSQL schema.

Usage:
    python -m crawler.state_runner                       # All 50 states
    python -m crawler.state_runner --state PA --state NY  # Specific states
    python -m crawler.state_runner --concurrency 10      # 10 states in parallel
    python -m crawler.state_runner --automatable-only     # Skip browser_required
    python -m crawler.state_runner --max-files 20         # Limit files per insurer
    python -m crawler.state_runner --resume               # Resume interrupted jobs
    python -m crawler.state_runner --status               # Show crawl status
"""
import argparse
import asyncio
import json
import logging
import os
import signal
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import aiohttp
import asyncpg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

# Import existing crawler components
from crawler.discovery import seed_known_insurers
from crawler.downloader import DownloadManager
from crawler.mrf_index import fetch_and_parse_index, fetch_uhc_blob_index, store_index_results
from crawler.mrf_parser import extract_npis_from_file, upsert_network_providers
from crawler.orchestrator import (
    create_crawl_job, update_crawl_job, log_failure,
    try_dated_urls, resolve_mrf_url, SCHEMA, MRF_CACHE_DIR,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
)
logger = logging.getLogger("state_runner")

PROJECT_ROOT = Path(__file__).resolve().parents[2]
STATE_REGISTRY_DIR = PROJECT_ROOT / "clearnetwork" / "state-registry"

US_STATES = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
    "DC",
]

# Stats tracking
class CrawlStats:
    def __init__(self):
        self.states_started = 0
        self.states_completed = 0
        self.insurers_attempted = 0
        self.insurers_succeeded = 0
        self.insurers_failed = 0
        self.insurers_skipped = 0
        self.files_downloaded = 0
        self.providers_linked = 0
        self.errors = 0
        self.start_time = time.time()

    def summary(self) -> dict:
        elapsed = time.time() - self.start_time
        return {
            "elapsed_seconds": int(elapsed),
            "states_completed": f"{self.states_completed}/{self.states_started}",
            "insurers_attempted": self.insurers_attempted,
            "insurers_succeeded": self.insurers_succeeded,
            "insurers_failed": self.insurers_failed,
            "insurers_skipped": self.insurers_skipped,
            "files_downloaded": self.files_downloaded,
            "providers_linked": self.providers_linked,
            "errors": self.errors,
        }


async def get_db_conn():
    return await asyncpg.connect(
        host=os.environ.get("PGHOST", "localhost"),
        port=int(os.environ.get("PGPORT", "5432")),
        user=os.environ.get("PGUSER", "postgres"),
        password=os.environ.get("PGPASSWORD", ""),
        database=os.environ.get("PGDATABASE", "medicosts"),
    )


def load_state_registry(state: str) -> list[dict]:
    """Load insurers for a state from state-registry/{STATE}.json."""
    path = STATE_REGISTRY_DIR / f"{state}.json"
    if not path.exists():
        logger.warning("No registry file for %s at %s", state, path)
        return []
    with open(path) as f:
        return json.load(f)


async def ensure_insurer_in_db(conn, entry: dict) -> str | None:
    """Ensure the insurer exists in clearnetwork.insurers, return its UUID."""
    name = entry["insurer_name"]
    row = await conn.fetchrow(
        f"SELECT id FROM {SCHEMA}.insurers WHERE legal_name = $1", name
    )
    if row:
        return row["id"]

    # Insert new insurer
    insurer_id = uuid.uuid4()
    states = [entry.get("state", "")] if entry.get("state") else None
    await conn.execute(
        f"""INSERT INTO {SCHEMA}.insurers (id, legal_name, trade_names, states_licensed, mrf_index_url)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT DO NOTHING""",
        insurer_id,
        name,
        entry.get("trade_names"),
        states,
        entry.get("mrf_url"),
    )
    logger.info("  Registered new insurer: %s", name)
    return insurer_id


async def crawl_single_insurer(
    conn, session: aiohttp.ClientSession, downloader: DownloadManager,
    entry: dict, max_files: int, insurer_timeout: int, stats: CrawlStats,
):
    """Crawl a single insurer from a state registry entry."""
    name = entry["insurer_name"]
    state = entry.get("state", "?")
    mrf_url = entry.get("mrf_url")
    index_type = entry.get("index_type", "unknown")
    accessibility = entry.get("accessibility", "unknown")

    stats.insurers_attempted += 1

    if not mrf_url or accessibility in ("dead", "unknown"):
        stats.insurers_skipped += 1
        return

    if accessibility == "browser_required":
        stats.insurers_skipped += 1
        return

    insurer_id = await ensure_insurer_in_db(conn, entry)
    if not insurer_id:
        stats.insurers_skipped += 1
        return

    job_id = await create_crawl_job(conn, insurer_id)
    total_files = 0
    total_providers = 0
    total_errors = 0
    error_log = []

    try:
        # Resolve dated URLs if needed
        actual_url = mrf_url
        date_pattern = entry.get("date_pattern")
        if date_pattern and "{date}" in mrf_url:
            actual_url = await try_dated_urls(mrf_url, date_pattern, session)
            if not actual_url:
                logger.warning("  [%s/%s] No working dated URL — skipping", state, name)
                stats.insurers_failed += 1
                await update_crawl_job(conn, job_id, "failed", error_log=["No working dated URL"])
                return

        logger.info("  [%s/%s] Fetching index: %s", state, name, actual_url[:80])

        # Fetch + parse index
        if index_type == "uhc_blob_api":
            max_indexes = max(max_files, 20) if max_files > 0 else 50
            index_result = await fetch_uhc_blob_index(actual_url, session, max_indexes=max_indexes)
        else:
            index_result = await fetch_and_parse_index(actual_url, session)

        if index_result.errors:
            for err in index_result.errors:
                error_log.append(err)
                await log_failure(conn, job_id, actual_url, err)
            total_errors += len(index_result.errors)

        if not index_result.in_network_urls:
            if index_result.errors:
                await update_crawl_job(conn, job_id, "failed", 0, 0, total_errors, error_log)
                stats.insurers_failed += 1
            else:
                await update_crawl_job(conn, job_id, "completed", 0, 0, 0, None)
                stats.insurers_succeeded += 1
            return

        # Store index results
        network_id, plans_inserted, _ = await store_index_results(conn, insurer_id, index_result)

        # Download and parse files
        file_limit = max_files if max_files > 0 else len(index_result.in_network_urls)
        urls = index_result.in_network_urls[:file_limit]

        for idx, url in enumerate(urls, 1):
            try:
                result = await downloader.download(url)
                if not result.success:
                    if result.error == "duplicate":
                        continue
                    await log_failure(conn, job_id, url, result.error or "unknown")
                    total_errors += 1
                    continue

                if result.path is None:
                    continue

                total_files += 1
                stats.files_downloaded += 1

                npis = await extract_npis_from_file(result.path)
                linked = await upsert_network_providers(conn, network_id, npis)
                total_providers += linked
                stats.providers_linked += linked

                result.path.unlink(missing_ok=True)

            except Exception as e:
                logger.error("  [%s/%s] File error: %s", state, name, e)
                await log_failure(conn, job_id, url, str(e))
                total_errors += 1
                stats.errors += 1

        # Update insurer + network records
        await conn.execute(
            f"UPDATE {SCHEMA}.insurers SET last_crawled = NOW() WHERE id = $1", insurer_id
        )
        provider_count = await conn.fetchval(
            f"SELECT count(*) FROM {SCHEMA}.network_providers WHERE network_id = $1", network_id
        )
        await conn.execute(
            f"UPDATE {SCHEMA}.networks SET provider_count = $1, last_updated = NOW() WHERE id = $2",
            provider_count, network_id,
        )

        # Update mrf_research crawl status
        await conn.execute(f"""
            UPDATE {SCHEMA}.mrf_research SET
                crawl_tested = true,
                crawl_result = $1,
                added_to_registry = true
            WHERE state = $2 AND insurer_name = $3
        """,
            "success" if total_errors == 0 else "partial",
            state, name,
        )

        status = "completed" if total_errors == 0 else "completed_with_errors"
        await update_crawl_job(conn, job_id, status, total_files, total_providers, total_errors, error_log)
        stats.insurers_succeeded += 1

        logger.info("  [%s/%s] Done: %d files, %d providers, %d errors",
                     state, name, total_files, total_providers, total_errors)

    except asyncio.TimeoutError:
        logger.error("  [%s/%s] Timed out after %ds", state, name, insurer_timeout)
        await update_crawl_job(conn, job_id, "failed", total_files, total_providers, total_errors + 1,
                               error_log + [f"Timeout after {insurer_timeout}s"])
        stats.insurers_failed += 1
        stats.errors += 1
    except Exception as e:
        logger.error("  [%s/%s] Fatal: %s", state, name, e)
        await update_crawl_job(conn, job_id, "failed", total_files, total_providers, total_errors + 1,
                               error_log + [str(e)])
        stats.insurers_failed += 1
        stats.errors += 1


async def crawl_state(
    state: str, max_files: int, insurer_timeout: int,
    automatable_only: bool, stats: CrawlStats,
):
    """Crawl all insurers for a single state."""
    logger.info("[%s] Starting state crawl...", state)
    stats.states_started += 1

    entries = load_state_registry(state)
    if not entries:
        logger.warning("[%s] No insurers in registry — run scout.py first", state)
        stats.states_completed += 1
        return

    # Filter
    if automatable_only:
        entries = [e for e in entries if e.get("accessibility") == "automatable"]

    if not entries:
        logger.info("[%s] No automatable insurers — skipping", state)
        stats.states_completed += 1
        return

    logger.info("[%s] Processing %d insurers...", state, len(entries))

    conn = await get_db_conn()
    connector = aiohttp.TCPConnector(family=2, limit=10)
    async with aiohttp.ClientSession(connector=connector) as session:
        async with DownloadManager(MRF_CACHE_DIR) as downloader:
            for entry in entries:
                try:
                    await asyncio.wait_for(
                        crawl_single_insurer(
                            conn, session, downloader, entry,
                            max_files, insurer_timeout, stats,
                        ),
                        timeout=insurer_timeout,
                    )
                except asyncio.TimeoutError:
                    logger.error("[%s] Insurer %s timed out — moving on",
                                 state, entry.get("insurer_name", "?"))
                    stats.insurers_failed += 1

    await conn.close()
    stats.states_completed += 1
    logger.info("[%s] State complete", state)


async def run_all_states(
    states: list[str],
    concurrency: int = 10,
    max_files: int = 20,
    insurer_timeout: int = 3600,
    automatable_only: bool = True,
):
    """Run crawlers for multiple states with bounded concurrency."""
    stats = CrawlStats()
    sem = asyncio.Semaphore(concurrency)
    shutdown = asyncio.Event()

    # Graceful shutdown handler
    def handle_signal():
        logger.warning("Shutdown signal received — finishing current states...")
        shutdown.set()

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, handle_signal)

    async def guarded_crawl(state):
        if shutdown.is_set():
            return
        async with sem:
            if shutdown.is_set():
                return
            await crawl_state(state, max_files, insurer_timeout, automatable_only, stats)

    logger.info("Starting crawl: %d states, concurrency=%d, max_files=%d",
                len(states), concurrency, max_files)

    tasks = [asyncio.create_task(guarded_crawl(s)) for s in states]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for state, result in zip(states, results):
        if isinstance(result, Exception):
            logger.error("[%s] Fatal state-level error: %s", state, result)
            stats.errors += 1

    # Save stats to DB
    conn = await get_db_conn()
    await save_crawl_stats(conn, stats)
    await conn.close()

    # Print summary
    summary = stats.summary()
    print(f"""
{'=' * 60}
  STATE RUNNER SUMMARY
{'=' * 60}
  Elapsed:           {summary['elapsed_seconds']}s
  States:            {summary['states_completed']}
  Insurers attempted:{summary['insurers_attempted']}
  Insurers succeeded:{summary['insurers_succeeded']}
  Insurers failed:   {summary['insurers_failed']}
  Insurers skipped:  {summary['insurers_skipped']}
  Files downloaded:  {summary['files_downloaded']}
  Providers linked:  {summary['providers_linked']}
  Errors:            {summary['errors']}
{'=' * 60}
""")

    return stats


async def save_crawl_stats(conn, stats: CrawlStats):
    """Save nightly crawl stats snapshot for the dashboard."""
    # Create table if not exists (idempotent)
    await conn.execute(f"""
        CREATE TABLE IF NOT EXISTS {SCHEMA}.crawl_stats (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            total_insurers_discovered INTEGER,
            total_insurers_automatable INTEGER,
            total_insurers_browser_required INTEGER,
            total_insurers_dead INTEGER,
            total_unique_insurers INTEGER,
            states_with_coverage INTEGER,
            total_networks INTEGER,
            total_providers INTEGER,
            crawl_insurers_attempted INTEGER,
            crawl_insurers_succeeded INTEGER,
            crawl_insurers_failed INTEGER,
            crawl_files_downloaded INTEGER,
            crawl_providers_linked INTEGER,
            crawl_errors INTEGER,
            crawl_elapsed_seconds INTEGER
        )
    """)

    # Gather totals from mrf_research
    totals = await conn.fetchrow(f"""
        SELECT
            count(*) AS total,
            count(*) FILTER (WHERE accessibility = 'automatable') AS automatable,
            count(*) FILTER (WHERE accessibility = 'browser_required') AS browser_req,
            count(*) FILTER (WHERE accessibility = 'dead') AS dead,
            count(DISTINCT insurer_name) AS unique_insurers,
            count(DISTINCT state) AS states
        FROM {SCHEMA}.mrf_research
    """)

    total_networks = await conn.fetchval(f"SELECT count(*) FROM {SCHEMA}.networks")
    total_providers = await conn.fetchval(f"SELECT count(*) FROM {SCHEMA}.canonical_providers")

    await conn.execute(f"""
        INSERT INTO {SCHEMA}.crawl_stats (
            total_insurers_discovered, total_insurers_automatable,
            total_insurers_browser_required, total_insurers_dead,
            total_unique_insurers, states_with_coverage,
            total_networks, total_providers,
            crawl_insurers_attempted, crawl_insurers_succeeded,
            crawl_insurers_failed, crawl_files_downloaded,
            crawl_providers_linked, crawl_errors, crawl_elapsed_seconds
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    """,
        totals["total"], totals["automatable"],
        totals["browser_req"], totals["dead"],
        totals["unique_insurers"], totals["states"],
        total_networks, total_providers,
        stats.insurers_attempted, stats.insurers_succeeded,
        stats.insurers_failed, stats.files_downloaded,
        stats.providers_linked, stats.errors,
        int(time.time() - stats.start_time),
    )


async def show_status():
    """Show current crawl status from DB."""
    conn = await get_db_conn()

    # Latest stats
    row = await conn.fetchrow(f"""
        SELECT * FROM {SCHEMA}.crawl_stats ORDER BY recorded_at DESC LIMIT 1
    """)

    if row:
        print(f"""
Latest Crawl Stats ({row['recorded_at'].strftime('%Y-%m-%d %H:%M')})
{'─' * 50}
  Insurers discovered:  {row['total_insurers_discovered']}
  Unique insurers:      {row['total_unique_insurers']}
  Automatable:          {row['total_insurers_automatable']}
  Browser-required:     {row['total_insurers_browser_required']}
  Dead:                 {row['total_insurers_dead']}
  States with coverage: {row['states_with_coverage']}
  Networks:             {row['total_networks']}
  Providers:            {row['total_providers']}

Last Crawl Run:
  Attempted:    {row['crawl_insurers_attempted']}
  Succeeded:    {row['crawl_insurers_succeeded']}
  Failed:       {row['crawl_insurers_failed']}
  Files:        {row['crawl_files_downloaded']}
  Providers:    {row['crawl_providers_linked']}
  Errors:       {row['crawl_errors']}
  Duration:     {row['crawl_elapsed_seconds']}s
""")
    else:
        print("No crawl stats recorded yet. Run a crawl first.")

    # State coverage
    state_rows = await conn.fetch(f"""
        SELECT state, count(*) AS total,
               count(*) FILTER (WHERE accessibility = 'automatable') AS auto,
               count(*) FILTER (WHERE crawl_tested AND crawl_result = 'success') AS crawled
        FROM {SCHEMA}.mrf_research
        GROUP BY state ORDER BY state
    """)
    if state_rows:
        print(f"{'State':>5}  {'Total':>6}  {'Auto':>5}  {'Crawled':>7}")
        print(f"{'─' * 5}  {'─' * 6}  {'─' * 5}  {'─' * 7}")
        for r in state_rows:
            print(f"{r['state']:>5}  {r['total']:>6}  {r['auto']:>5}  {r['crawled']:>7}")

    await conn.close()


def main():
    parser = argparse.ArgumentParser(description="50-State Parallel MRF Crawler")
    parser.add_argument("--state", action="append",
                        help="Specific state(s) (can repeat). Default: all 50+DC")
    parser.add_argument("--concurrency", type=int, default=10,
                        help="Max concurrent state crawlers (default: 10)")
    parser.add_argument("--max-files", type=int, default=20,
                        help="Max in-network files per insurer (default: 20)")
    parser.add_argument("--insurer-timeout", type=int, default=3600,
                        help="Max seconds per insurer (default: 3600)")
    parser.add_argument("--automatable-only", action="store_true", default=True,
                        help="Skip browser_required insurers (default: true)")
    parser.add_argument("--include-all", action="store_true",
                        help="Include all accessibility types")
    parser.add_argument("--resume", action="store_true",
                        help="Resume interrupted state crawl")
    parser.add_argument("--status", action="store_true",
                        help="Show current crawl status")
    args = parser.parse_args()

    if args.status:
        asyncio.run(show_status())
        return

    states = [s.upper() for s in args.state] if args.state else US_STATES
    automatable_only = args.automatable_only and not args.include_all

    asyncio.run(run_all_states(
        states=states,
        concurrency=args.concurrency,
        max_files=args.max_files,
        insurer_timeout=args.insurer_timeout,
        automatable_only=automatable_only,
    ))


if __name__ == "__main__":
    main()
