"""Crawl Pipeline Orchestrator — coordinates the full MRF crawl pipeline.

Usage:
    python -m crawler.orchestrator                         # Crawl all automatable insurers
    python -m crawler.orchestrator --insurer=aetna         # Crawl specific insurer
    python -m crawler.orchestrator --seed-only             # Only seed insurer registry
    python -m crawler.orchestrator --max-files=50          # Limit files per insurer
    python -m crawler.orchestrator --automatable-only      # Skip browser_required insurers
"""
import argparse
import asyncio
import json as json_mod
import logging
import os
import sys
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path

import aiohttp
import asyncpg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from crawler.discovery import seed_known_insurers
from crawler.downloader import DownloadManager
from crawler.mrf_index import fetch_and_parse_index, fetch_uhc_blob_index, store_index_results
from crawler.mrf_parser import extract_npis_from_file, upsert_network_providers

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

SCHEMA = "clearnetwork"
MRF_CACHE_DIR = Path(__file__).resolve().parents[2] / "data" / "mrf_cache"
KNOWN_INSURERS_PATH = Path(__file__).parent / "known_insurers.json"

# Default max in-network files per insurer (0 = unlimited)
DEFAULT_MAX_FILES = 0


async def get_db_conn():
    return await asyncpg.connect(
        host=os.environ.get("PGHOST", "localhost"),
        port=int(os.environ.get("PGPORT", "5432")),
        user=os.environ.get("PGUSER", "postgres"),
        password=os.environ.get("PGPASSWORD", ""),
        database=os.environ.get("PGDATABASE", "medicosts"),
    )


async def create_crawl_job(conn, insurer_id):
    job_id = uuid.uuid4()
    await conn.execute(
        f"INSERT INTO {SCHEMA}.crawl_jobs (id, insurer_id) VALUES ($1, $2)",
        job_id, insurer_id,
    )
    return job_id


async def update_crawl_job(conn, job_id, status, files=0, providers=0, errors=0, error_log=None):
    await conn.execute(
        f"""
        UPDATE {SCHEMA}.crawl_jobs SET
            status = $1, completed_at = NOW(),
            files_processed = $2, providers_found = $3,
            errors = $4, error_log = $5
        WHERE id = $6
        """,
        status, files, providers, errors,
        json_mod.dumps(error_log) if error_log else None,
        job_id,
    )


async def log_failure(conn, job_id, url, error_msg):
    await conn.execute(
        f"""
        INSERT INTO {SCHEMA}.crawl_failures (id, crawl_job_id, url, error_message)
        VALUES ($1, $2, $3, $4)
        """,
        uuid.uuid4(), job_id, url, error_msg,
    )


def resolve_mrf_url(insurer_json: dict) -> str | None:
    """Resolve the actual MRF index URL, handling dated patterns."""
    url = insurer_json.get("mrf_index_url")
    index_type = insurer_json.get("index_type", "direct_json")

    if not url:
        return None

    if index_type == "browser_required":
        return None  # Can't automate these

    if "{date}" not in url:
        return url  # Static URL, use as-is

    # Resolve dated URL patterns
    date_pattern = insurer_json.get("date_pattern", "YYYY-MM-01")
    now = datetime.now()

    if date_pattern == "YYYY-MM-01":
        date_str = now.strftime("%Y-%m-01")
    elif date_pattern == "YYYY-MM":
        date_str = now.strftime("%Y-%m")
    elif date_pattern == "YYYY-MM-DD":
        # Try recent dates (today, yesterday, last few days, 1st of month)
        # Return the template — we'll try multiple dates in the caller
        date_str = now.strftime("%Y-%m-%d")
    else:
        date_str = now.strftime("%Y-%m-01")

    return url.replace("{date}", date_str)


async def try_dated_urls(url_template: str, date_pattern: str, session: aiohttp.ClientSession) -> str | None:
    """Try multiple date variants for a dated URL until one works."""
    now = datetime.now()
    dates_to_try = []

    if date_pattern == "YYYY-MM-DD":
        # Try last 7 days
        for i in range(7):
            d = now - timedelta(days=i)
            dates_to_try.append(d.strftime("%Y-%m-%d"))
    elif date_pattern == "YYYY-MM-01":
        dates_to_try.append(now.strftime("%Y-%m-01"))
        # Try previous month too
        prev = now.replace(day=1) - timedelta(days=1)
        dates_to_try.append(prev.strftime("%Y-%m-01"))
    elif date_pattern == "YYYY-MM":
        dates_to_try.append(now.strftime("%Y-%m"))
        prev = now.replace(day=1) - timedelta(days=1)
        dates_to_try.append(prev.strftime("%Y-%m"))

    for date_str in dates_to_try:
        url = url_template.replace("{date}", date_str)
        try:
            async with session.head(url, allow_redirects=True, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status == 200:
                    logger.info(f"    Found working dated URL: {url[:100]}...")
                    return url
        except Exception:
            pass

    return None


def load_insurer_json_index() -> dict:
    """Load known_insurers.json as a lookup by legal_name."""
    with open(KNOWN_INSURERS_PATH) as f:
        insurers = json_mod.load(f)
    return {ins["legal_name"]: ins for ins in insurers}


async def crawl_insurer(
    conn, insurer_row, session: aiohttp.ClientSession, downloader: DownloadManager,
    max_files: int = 0, insurer_json: dict | None = None,
    include_browser: bool = False,
):
    """Full crawl pipeline for a single insurer."""
    insurer_id = insurer_row["id"]
    insurer_name = insurer_row["legal_name"]

    # Resolve the actual URL from the JSON config (handles dated patterns)
    if insurer_json:
        index_type = insurer_json.get("index_type", "direct_json")

        if index_type == "browser_required":
            if include_browser:
                try:
                    from crawler.browser import fetch_mrf_urls_with_browser
                    logger.info(f"  [{insurer_name}] Using browser automation...")
                    mrf_url = insurer_json.get("mrf_index_url", "")
                except ImportError:
                    logger.warning(f"  [{insurer_name}] Browser module not available — skipping")
                    return
            else:
                logger.info(f"  [{insurer_name}] Requires browser automation — skipping")
                return

        url_template = insurer_json.get("mrf_index_url", "")
        if index_type == "uhc_blob_api":
            mrf_url = url_template  # UHC uses its own fetch path below
        elif "{date}" in url_template:
            date_pattern = insurer_json.get("date_pattern", "YYYY-MM-01")
            mrf_url = await try_dated_urls(url_template, date_pattern, session)
            if not mrf_url:
                logger.warning(f"  [{insurer_name}] No working dated URL found — skipping")
                return
        elif index_type != "browser_required":
            mrf_url = url_template
    else:
        index_type = "direct_json"
        mrf_url = insurer_row["mrf_index_url"]

    if not mrf_url:
        logger.warning(f"  [{insurer_name}] No MRF index URL — skipping")
        return

    logger.info(f"  [{insurer_name}] Fetching MRF index: {mrf_url[:100]}...")
    job_id = await create_crawl_job(conn, insurer_id)

    total_files = 0
    total_providers = 0
    total_errors = 0
    error_log = []

    try:
        # Step 1: Parse MRF index (dispatch by index_type)
        if index_type == "uhc_blob_api":
            max_indexes = max(max_files, 20) if max_files > 0 else 50
            index_result = await fetch_uhc_blob_index(mrf_url, session, max_indexes=max_indexes)
        elif index_type == "browser_required" and include_browser:
            from crawler.browser import fetch_mrf_urls_with_browser
            index_result = await fetch_mrf_urls_with_browser(mrf_url, session)
        else:
            index_result = await fetch_and_parse_index(mrf_url, session)

        if index_result.errors:
            for err in index_result.errors:
                logger.warning(f"    Index error: {err}")
                error_log.append(err)
                await log_failure(conn, job_id, mrf_url, err)
            total_errors += len(index_result.errors)

        logger.info(
            f"    Found {len(index_result.plans)} plans, "
            f"{len(index_result.in_network_urls)} in-network files"
        )

        if not index_result.in_network_urls and index_result.errors:
            status = "failed"
            await update_crawl_job(conn, job_id, status, 0, 0, total_errors, error_log)
            logger.warning(f"  [{insurer_name}] No in-network files found — marking failed")
            return

        # Step 2: Store index results (plans + network)
        network_id, plans_inserted, file_count = await store_index_results(
            conn, insurer_id, index_result
        )
        logger.info(f"    Stored {plans_inserted} plans, network_id={network_id}")

        # Step 3: Download and parse in-network files
        file_limit = max_files if max_files > 0 else len(index_result.in_network_urls)
        urls_to_process = index_result.in_network_urls[:file_limit]
        if len(index_result.in_network_urls) > file_limit:
            logger.info(
                f"    Processing {file_limit} of {len(index_result.in_network_urls)} files"
            )

        for idx, url in enumerate(urls_to_process, 1):
            try:
                logger.info(f"    [{idx}/{len(urls_to_process)}] Downloading: {url[:80]}...")
                result = await downloader.download(url)

                if not result.success:
                    if result.error == "duplicate":
                        continue
                    logger.warning(f"    Download failed: {result.error}")
                    await log_failure(conn, job_id, url, result.error or "unknown")
                    total_errors += 1
                    continue

                if result.path is None:
                    continue

                total_files += 1

                # Parse NPIs from the file
                logger.info(f"    Parsing NPIs from {result.path.name}...")
                npis = await extract_npis_from_file(result.path)
                logger.info(f"    Found {len(npis):,} unique NPIs")

                # Link to network_providers
                linked = await upsert_network_providers(conn, network_id, npis)
                total_providers += linked
                logger.info(f"    Linked {linked:,} providers to network")

                # Clean up downloaded file to save disk
                result.path.unlink(missing_ok=True)

            except Exception as e:
                logger.error(f"    Error processing {url}: {e}")
                await log_failure(conn, job_id, url, str(e))
                total_errors += 1

        # Update insurer last_crawled
        await conn.execute(
            f"UPDATE {SCHEMA}.insurers SET last_crawled = NOW() WHERE id = $1",
            insurer_id,
        )

        # Update network provider count
        provider_count = await conn.fetchval(
            f"SELECT count(*) FROM {SCHEMA}.network_providers WHERE network_id = $1",
            network_id,
        )
        await conn.execute(
            f"UPDATE {SCHEMA}.networks SET provider_count = $1, last_updated = NOW() WHERE id = $2",
            provider_count, network_id,
        )

    except Exception as e:
        logger.error(f"  [{insurer_name}] Fatal error: {e}")
        error_log.append(str(e))
        total_errors += 1

    status = "completed" if total_errors == 0 else "completed_with_errors" if total_files > 0 else "failed"
    await update_crawl_job(conn, job_id, status, total_files, total_providers, total_errors, error_log)

    logger.info(
        f"  [{insurer_name}] Done: {total_files} files, "
        f"{total_providers:,} providers linked, {total_errors} errors"
    )


async def main(
    insurer_filter: str | None = None,
    seed_only: bool = False,
    max_files: int = DEFAULT_MAX_FILES,
    automatable_only: bool = False,
    include_browser: bool = False,
):
    conn = await get_db_conn()

    # Always seed known insurers
    print("Step 1: Seeding insurer registry...")
    inserted, updated = await seed_known_insurers(conn)
    print(f"  Inserted: {inserted}, Updated: {updated}")

    if seed_only:
        count = await conn.fetchval(f"SELECT count(*) FROM {SCHEMA}.insurers")
        print(f"  Total insurers: {count}")
        await conn.close()
        return

    # Load JSON config for index_type resolution
    insurer_json_index = load_insurer_json_index()

    # Get insurers to crawl
    if insurer_filter and insurer_filter != "all":
        rows = await conn.fetch(
            f"SELECT * FROM {SCHEMA}.insurers "
            f"WHERE lower(legal_name) LIKE $1 OR EXISTS ("
            f"  SELECT 1 FROM unnest(trade_names) t WHERE lower(t) LIKE $1"
            f")",
            f"%{insurer_filter.lower()}%",
        )
    else:
        rows = await conn.fetch(
            f"SELECT * FROM {SCHEMA}.insurers WHERE mrf_index_url IS NOT NULL"
        )

    # Filter to automatable insurers if requested (unless --include-browser is set)
    if automatable_only and not include_browser:
        automatable_rows = []
        for row in rows:
            json_cfg = insurer_json_index.get(row["legal_name"], {})
            idx_type = json_cfg.get("index_type", "direct_json")
            if idx_type != "browser_required":
                automatable_rows.append(row)
        skipped = len(rows) - len(automatable_rows)
        rows = automatable_rows
        if skipped:
            print(f"  Skipped {skipped} browser-required insurers")

    print(f"\nStep 2: Crawling {len(rows)} insurer(s)...")
    if max_files > 0:
        print(f"  Max files per insurer: {max_files}")
    start = time.time()

    connector = aiohttp.TCPConnector(family=2)  # AF_INET (IPv4 only)
    async with aiohttp.ClientSession(connector=connector) as session:
        async with DownloadManager(MRF_CACHE_DIR) as downloader:
            for row in rows:
                json_cfg = insurer_json_index.get(row["legal_name"])
                await crawl_insurer(
                    conn, row, session, downloader,
                    max_files=max_files, insurer_json=json_cfg,
                    include_browser=include_browser,
                )

    elapsed = time.time() - start
    print(f"\nCrawl complete in {elapsed:.0f}s")

    # Summary
    total_networks = await conn.fetchval(f"SELECT count(*) FROM {SCHEMA}.networks")
    total_plans = await conn.fetchval(f"SELECT count(*) FROM {SCHEMA}.plans")
    total_np = await conn.fetchval(f"SELECT count(*) FROM {SCHEMA}.network_providers")
    print(f"  Networks: {total_networks}")
    print(f"  Plans: {total_plans:,}")
    print(f"  Network-provider links: {total_np:,}")

    await conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ClearNetwork MRF Crawler")
    parser.add_argument("--insurer", default="all", help="Insurer name filter or 'all'")
    parser.add_argument("--seed-only", action="store_true", help="Only seed insurer registry")
    parser.add_argument("--max-files", type=int, default=DEFAULT_MAX_FILES,
                        help="Max in-network files per insurer (0=unlimited)")
    parser.add_argument("--automatable-only", action="store_true",
                        help="Skip insurers requiring browser automation")
    parser.add_argument("--include-browser", action="store_true",
                        help="Include browser-automated insurers (requires playwright)")
    args = parser.parse_args()

    asyncio.run(main(
        insurer_filter=args.insurer,
        seed_only=args.seed_only,
        max_files=args.max_files,
        automatable_only=args.automatable_only,
        include_browser=args.include_browser,
    ))
