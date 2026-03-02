"""Crawl Pipeline Orchestrator — coordinates the full MRF crawl pipeline.

Usage:
    python -m crawler.orchestrator                    # Crawl all insurers
    python -m crawler.orchestrator --insurer=aetna    # Crawl specific insurer
    python -m crawler.orchestrator --seed-only        # Only seed insurer registry
"""
import argparse
import asyncio
import logging
import os
import sys
import time
import uuid
from pathlib import Path

import aiohttp
import asyncpg
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from crawler.discovery import seed_known_insurers
from crawler.downloader import DownloadManager
from crawler.mrf_index import fetch_and_parse_index, store_index_results
from crawler.mrf_parser import extract_npis_from_file, upsert_network_providers

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

SCHEMA = "clearnetwork"
MRF_CACHE_DIR = Path(__file__).resolve().parents[2] / "data" / "mrf_cache"


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
    import json
    await conn.execute(
        f"""
        UPDATE {SCHEMA}.crawl_jobs SET
            status = $1, completed_at = NOW(),
            files_processed = $2, providers_found = $3,
            errors = $4, error_log = $5
        WHERE id = $6
        """,
        status, files, providers, errors,
        json.dumps(error_log) if error_log else None,
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


async def crawl_insurer(conn, insurer_row, session: aiohttp.ClientSession, downloader: DownloadManager):
    """Full crawl pipeline for a single insurer."""
    insurer_id = insurer_row["id"]
    insurer_name = insurer_row["legal_name"]
    mrf_url = insurer_row["mrf_index_url"]

    if not mrf_url:
        logger.warning(f"  [{insurer_name}] No MRF index URL — skipping")
        return

    logger.info(f"  [{insurer_name}] Fetching MRF index: {mrf_url[:80]}...")
    job_id = await create_crawl_job(conn, insurer_id)

    total_files = 0
    total_providers = 0
    total_errors = 0
    error_log = []

    try:
        # Step 1: Parse MRF index
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

        # Step 2: Store index results (plans + network)
        network_id, plans_inserted, file_count = await store_index_results(
            conn, insurer_id, index_result
        )
        logger.info(f"    Stored {plans_inserted} plans, network_id={network_id}")

        # Step 3: Download and parse in-network files (limit to first 5 for safety)
        urls_to_process = index_result.in_network_urls[:5]
        if len(index_result.in_network_urls) > 5:
            logger.info(
                f"    Limiting to first 5 of {len(index_result.in_network_urls)} files "
                f"(full crawl can be enabled later)"
            )

        for url in urls_to_process:
            try:
                logger.info(f"    Downloading: {url[:80]}...")
                result = await downloader.download(url)

                if not result.success:
                    logger.warning(f"    Download failed: {result.error}")
                    await log_failure(conn, job_id, url, result.error or "unknown")
                    total_errors += 1
                    continue

                if result.path is None:
                    continue  # duplicate

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


async def main(insurer_filter: str | None = None, seed_only: bool = False):
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

    print(f"\nStep 2: Crawling {len(rows)} insurer(s)...")
    start = time.time()

    connector = aiohttp.TCPConnector(family=2)  # AF_INET (IPv4 only)
    async with aiohttp.ClientSession(connector=connector) as session:
        async with DownloadManager(MRF_CACHE_DIR) as downloader:
            for row in rows:
                await crawl_insurer(conn, row, session, downloader)

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
    args = parser.parse_args()

    asyncio.run(main(insurer_filter=args.insurer, seed_only=args.seed_only))
