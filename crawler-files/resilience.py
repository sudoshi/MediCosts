"""
Core resilience primitives for fault-tolerant healthcare data scraping.

Provides:
  - ExponentialBackoffRetry: configurable retry with jitter
  - CircuitBreaker: per-domain circuit breaker (closed/open/half-open)
  - CheckpointManager: SQLite-backed checkpoint/resume for crash recovery
  - DeadLetterQueue: persistent DLQ for failed jobs with replay capability
"""

import asyncio
import hashlib
import json
import logging
import random
import sqlite3
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Optional

logger = logging.getLogger("resilience")


# ──────────────────────────────────────────────────────────────────────
# 1. EXPONENTIAL BACKOFF RETRY
# ──────────────────────────────────────────────────────────────────────

@dataclass
class RetryConfig:
    max_retries: int = 5
    base_delay: float = 1.0
    max_delay: float = 300.0  # 5 min ceiling
    exponential_base: float = 2.0
    jitter: bool = True
    retryable_exceptions: tuple = (
        ConnectionError,
        TimeoutError,
        OSError,
    )
    retryable_status_codes: tuple = (429, 500, 502, 503, 504)


class ExponentialBackoffRetry:
    """Async retry with exponential backoff + jitter."""

    def __init__(self, config: Optional[RetryConfig] = None):
        self.config = config or RetryConfig()

    def _compute_delay(self, attempt: int) -> float:
        delay = self.config.base_delay * (
            self.config.exponential_base ** attempt
        )
        delay = min(delay, self.config.max_delay)
        if self.config.jitter:
            delay = delay * (0.5 + random.random())
        return delay

    async def execute(
        self,
        coro_factory: Callable,
        *args,
        task_id: str = "unknown",
        **kwargs,
    ) -> Any:
        last_exception = None
        for attempt in range(self.config.max_retries + 1):
            try:
                return await coro_factory(*args, **kwargs)
            except self.config.retryable_exceptions as exc:
                last_exception = exc
                if attempt == self.config.max_retries:
                    break
                delay = self._compute_delay(attempt)
                logger.warning(
                    "[Retry] task=%s attempt=%d/%d error=%s delay=%.1fs",
                    task_id, attempt + 1, self.config.max_retries,
                    type(exc).__name__, delay,
                )
                await asyncio.sleep(delay)
            except Exception:
                raise  # non-retryable → propagate immediately

        raise last_exception  # type: ignore[misc]


# ──────────────────────────────────────────────────────────────────────
# 2. CIRCUIT BREAKER (per-domain)
# ──────────────────────────────────────────────────────────────────────

class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class CircuitBreakerConfig:
    failure_threshold: int = 5       # failures before opening
    recovery_timeout: float = 60.0   # seconds before half-open
    half_open_max_calls: int = 2     # probe calls in half-open
    success_threshold: int = 2       # successes to re-close


class CircuitBreakerOpen(Exception):
    """Raised when circuit is open and call is rejected."""
    def __init__(self, domain: str, retry_after: float):
        self.domain = domain
        self.retry_after = retry_after
        super().__init__(
            f"Circuit open for {domain}; retry after {retry_after:.0f}s"
        )


class CircuitBreaker:
    """Per-domain circuit breaker with closed → open → half-open → closed."""

    def __init__(self, config: Optional[CircuitBreakerConfig] = None):
        self.config = config or CircuitBreakerConfig()
        self._circuits: dict[str, dict] = {}

    def _get(self, domain: str) -> dict:
        if domain not in self._circuits:
            self._circuits[domain] = {
                "state": CircuitState.CLOSED,
                "failures": 0,
                "successes": 0,
                "last_failure_time": 0.0,
                "half_open_calls": 0,
            }
        return self._circuits[domain]

    def state(self, domain: str) -> CircuitState:
        circuit = self._get(domain)
        if circuit["state"] == CircuitState.OPEN:
            elapsed = time.monotonic() - circuit["last_failure_time"]
            if elapsed >= self.config.recovery_timeout:
                circuit["state"] = CircuitState.HALF_OPEN
                circuit["half_open_calls"] = 0
                circuit["successes"] = 0
                logger.info("[CB] %s → HALF_OPEN", domain)
        return circuit["state"]

    @asynccontextmanager
    async def protect(self, domain: str):
        """Context manager: raises CircuitBreakerOpen if open."""
        circuit = self._get(domain)
        state = self.state(domain)

        if state == CircuitState.OPEN:
            retry_after = (
                self.config.recovery_timeout
                - (time.monotonic() - circuit["last_failure_time"])
            )
            raise CircuitBreakerOpen(domain, max(0, retry_after))

        if state == CircuitState.HALF_OPEN:
            if circuit["half_open_calls"] >= self.config.half_open_max_calls:
                raise CircuitBreakerOpen(domain, self.config.recovery_timeout)
            circuit["half_open_calls"] += 1

        try:
            yield
            # success
            self._on_success(domain)
        except Exception:
            self._on_failure(domain)
            raise

    def _on_success(self, domain: str):
        circuit = self._get(domain)
        if circuit["state"] == CircuitState.HALF_OPEN:
            circuit["successes"] += 1
            if circuit["successes"] >= self.config.success_threshold:
                circuit["state"] = CircuitState.CLOSED
                circuit["failures"] = 0
                logger.info("[CB] %s → CLOSED (recovered)", domain)
        else:
            circuit["failures"] = 0

    def _on_failure(self, domain: str):
        circuit = self._get(domain)
        circuit["failures"] += 1
        circuit["last_failure_time"] = time.monotonic()
        if circuit["state"] == CircuitState.HALF_OPEN:
            circuit["state"] = CircuitState.OPEN
            logger.warning("[CB] %s → OPEN (half-open probe failed)", domain)
        elif circuit["failures"] >= self.config.failure_threshold:
            circuit["state"] = CircuitState.OPEN
            logger.warning(
                "[CB] %s → OPEN (failures=%d)", domain, circuit["failures"]
            )

    def get_status(self) -> dict[str, str]:
        return {d: self.state(d).value for d in self._circuits}


# ──────────────────────────────────────────────────────────────────────
# 3. CHECKPOINT MANAGER (SQLite-backed)
# ──────────────────────────────────────────────────────────────────────

class JobStatus(Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL = "partial"       # partially downloaded / parsed


@dataclass
class JobCheckpoint:
    job_id: str
    source_type: str          # "mrf", "chargemaster", "custom"
    url: str
    status: str = JobStatus.PENDING.value
    bytes_downloaded: int = 0
    total_bytes: int = 0
    records_parsed: int = 0
    last_error: str = ""
    metadata: str = "{}"      # JSON blob
    created_at: str = ""
    updated_at: str = ""
    attempt_count: int = 0


class CheckpointManager:
    """SQLite-backed job state for crash recovery."""

    DDL = """
    CREATE TABLE IF NOT EXISTS checkpoints (
        job_id          TEXT PRIMARY KEY,
        source_type     TEXT NOT NULL,
        url             TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'pending',
        bytes_downloaded INTEGER DEFAULT 0,
        total_bytes     INTEGER DEFAULT 0,
        records_parsed  INTEGER DEFAULT 0,
        last_error      TEXT DEFAULT '',
        metadata        TEXT DEFAULT '{}',
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL,
        attempt_count   INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_status ON checkpoints(status);
    """

    def __init__(self, db_path: str = "scraper_state.db"):
        self.db_path = db_path
        self._conn = sqlite3.connect(db_path)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(self.DDL)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA busy_timeout=5000")

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def make_job_id(url: str, source_type: str) -> str:
        h = hashlib.sha256(f"{source_type}:{url}".encode()).hexdigest()[:16]
        return f"{source_type}_{h}"

    def register_job(
        self, url: str, source_type: str, metadata: Optional[dict] = None
    ) -> JobCheckpoint:
        job_id = self.make_job_id(url, source_type)
        now = self._now()
        meta_json = json.dumps(metadata or {})
        self._conn.execute(
            """INSERT OR IGNORE INTO checkpoints
               (job_id, source_type, url, status, metadata, created_at, updated_at)
               VALUES (?, ?, ?, 'pending', ?, ?, ?)""",
            (job_id, source_type, url, meta_json, now, now),
        )
        self._conn.commit()
        return self.get_job(job_id)  # type: ignore[return-value]

    def get_job(self, job_id: str) -> Optional[JobCheckpoint]:
        row = self._conn.execute(
            "SELECT * FROM checkpoints WHERE job_id = ?", (job_id,)
        ).fetchone()
        if row:
            return JobCheckpoint(**dict(row))
        return None

    def update_job(self, job_id: str, **updates):
        updates["updated_at"] = self._now()
        sets = ", ".join(f"{k} = ?" for k in updates)
        vals = list(updates.values()) + [job_id]
        self._conn.execute(
            f"UPDATE checkpoints SET {sets} WHERE job_id = ?", vals
        )
        self._conn.commit()

    def get_resumable_jobs(self) -> list[JobCheckpoint]:
        rows = self._conn.execute(
            """SELECT * FROM checkpoints
               WHERE status IN ('pending', 'in_progress', 'partial')
               ORDER BY updated_at ASC"""
        ).fetchall()
        return [JobCheckpoint(**dict(r)) for r in rows]

    def get_jobs_by_status(self, status: str) -> list[JobCheckpoint]:
        rows = self._conn.execute(
            "SELECT * FROM checkpoints WHERE status = ?", (status,)
        ).fetchall()
        return [JobCheckpoint(**dict(r)) for r in rows]

    def reset_stale_jobs(self, max_age_seconds: int = 3600):
        """Reset in_progress jobs older than max_age (crashed workers)."""
        cutoff = datetime.now(timezone.utc).timestamp() - max_age_seconds
        self._conn.execute(
            """UPDATE checkpoints SET status = 'pending'
               WHERE status = 'in_progress'
               AND updated_at < datetime(?, 'unixepoch')""",
            (cutoff,),
        )
        self._conn.commit()

    def close(self):
        self._conn.close()


# ──────────────────────────────────────────────────────────────────────
# 4. DEAD LETTER QUEUE (SQLite-backed)
# ──────────────────────────────────────────────────────────────────────

@dataclass
class DeadLetter:
    id: int
    job_id: str
    url: str
    source_type: str
    error_type: str
    error_message: str
    attempt_count: int
    created_at: str
    metadata: str = "{}"


class DeadLetterQueue:
    """Persistent DLQ for permanently failed jobs, with replay."""

    DDL = """
    CREATE TABLE IF NOT EXISTS dead_letters (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id          TEXT NOT NULL,
        url             TEXT NOT NULL,
        source_type     TEXT NOT NULL,
        error_type      TEXT NOT NULL,
        error_message   TEXT NOT NULL,
        attempt_count   INTEGER DEFAULT 0,
        metadata        TEXT DEFAULT '{}',
        created_at      TEXT NOT NULL
    );
    """

    def __init__(self, db_path: str = "scraper_state.db"):
        self._conn = sqlite3.connect(db_path)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(self.DDL)

    def add(
        self,
        job_id: str,
        url: str,
        source_type: str,
        error: Exception,
        attempt_count: int = 0,
        metadata: Optional[dict] = None,
    ):
        self._conn.execute(
            """INSERT INTO dead_letters
               (job_id, url, source_type, error_type, error_message,
                attempt_count, metadata, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                job_id, url, source_type,
                type(error).__name__, str(error)[:2000],
                attempt_count,
                json.dumps(metadata or {}),
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        self._conn.commit()
        logger.error("[DLQ] Added job=%s url=%s error=%s", job_id, url, error)

    def list_all(self) -> list[DeadLetter]:
        rows = self._conn.execute(
            "SELECT * FROM dead_letters ORDER BY created_at DESC"
        ).fetchall()
        return [DeadLetter(**dict(r)) for r in rows]

    def replay(self, dlq_id: int, checkpoint_mgr: CheckpointManager):
        """Move a dead letter back to pending for retry."""
        row = self._conn.execute(
            "SELECT * FROM dead_letters WHERE id = ?", (dlq_id,)
        ).fetchone()
        if not row:
            raise ValueError(f"DLQ entry {dlq_id} not found")
        dl = DeadLetter(**dict(row))
        checkpoint_mgr.update_job(dl.job_id, status="pending", last_error="")
        self._conn.execute("DELETE FROM dead_letters WHERE id = ?", (dlq_id,))
        self._conn.commit()
        logger.info("[DLQ] Replayed id=%d job=%s", dlq_id, dl.job_id)

    def replay_all(self, checkpoint_mgr: CheckpointManager) -> int:
        letters = self.list_all()
        for dl in letters:
            self.replay(dl.id, checkpoint_mgr)
        return len(letters)

    def purge(self):
        self._conn.execute("DELETE FROM dead_letters")
        self._conn.commit()

    def close(self):
        self._conn.close()
