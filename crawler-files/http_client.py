"""
Resilient async HTTP client with:
  - Per-domain rate limiting (adaptive to Retry-After headers)
  - Streaming downloads with progress tracking
  - Circuit breaker integration
  - Checkpoint-aware resume (Range header support)
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import AsyncIterator, Optional
from urllib.parse import urlparse

import aiohttp

from .resilience import (
    CircuitBreaker,
    CircuitBreakerOpen,
    CheckpointManager,
    ExponentialBackoffRetry,
    RetryConfig,
)

logger = logging.getLogger("http_client")


@dataclass
class RateLimitState:
    tokens: float = 10.0
    max_tokens: float = 10.0
    refill_rate: float = 2.0   # tokens/sec
    last_refill: float = field(default_factory=time.monotonic)
    retry_after_until: float = 0.0  # monotonic time when Retry-After expires


class DomainRateLimiter:
    """Token-bucket rate limiter per domain, adaptive to 429 responses."""

    def __init__(self, default_rps: float = 2.0):
        self._domains: dict[str, RateLimitState] = {}
        self._default_rps = default_rps
        self._lock = asyncio.Lock()

    def _get(self, domain: str) -> RateLimitState:
        if domain not in self._domains:
            self._domains[domain] = RateLimitState(
                refill_rate=self._default_rps
            )
        return self._domains[domain]

    async def acquire(self, domain: str):
        async with self._lock:
            state = self._get(domain)

            # Honor Retry-After
            now = time.monotonic()
            if now < state.retry_after_until:
                wait = state.retry_after_until - now
                logger.info("[RL] %s: Retry-After wait %.1fs", domain, wait)
                await asyncio.sleep(wait)
                now = time.monotonic()

            # Refill tokens
            elapsed = now - state.last_refill
            state.tokens = min(
                state.max_tokens,
                state.tokens + elapsed * state.refill_rate,
            )
            state.last_refill = now

            if state.tokens < 1.0:
                wait = (1.0 - state.tokens) / state.refill_rate
                await asyncio.sleep(wait)
                state.tokens = 1.0
                state.last_refill = time.monotonic()

            state.tokens -= 1.0

    def record_retry_after(self, domain: str, seconds: float):
        state = self._get(domain)
        state.retry_after_until = time.monotonic() + seconds
        # Also slow down future requests
        state.refill_rate = max(0.1, state.refill_rate * 0.5)
        logger.warning(
            "[RL] %s: slowed to %.2f req/s due to 429", domain, state.refill_rate
        )


@dataclass
class DownloadResult:
    """Result of a streaming download."""
    path: Path
    total_bytes: int
    content_type: str
    resumed: bool = False


class ResilientHttpClient:
    """
    Async HTTP client combining:
      - aiohttp session management
      - per-domain rate limiting
      - circuit breaker
      - exponential backoff retry
      - streaming download with checkpoint resume
    """

    def __init__(
        self,
        circuit_breaker: CircuitBreaker,
        rate_limiter: Optional[DomainRateLimiter] = None,
        retry_config: Optional[RetryConfig] = None,
        timeout_seconds: float = 300.0,
        chunk_size: int = 1024 * 256,  # 256 KB chunks
        max_connections: int = 20,
    ):
        self.cb = circuit_breaker
        self.rl = rate_limiter or DomainRateLimiter()
        self.retry = ExponentialBackoffRetry(retry_config)
        self.timeout = aiohttp.ClientTimeout(total=timeout_seconds)
        self.chunk_size = chunk_size
        self._session: Optional[aiohttp.ClientSession] = None
        self._max_conn = max_connections

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            connector = aiohttp.TCPConnector(
                limit=self._max_conn,
                enable_cleanup_closed=True,
            )
            self._session = aiohttp.ClientSession(
                connector=connector,
                timeout=self.timeout,
                headers={
                    "User-Agent": (
                        "HealthcareTransparencyBot/1.0 "
                        "(CMS MRF compliance data collection; "
                        "contact: admin@example.com)"
                    ),
                    "Accept-Encoding": "gzip, deflate",
                },
            )
        return self._session

    @staticmethod
    def _domain(url: str) -> str:
        return urlparse(url).netloc

    async def fetch_json(self, url: str) -> dict:
        """Fetch JSON with full resilience stack."""
        domain = self._domain(url)

        async def _do_fetch():
            await self.rl.acquire(domain)
            async with self.cb.protect(domain):
                session = await self._get_session()
                async with session.get(url) as resp:
                    if resp.status == 429:
                        retry_after = float(
                            resp.headers.get("Retry-After", "60")
                        )
                        self.rl.record_retry_after(domain, retry_after)
                        raise ConnectionError(f"429 from {domain}")
                    resp.raise_for_status()
                    return await resp.json(content_type=None)

        return await self.retry.execute(_do_fetch, task_id=url)

    async def fetch_text(self, url: str) -> str:
        """Fetch text content with resilience."""
        domain = self._domain(url)

        async def _do_fetch():
            await self.rl.acquire(domain)
            async with self.cb.protect(domain):
                session = await self._get_session()
                async with session.get(url) as resp:
                    if resp.status == 429:
                        retry_after = float(
                            resp.headers.get("Retry-After", "60")
                        )
                        self.rl.record_retry_after(domain, retry_after)
                        raise ConnectionError(f"429 from {domain}")
                    resp.raise_for_status()
                    return await resp.text()

        return await self.retry.execute(_do_fetch, task_id=url)

    async def stream_download(
        self,
        url: str,
        dest: Path,
        checkpoint_mgr: Optional[CheckpointManager] = None,
        job_id: Optional[str] = None,
        progress_callback: Optional[callable] = None,
    ) -> DownloadResult:
        """
        Streaming download with resume support.
        If dest already has partial content, sends Range header to resume.
        """
        domain = self._domain(url)
        dest.parent.mkdir(parents=True, exist_ok=True)

        existing_bytes = dest.stat().st_size if dest.exists() else 0
        resumed = existing_bytes > 0

        async def _do_download():
            await self.rl.acquire(domain)
            async with self.cb.protect(domain):
                session = await self._get_session()
                headers = {}
                if existing_bytes > 0:
                    headers["Range"] = f"bytes={existing_bytes}-"
                    logger.info(
                        "[DL] Resuming %s from byte %d", url, existing_bytes
                    )

                async with session.get(url, headers=headers) as resp:
                    if resp.status == 429:
                        retry_after = float(
                            resp.headers.get("Retry-After", "60")
                        )
                        self.rl.record_retry_after(domain, retry_after)
                        raise ConnectionError(f"429 from {domain}")

                    if resp.status == 416:
                        # Range not satisfiable → file already complete
                        return DownloadResult(
                            path=dest,
                            total_bytes=existing_bytes,
                            content_type=resp.headers.get(
                                "Content-Type", "unknown"
                            ),
                            resumed=True,
                        )

                    resp.raise_for_status()

                    content_type = resp.headers.get("Content-Type", "unknown")
                    total = resp.content_length
                    if total and resp.status == 206:  # partial content
                        total += existing_bytes

                    mode = "ab" if resp.status == 206 else "wb"
                    downloaded = existing_bytes if resp.status == 206 else 0

                    with open(dest, mode) as f:
                        async for chunk in resp.content.iter_chunked(
                            self.chunk_size
                        ):
                            f.write(chunk)
                            downloaded += len(chunk)

                            if progress_callback:
                                progress_callback(downloaded, total)

                            # Periodic checkpoint
                            if (
                                checkpoint_mgr
                                and job_id
                                and downloaded % (5 * 1024 * 1024) < self.chunk_size
                            ):
                                checkpoint_mgr.update_job(
                                    job_id,
                                    bytes_downloaded=downloaded,
                                    total_bytes=total or 0,
                                    status="in_progress",
                                )

                    return DownloadResult(
                        path=dest,
                        total_bytes=downloaded,
                        content_type=content_type,
                        resumed=resumed,
                    )

        return await self.retry.execute(_do_download, task_id=url)

    async def head(self, url: str) -> dict:
        """HEAD request to check resource metadata."""
        domain = self._domain(url)
        await self.rl.acquire(domain)
        session = await self._get_session()
        async with session.head(url, allow_redirects=True) as resp:
            return {
                "status": resp.status,
                "content_type": resp.headers.get("Content-Type", ""),
                "content_length": resp.content_length,
                "url": str(resp.url),  # after redirects
            }

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()
