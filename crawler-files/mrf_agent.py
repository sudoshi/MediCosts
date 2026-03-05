"""
MRF Agent — CMS Machine-Readable File scraper.

CMS Transparency in Coverage rule requires payers to publish:
  - in-network rates
  - allowed amounts
  - prescription drug pricing

These are published as JSON/CSV files, often 1-50+ GB, linked from
a table-of-contents JSON at a well-known URL.

This agent:
  1. Discovers MRF URLs from payer TOC indexes
  2. Streams downloads with checkpoint/resume
  3. Parses with ijson (streaming JSON) to extract rate data
  4. Outputs normalized CSV for downstream analysis
"""

import asyncio
import csv
import json
import logging
from pathlib import Path
from typing import Optional

from .base import BaseAgent, AgentConfig
from ..core import JobCheckpoint

logger = logging.getLogger("agents.mrf")

# Example well-known TOC URLs (real payers publish these)
DEFAULT_PAYER_TOC_URLS = [
    # Add actual payer TOC URLs here. Examples:
    # "https://transparency-in-coverage.uhc.com/api/v1/uhc/blobs/",
    # "https://www.cigna.com/static/www-cigna-com/docs/transparency-in-coverage-mrf.json",
]


class MRFAgent(BaseAgent):
    """
    Scrapes CMS Machine-Readable Files (in-network rates, allowed amounts).

    Flow:
      discover() → fetch TOC JSON → register each MRF file URL as a job
      process()  → stream-download MRF → parse with streaming JSON/CSV
                 → write normalized output
    """

    def __init__(
        self,
        payer_toc_urls: Optional[list[str]] = None,
        config: Optional[AgentConfig] = None,
    ):
        super().__init__(config=config, name="mrf_agent")
        self.toc_urls = payer_toc_urls or DEFAULT_PAYER_TOC_URLS
        self.download_dir = Path(self.config.download_dir) / "mrf"
        self.output_dir = Path(self.config.output_dir) / "mrf"
        self.download_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    async def discover(self):
        """
        Fetch each payer's table-of-contents JSON and register
        individual MRF file URLs as jobs.
        """
        for toc_url in self.toc_urls:
            if self._shutdown.is_set():
                break
            try:
                self.logger.info("Fetching TOC: %s", toc_url)
                toc = await self.http.fetch_json(toc_url)
                mrf_urls = self._extract_mrf_urls(toc)
                self.logger.info(
                    "Found %d MRF files from %s", len(mrf_urls), toc_url
                )
                for url, meta in mrf_urls:
                    self.checkpoint.register_job(
                        url=url,
                        source_type="mrf",
                        metadata={
                            "toc_url": toc_url,
                            "description": meta.get("description", ""),
                            "file_type": meta.get("file_type", "unknown"),
                        },
                    )
            except Exception as exc:
                self.logger.error("Failed to fetch TOC %s: %s", toc_url, exc)
                # Register the TOC itself as a failed job for retry
                job = self.checkpoint.register_job(
                    url=toc_url, source_type="mrf_toc",
                    metadata={"error": str(exc)},
                )
                self.checkpoint.update_job(
                    job.job_id, status="failed", last_error=str(exc)
                )

    def _extract_mrf_urls(self, toc: dict) -> list[tuple[str, dict]]:
        """
        Extract MRF file URLs from a TOC JSON.

        CMS TOC format typically has:
          reporting_entity_name, reporting_entity_type,
          reporting_structure[].in_network_files[].{location, description}
        """
        results = []

        # Standard CMS TOC format
        for structure in toc.get("reporting_structure", []):
            for file_entry in structure.get("in_network_files", []):
                url = file_entry.get("location", "")
                if url:
                    results.append((url, {
                        "description": file_entry.get("description", ""),
                        "file_type": "in_network",
                    }))

            for file_entry in structure.get("allowed_amount_file", []):
                url = file_entry.get("location", "")
                if url:
                    results.append((url, {
                        "description": file_entry.get("description", ""),
                        "file_type": "allowed_amount",
                    }))

        # Some payers use a flat list
        if not results and isinstance(toc, list):
            for entry in toc:
                if isinstance(entry, dict) and "url" in entry:
                    results.append((entry["url"], entry))

        return results

    async def process(self, job: JobCheckpoint):
        """Download and parse a single MRF file."""
        dest = self.download_dir / self._safe_filename(job.url)

        # Step 1: Stream download with resume
        result = await self.http.stream_download(
            url=job.url,
            dest=dest,
            checkpoint_mgr=self.checkpoint,
            job_id=job.job_id,
            progress_callback=lambda dl, total: self.logger.debug(
                "[MRF] %s: %.1f MB / %s",
                job.job_id,
                dl / 1e6,
                f"{total / 1e6:.1f} MB" if total else "unknown",
            ),
        )

        self.logger.info(
            "[MRF] Downloaded %s → %s (%.1f MB, resumed=%s)",
            job.job_id, dest, result.total_bytes / 1e6, result.resumed,
        )

        self.checkpoint.update_job(
            job.job_id,
            bytes_downloaded=result.total_bytes,
            total_bytes=result.total_bytes,
        )

        # Step 2: Parse (streaming)
        meta = json.loads(job.metadata)
        output_path = self.output_dir / f"{job.job_id}_rates.csv"

        if result.content_type and "json" in result.content_type.lower():
            await self._parse_json_mrf(dest, output_path, job)
        elif str(dest).endswith((".csv", ".csv.gz")):
            await self._parse_csv_mrf(dest, output_path, job)
        else:
            # Try JSON first, fall back to CSV
            try:
                await self._parse_json_mrf(dest, output_path, job)
            except Exception:
                await self._parse_csv_mrf(dest, output_path, job)

    async def _parse_json_mrf(
        self, src: Path, dest: Path, job: JobCheckpoint
    ):
        """
        Stream-parse a JSON MRF file using ijson.

        MRF JSON structure (simplified):
        {
          "reporting_entity_name": "...",
          "in_network": [
            {
              "billing_code_type": "CPT",
              "billing_code": "99213",
              "name": "Office visit",
              "negotiated_rates": [
                {
                  "provider_references": [...],
                  "negotiated_prices": [
                    {"negotiated_rate": 125.00, "negotiated_type": "negotiated", ...}
                  ]
                }
              ]
            }
          ]
        }
        """
        # Run blocking ijson parse in executor to avoid blocking event loop
        loop = asyncio.get_event_loop()
        records = await loop.run_in_executor(
            None, self._ijson_extract_rates, src
        )
        await self._write_rates_csv(dest, records, job)

    @staticmethod
    def _ijson_extract_rates(src: Path) -> list[dict]:
        """
        Use ijson for memory-efficient streaming parse.
        Falls back to chunked JSON if ijson not available.
        """
        records = []
        max_records = 100_000  # safety cap per file; adjust as needed

        try:
            import ijson

            with open(src, "rb") as f:
                # Stream in-network items
                parser = ijson.items(f, "in_network.item")
                for item in parser:
                    billing_code = item.get("billing_code", "")
                    billing_code_type = item.get("billing_code_type", "")
                    name = item.get("name", "")

                    for rate_group in item.get("negotiated_rates", []):
                        for price in rate_group.get("negotiated_prices", []):
                            records.append({
                                "billing_code_type": billing_code_type,
                                "billing_code": billing_code,
                                "name": name,
                                "negotiated_rate": price.get(
                                    "negotiated_rate", ""
                                ),
                                "negotiated_type": price.get(
                                    "negotiated_type", ""
                                ),
                                "service_code": ",".join(
                                    str(s) for s in price.get(
                                        "service_code", []
                                    )
                                ),
                                "billing_class": price.get(
                                    "billing_class", ""
                                ),
                                "expiration_date": price.get(
                                    "expiration_date", ""
                                ),
                            })
                            if len(records) >= max_records:
                                return records

        except ImportError:
            logger.warning("ijson not installed; falling back to json.load")
            with open(src) as f:
                data = json.load(f)
            for item in data.get("in_network", [])[:1000]:
                billing_code = item.get("billing_code", "")
                for rate_group in item.get("negotiated_rates", []):
                    for price in rate_group.get("negotiated_prices", []):
                        records.append({
                            "billing_code_type": item.get(
                                "billing_code_type", ""
                            ),
                            "billing_code": billing_code,
                            "name": item.get("name", ""),
                            "negotiated_rate": price.get(
                                "negotiated_rate", ""
                            ),
                            "negotiated_type": price.get(
                                "negotiated_type", ""
                            ),
                            "service_code": "",
                            "billing_class": price.get("billing_class", ""),
                            "expiration_date": price.get(
                                "expiration_date", ""
                            ),
                        })

        return records

    async def _parse_csv_mrf(
        self, src: Path, dest: Path, job: JobCheckpoint
    ):
        """Parse a CSV-format MRF file."""
        loop = asyncio.get_event_loop()
        records = await loop.run_in_executor(
            None, self._csv_extract_rates, src
        )
        await self._write_rates_csv(dest, records, job)

    @staticmethod
    def _csv_extract_rates(src: Path) -> list[dict]:
        records = []
        import gzip

        opener = gzip.open if str(src).endswith(".gz") else open
        with opener(src, "rt", errors="replace") as f:
            reader = csv.DictReader(f)
            for i, row in enumerate(reader):
                records.append(row)
                if i >= 100_000:
                    break
        return records

    async def _write_rates_csv(
        self, dest: Path, records: list[dict], job: JobCheckpoint
    ):
        if not records:
            self.logger.warning("[MRF] No records parsed from %s", job.job_id)
            return

        fieldnames = list(records[0].keys())
        with open(dest, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(records)

        self.checkpoint.update_job(
            job.job_id, records_parsed=len(records)
        )
        self.logger.info(
            "[MRF] Wrote %d records → %s", len(records), dest
        )

    @staticmethod
    def _safe_filename(url: str) -> str:
        import hashlib
        from urllib.parse import urlparse

        parsed = urlparse(url)
        name = Path(parsed.path).name or "index"
        h = hashlib.sha256(url.encode()).hexdigest()[:8]
        return f"{h}_{name}"
