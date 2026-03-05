"""
Custom URL Agent — Scrape arbitrary healthcare cost data endpoints.

Handles user-provided URLs and API endpoints with configurable parsing.
Supports JSON APIs, CSV downloads, and paginated endpoints.
"""

import asyncio
import csv
import json
import logging
from pathlib import Path
from typing import Any, Optional

from .base import BaseAgent, AgentConfig
from ..core import JobCheckpoint

logger = logging.getLogger("agents.custom")


class CustomURLAgent(BaseAgent):
    """
    Flexible agent for scraping user-specified healthcare data URLs.

    Each target is a dict:
      {
        "url": "https://api.example.com/rates",
        "name": "example_rates",
        "type": "json_api" | "csv_download" | "paginated_api",
        "method": "GET" | "POST",
        "headers": {},
        "params": {},
        "pagination": {
            "type": "offset" | "cursor" | "page",
            "param": "offset",
            "page_size": 100,
            "max_pages": 50
        },
        "jq_path": "data.results",  # dot-notation path to records
        "output_name": "my_rates"
      }
    """

    def __init__(
        self,
        targets: Optional[list[dict]] = None,
        config: Optional[AgentConfig] = None,
    ):
        super().__init__(config=config, name="custom_agent")
        self._targets = targets or []
        self.download_dir = Path(self.config.download_dir) / "custom"
        self.output_dir = Path(self.config.output_dir) / "custom"
        self.download_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    async def discover(self):
        """Register each target URL as a job."""
        for target in self._targets:
            url = target.get("url", "")
            if not url:
                continue
            self.checkpoint.register_job(
                url=url,
                source_type="custom",
                metadata=target,
            )
        self.logger.info(
            "Registered %d custom URL jobs", len(self._targets)
        )

    async def process(self, job: JobCheckpoint):
        meta = json.loads(job.metadata)
        target_type = meta.get("type", "json_api")
        output_name = meta.get("output_name", job.job_id)
        output_path = self.output_dir / f"{output_name}.csv"

        if target_type == "csv_download":
            await self._process_csv_download(job, meta, output_path)
        elif target_type == "paginated_api":
            await self._process_paginated_api(job, meta, output_path)
        else:
            await self._process_json_api(job, meta, output_path)

    async def _process_json_api(
        self, job: JobCheckpoint, meta: dict, output_path: Path
    ):
        """Fetch a JSON API endpoint and extract records."""
        data = await self.http.fetch_json(job.url)
        records = self._extract_records(data, meta.get("jq_path", ""))

        if records:
            self._write_csv(output_path, records)
            self.checkpoint.update_job(
                job.job_id, records_parsed=len(records)
            )
            self.logger.info(
                "[Custom] JSON API: %d records → %s", len(records), output_path
            )

    async def _process_csv_download(
        self, job: JobCheckpoint, meta: dict, output_path: Path
    ):
        """Download a CSV file."""
        dest = self.download_dir / f"{job.job_id}.csv"
        result = await self.http.stream_download(
            url=job.url,
            dest=dest,
            checkpoint_mgr=self.checkpoint,
            job_id=job.job_id,
        )

        # Copy/normalize to output
        import shutil
        shutil.copy2(dest, output_path)
        self.checkpoint.update_job(
            job.job_id, bytes_downloaded=result.total_bytes
        )
        self.logger.info(
            "[Custom] CSV download: %.1f MB → %s",
            result.total_bytes / 1e6, output_path,
        )

    async def _process_paginated_api(
        self, job: JobCheckpoint, meta: dict, output_path: Path
    ):
        """Fetch a paginated API endpoint."""
        pagination = meta.get("pagination", {})
        pag_type = pagination.get("type", "offset")
        param = pagination.get("param", "offset")
        page_size = pagination.get("page_size", 100)
        max_pages = pagination.get("max_pages", 50)

        all_records = []
        jq_path = meta.get("jq_path", "")

        for page in range(max_pages):
            if self._shutdown.is_set():
                break

            # Build URL with pagination params
            sep = "&" if "?" in job.url else "?"
            if pag_type == "offset":
                url = f"{job.url}{sep}{param}={page * page_size}&limit={page_size}"
            elif pag_type == "page":
                url = f"{job.url}{sep}{param}={page + 1}&per_page={page_size}"
            elif pag_type == "cursor":
                if page == 0:
                    url = f"{job.url}{sep}limit={page_size}"
                else:
                    # Use cursor from last response
                    url = f"{job.url}{sep}{param}={cursor}&limit={page_size}"
            else:
                url = job.url

            try:
                data = await self.http.fetch_json(url)
            except Exception as exc:
                self.logger.warning(
                    "[Custom] Pagination stopped at page %d: %s", page, exc
                )
                break

            records = self._extract_records(data, jq_path)
            if not records:
                break

            all_records.extend(records)
            self.logger.debug(
                "[Custom] Page %d: %d records (total: %d)",
                page, len(records), len(all_records),
            )

            # For cursor-based pagination, extract next cursor
            if pag_type == "cursor":
                cursor = self._extract_value(
                    data,
                    pagination.get("cursor_path", "next_cursor"),
                )
                if not cursor:
                    break

            # If we got fewer than page_size, we're done
            if len(records) < page_size:
                break

        if all_records:
            self._write_csv(output_path, all_records)
            self.checkpoint.update_job(
                job.job_id, records_parsed=len(all_records)
            )
            self.logger.info(
                "[Custom] Paginated API: %d records → %s",
                len(all_records), output_path,
            )

    def _extract_records(
        self, data: Any, jq_path: str
    ) -> list[dict]:
        """Extract records from a JSON response using dot-notation path."""
        if not jq_path:
            if isinstance(data, list):
                return data
            if isinstance(data, dict):
                # Try common patterns
                for key in ("data", "results", "items", "records", "rows"):
                    if key in data and isinstance(data[key], list):
                        return data[key]
            return [data] if isinstance(data, dict) else []

        # Navigate dot path
        obj = data
        for part in jq_path.split("."):
            if isinstance(obj, dict):
                obj = obj.get(part, {})
            elif isinstance(obj, list) and part.isdigit():
                obj = obj[int(part)]
            else:
                return []

        return obj if isinstance(obj, list) else [obj]

    def _extract_value(self, data: Any, path: str) -> Optional[str]:
        obj = data
        for part in path.split("."):
            if isinstance(obj, dict):
                obj = obj.get(part)
            else:
                return None
        return str(obj) if obj else None

    @staticmethod
    def _write_csv(path: Path, records: list[dict]):
        if not records:
            return
        # Flatten nested dicts
        flat_records = []
        for rec in records:
            flat = {}
            for k, v in rec.items():
                if isinstance(v, (dict, list)):
                    flat[k] = json.dumps(v)
                else:
                    flat[k] = v
            flat_records.append(flat)

        # Union of all keys
        all_keys = []
        seen = set()
        for rec in flat_records:
            for k in rec:
                if k not in seen:
                    all_keys.append(k)
                    seen.add(k)

        with open(path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=all_keys, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(flat_records)
