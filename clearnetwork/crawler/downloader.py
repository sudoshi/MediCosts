"""Async download manager for MRF files.

Handles streaming downloads, resumption, rate limiting, and deduplication.
"""
import asyncio
import gzip
import hashlib
import logging
import os
import tempfile
import time
from pathlib import Path

import aiohttp

logger = logging.getLogger(__name__)

# Default settings
MAX_CONCURRENT = 10
REQUEST_TIMEOUT = aiohttp.ClientTimeout(total=3600, connect=30)
MAX_RETRIES = 3
BACKOFF_BASE = 2


class DownloadResult:
    def __init__(self, url: str, path: Path | None, size: int, content_hash: str | None,
                 error: str | None = None):
        self.url = url
        self.path = path
        self.size = size
        self.content_hash = content_hash
        self.error = error
        self.success = error is None


class DownloadManager:
    """Async download manager with streaming, dedup, and retry."""

    def __init__(self, cache_dir: Path, max_concurrent: int = MAX_CONCURRENT):
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.seen_hashes: set[str] = set()
        self.session: aiohttp.ClientSession | None = None

    async def __aenter__(self):
        connector = aiohttp.TCPConnector(family=2)  # AF_INET (IPv4 only)
        self.session = aiohttp.ClientSession(timeout=REQUEST_TIMEOUT, connector=connector)
        return self

    async def __aexit__(self, *args):
        if self.session:
            await self.session.close()

    async def download(self, url: str, filename: str | None = None) -> DownloadResult:
        """Download a file with retry and streaming."""
        async with self.semaphore:
            return await self._download_with_retry(url, filename)

    async def _download_with_retry(self, url: str, filename: str | None) -> DownloadResult:
        last_error = None
        for attempt in range(MAX_RETRIES):
            try:
                return await self._stream_download(url, filename)
            except Exception as e:
                last_error = str(e)
                if attempt < MAX_RETRIES - 1:
                    delay = BACKOFF_BASE ** attempt + (hash(url) % 1000) / 1000
                    logger.warning(f"Retry {attempt + 1}/{MAX_RETRIES} for {url}: {e}")
                    await asyncio.sleep(delay)

        return DownloadResult(url=url, path=None, size=0, content_hash=None,
                              error=f"Failed after {MAX_RETRIES} retries: {last_error}")

    async def _stream_download(self, url: str, filename: str | None) -> DownloadResult:
        """Stream-download a URL to disk, computing hash as we go."""
        if not self.session:
            raise RuntimeError("DownloadManager not initialized. Use async with.")

        async with self.session.get(url, allow_redirects=True) as resp:
            resp.raise_for_status()

            # Determine output filename
            if not filename:
                filename = hashlib.md5(url.encode()).hexdigest()[:16]

            out_path = self.cache_dir / filename
            hasher = hashlib.md5()
            size = 0

            # Check if gzip-compressed
            is_gzip = (
                url.endswith(".gz")
                or resp.headers.get("content-encoding") == "gzip"
                or resp.content_type == "application/gzip"
            )

            with open(out_path, "wb") as f:
                async for chunk in resp.content.iter_chunked(65536):
                    hasher.update(chunk)
                    f.write(chunk)
                    size += len(chunk)

            content_hash = hasher.hexdigest()

            # Decompress if gzip
            if is_gzip and out_path.suffix == ".gz":
                decompressed_path = out_path.with_suffix("")
                with gzip.open(out_path, "rb") as gz, open(decompressed_path, "wb") as out:
                    while True:
                        chunk = gz.read(65536)
                        if not chunk:
                            break
                        out.write(chunk)
                out_path.unlink()
                out_path = decompressed_path

            # Check for duplicate
            if content_hash in self.seen_hashes:
                out_path.unlink(missing_ok=True)
                logger.info(f"Duplicate content skipped: {url}")
                return DownloadResult(url=url, path=None, size=size, content_hash=content_hash,
                                      error="duplicate")

            self.seen_hashes.add(content_hash)
            return DownloadResult(url=url, path=out_path, size=size, content_hash=content_hash)

    async def download_many(self, urls: list[str]) -> list[DownloadResult]:
        """Download multiple URLs concurrently."""
        tasks = [self.download(url) for url in urls]
        return await asyncio.gather(*tasks)
