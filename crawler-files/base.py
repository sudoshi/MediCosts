"""
Base agent class providing:
  - Async lifecycle (start → run → stop)
  - Integration with checkpoint manager, DLQ, circuit breaker
  - Structured logging
  - Graceful shutdown on signals
"""

import asyncio
import logging
import signal
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional

from ..core import (
    CheckpointManager,
    CircuitBreaker,
    DeadLetterQueue,
    ResilientHttpClient,
    DomainRateLimiter,
    RetryConfig,
)

logger = logging.getLogger("agents")


@dataclass
class AgentConfig:
    """Shared configuration for all agents."""
    db_path: str = "scraper_state.db"
    download_dir: str = "./downloads"
    output_dir: str = "./output"
    max_concurrent: int = 5
    request_timeout: float = 300.0
    default_rps: float = 2.0  # requests per second per domain


class BaseAgent(ABC):
    """
    Abstract base for all scraper agents.

    Subclasses implement:
      - discover() → find URLs to process
      - process(job) → fetch + parse one job
    """

    def __init__(self, config: Optional[AgentConfig] = None, name: str = "agent"):
        self.config = config or AgentConfig()
        self.name = name
        self.logger = logging.getLogger(f"agents.{name}")

        # Shared resilience primitives
        self.checkpoint = CheckpointManager(self.config.db_path)
        self.dlq = DeadLetterQueue(self.config.db_path)
        self.circuit_breaker = CircuitBreaker()
        self.rate_limiter = DomainRateLimiter(self.config.default_rps)

        self.http = ResilientHttpClient(
            circuit_breaker=self.circuit_breaker,
            rate_limiter=self.rate_limiter,
            timeout_seconds=self.config.request_timeout,
        )

        self._semaphore = asyncio.Semaphore(self.config.max_concurrent)
        self._shutdown = asyncio.Event()
        self._tasks: list[asyncio.Task] = []

    # ── Lifecycle ──────────────────────────────────────────────────

    async def start(self):
        """Full agent lifecycle: discover → process → report."""
        self.logger.info("[%s] Starting agent", self.name)

        # Install signal handlers for graceful shutdown
        loop = asyncio.get_event_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, self._handle_signal)

        try:
            # Reset any stale in-progress jobs from prior crash
            self.checkpoint.reset_stale_jobs()

            # Phase 1: Discover work
            await self.discover()

            # Phase 2: Process all pending/resumable jobs
            resumable = self.checkpoint.get_resumable_jobs()
            self.logger.info(
                "[%s] Found %d jobs to process", self.name, len(resumable)
            )

            tasks = []
            for job in resumable:
                if self._shutdown.is_set():
                    break
                task = asyncio.create_task(
                    self._safe_process(job), name=f"{self.name}:{job.job_id}"
                )
                tasks.append(task)

            self._tasks = tasks
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)

            # Phase 3: Report
            await self.report()

        finally:
            await self.stop()

    async def stop(self):
        """Graceful shutdown."""
        self.logger.info("[%s] Shutting down", self.name)
        self._shutdown.set()

        # Cancel outstanding tasks
        for t in self._tasks:
            if not t.done():
                t.cancel()

        await self.http.close()
        self.checkpoint.close()
        self.dlq.close()
        self.logger.info("[%s] Shutdown complete", self.name)

    def _handle_signal(self):
        self.logger.warning("[%s] Signal received, initiating shutdown", self.name)
        self._shutdown.set()

    # ── Processing wrapper ────────────────────────────────────────

    async def _safe_process(self, job):
        """Process one job with concurrency control and DLQ fallback."""
        async with self._semaphore:
            if self._shutdown.is_set():
                return

            try:
                self.checkpoint.update_job(
                    job.job_id,
                    status="in_progress",
                    attempt_count=job.attempt_count + 1,
                )
                await self.process(job)
                self.checkpoint.update_job(job.job_id, status="completed")
                self.logger.info("[%s] Completed job %s", self.name, job.job_id)

            except Exception as exc:
                self.logger.error(
                    "[%s] Failed job %s: %s", self.name, job.job_id, exc
                )
                attempt = job.attempt_count + 1
                if attempt >= 5:  # max retries exhausted → DLQ
                    self.checkpoint.update_job(
                        job.job_id,
                        status="failed",
                        last_error=str(exc)[:2000],
                    )
                    self.dlq.add(
                        job_id=job.job_id,
                        url=job.url,
                        source_type=job.source_type,
                        error=exc,
                        attempt_count=attempt,
                    )
                else:
                    self.checkpoint.update_job(
                        job.job_id,
                        status="pending",
                        last_error=str(exc)[:2000],
                        attempt_count=attempt,
                    )

    # ── Subclass interface ────────────────────────────────────────

    @abstractmethod
    async def discover(self):
        """Discover URLs / jobs and register them in checkpoint manager."""
        ...

    @abstractmethod
    async def process(self, job):
        """Process a single job (download, parse, store)."""
        ...

    async def report(self):
        """Optional: print summary after all jobs complete."""
        completed = self.checkpoint.get_jobs_by_status("completed")
        failed = self.checkpoint.get_jobs_by_status("failed")
        pending = self.checkpoint.get_resumable_jobs()
        dlq_items = self.dlq.list_all()

        self.logger.info(
            "[%s] ── Summary ──\n"
            "  Completed : %d\n"
            "  Failed    : %d\n"
            "  Pending   : %d\n"
            "  In DLQ    : %d\n"
            "  Circuits  : %s",
            self.name,
            len(completed), len(failed), len(pending), len(dlq_items),
            self.circuit_breaker.get_status(),
        )
