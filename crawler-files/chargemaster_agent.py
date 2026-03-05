"""
Chargemaster Agent — Hospital Price Transparency scraper.

CMS Hospital Price Transparency rule requires hospitals to publish:
  - A machine-readable file with ALL items and services
  - Payer-specific negotiated charges
  - De-identified minimum and maximum negotiated charges
  - Discounted cash prices
  - Gross charges

Typically published as CSV, JSON, or XML files.

This agent:
  1. Discovers chargemaster URLs from a registry of hospital systems
  2. Downloads and normalizes into a standard schema
  3. Outputs unified CSV with: hospital, code_type, code, description,
     gross_charge, cash_price, min_negotiated, max_negotiated, payer, plan
"""

import asyncio
import csv
import json
import logging
from pathlib import Path
from typing import Optional

from .base import BaseAgent, AgentConfig
from ..core import JobCheckpoint

logger = logging.getLogger("agents.chargemaster")

# Standard output schema
CHARGEMASTER_FIELDS = [
    "hospital_name",
    "hospital_npi",
    "ein",
    "code_type",       # CPT, HCPCS, DRG, NDC, local
    "code",
    "description",
    "rev_code",
    "gross_charge",
    "discounted_cash_price",
    "min_negotiated_rate",
    "max_negotiated_rate",
    "payer_name",
    "plan_name",
    "negotiated_rate",
    "rate_type",       # negotiated, derived, etc.
    "source_url",
]


class ChargemasterAgent(BaseAgent):
    """
    Scrapes hospital chargemaster / price transparency files.

    Accepts a list of hospital entries, each with:
      {
        "name": "Hospital Name",
        "npi": "1234567890",
        "url": "https://hospital.org/chargemaster.csv",
        "format": "csv" | "json" | "xml" | "auto"
      }
    """

    def __init__(
        self,
        hospitals: Optional[list[dict]] = None,
        hospital_registry_url: Optional[str] = None,
        config: Optional[AgentConfig] = None,
    ):
        super().__init__(config=config, name="chargemaster_agent")
        self._hospitals = hospitals or []
        self._registry_url = hospital_registry_url
        self.download_dir = Path(self.config.download_dir) / "chargemaster"
        self.output_dir = Path(self.config.output_dir) / "chargemaster"
        self.download_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    async def discover(self):
        """Register hospital chargemaster URLs as jobs."""

        # If a registry URL is provided, fetch it first
        if self._registry_url:
            try:
                self.logger.info(
                    "Fetching hospital registry: %s", self._registry_url
                )
                registry = await self.http.fetch_json(self._registry_url)
                if isinstance(registry, list):
                    self._hospitals.extend(registry)
                elif isinstance(registry, dict):
                    self._hospitals.extend(
                        registry.get("hospitals", [])
                    )
            except Exception as exc:
                self.logger.error(
                    "Failed to fetch registry: %s", exc
                )

        for hosp in self._hospitals:
            url = hosp.get("url", "")
            if not url:
                continue
            self.checkpoint.register_job(
                url=url,
                source_type="chargemaster",
                metadata={
                    "hospital_name": hosp.get("name", "Unknown"),
                    "npi": hosp.get("npi", ""),
                    "ein": hosp.get("ein", ""),
                    "format": hosp.get("format", "auto"),
                },
            )

        self.logger.info(
            "Registered %d hospital chargemaster jobs",
            len(self._hospitals),
        )

    async def process(self, job: JobCheckpoint):
        """Download and parse a single chargemaster file."""
        meta = json.loads(job.metadata)
        dest = self.download_dir / self._safe_filename(job.url)

        # Download
        result = await self.http.stream_download(
            url=job.url,
            dest=dest,
            checkpoint_mgr=self.checkpoint,
            job_id=job.job_id,
        )

        self.logger.info(
            "[CM] Downloaded %s (%.1f MB)", job.job_id, result.total_bytes / 1e6
        )

        # Parse based on format
        fmt = meta.get("format", "auto")
        if fmt == "auto":
            fmt = self._detect_format(dest, result.content_type)

        output_path = self.output_dir / f"{job.job_id}_charges.csv"

        if fmt == "csv":
            records = await self._parse_csv(dest, meta)
        elif fmt == "json":
            records = await self._parse_json(dest, meta)
        elif fmt == "xml":
            records = await self._parse_xml(dest, meta)
        else:
            self.logger.warning(
                "[CM] Unknown format '%s' for %s, trying CSV",
                fmt, job.job_id,
            )
            records = await self._parse_csv(dest, meta)

        # Write normalized output
        if records:
            with open(output_path, "w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=CHARGEMASTER_FIELDS)
                writer.writeheader()
                for rec in records:
                    # Ensure all fields present
                    row = {k: rec.get(k, "") for k in CHARGEMASTER_FIELDS}
                    row["source_url"] = job.url
                    row["hospital_name"] = (
                        row["hospital_name"] or meta.get("hospital_name", "")
                    )
                    row["hospital_npi"] = (
                        row.get("hospital_npi", "") or meta.get("npi", "")
                    )
                    writer.writerow(row)

            self.checkpoint.update_job(
                job.job_id, records_parsed=len(records)
            )
            self.logger.info(
                "[CM] Wrote %d records → %s", len(records), output_path
            )
        else:
            self.logger.warning(
                "[CM] No records parsed from %s", job.job_id
            )

    def _detect_format(self, path: Path, content_type: str) -> str:
        suffix = path.suffix.lower().lstrip(".")
        if suffix in ("csv", "tsv"):
            return "csv"
        if suffix in ("json",):
            return "json"
        if suffix in ("xml",):
            return "xml"
        if "json" in content_type.lower():
            return "json"
        if "xml" in content_type.lower():
            return "xml"
        # Sniff first bytes
        try:
            with open(path, "rb") as f:
                head = f.read(512)
            if head.lstrip().startswith(b"{") or head.lstrip().startswith(b"["):
                return "json"
            if head.lstrip().startswith(b"<"):
                return "xml"
        except Exception:
            pass
        return "csv"  # default fallback

    async def _parse_csv(self, path: Path, meta: dict) -> list[dict]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self._do_parse_csv, path, meta
        )

    @staticmethod
    def _do_parse_csv(path: Path, meta: dict) -> list[dict]:
        import gzip

        records = []
        opener = gzip.open if str(path).endswith(".gz") else open
        with opener(path, "rt", errors="replace") as f:
            # Sniff delimiter
            sample = f.read(4096)
            f.seek(0)
            import csv as csv_mod
            try:
                dialect = csv_mod.Sniffer().sniff(sample)
                reader = csv.DictReader(f, dialect=dialect)
            except csv_mod.Error:
                reader = csv.DictReader(f)

            # Map common column names to our schema
            for i, row in enumerate(reader):
                mapped = ChargemasterAgent._map_columns(row, meta)
                if mapped:
                    records.append(mapped)
                if i >= 500_000:
                    break

        return records

    async def _parse_json(self, path: Path, meta: dict) -> list[dict]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self._do_parse_json, path, meta
        )

    @staticmethod
    def _do_parse_json(path: Path, meta: dict) -> list[dict]:
        records = []
        try:
            import ijson
            with open(path, "rb") as f:
                # Try CMS standard format
                for item in ijson.items(f, "standard_charge_information.item"):
                    code_info = item.get("code_information", [{}])
                    for ci in code_info:
                        base = {
                            "code_type": ci.get("code_type", ""),
                            "code": ci.get("code", ""),
                            "description": item.get("description", ""),
                        }
                        for charge in item.get("standard_charges", []):
                            rec = {**base}
                            rec["gross_charge"] = charge.get(
                                "gross_charge", ""
                            )
                            rec["discounted_cash_price"] = charge.get(
                                "discounted_cash_price", ""
                            )
                            rec["min_negotiated_rate"] = charge.get(
                                "minimum", ""
                            )
                            rec["max_negotiated_rate"] = charge.get(
                                "maximum", ""
                            )
                            rec["payer_name"] = charge.get(
                                "payer_name", ""
                            )
                            rec["plan_name"] = charge.get(
                                "plan_name", ""
                            )
                            rec["negotiated_rate"] = charge.get(
                                "negotiated_dollar_amount",
                                charge.get("negotiated_percentage", ""),
                            )
                            rec["rate_type"] = charge.get(
                                "methodology", ""
                            )
                            records.append(rec)
                            if len(records) >= 500_000:
                                return records
        except (ImportError, Exception):
            with open(path) as f:
                data = json.load(f)
            if isinstance(data, list):
                items = data
            else:
                items = data.get(
                    "standard_charge_information",
                    data.get("data", []),
                )
            for item in items[:50_000]:
                records.append(
                    ChargemasterAgent._map_columns(item, meta)
                )

        return records

    async def _parse_xml(self, path: Path, meta: dict) -> list[dict]:
        """Basic XML parsing for chargemasters."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self._do_parse_xml, path, meta
        )

    @staticmethod
    def _do_parse_xml(path: Path, meta: dict) -> list[dict]:
        import xml.etree.ElementTree as ET

        records = []
        try:
            tree = ET.iterparse(str(path), events=("end",))
            for event, elem in tree:
                tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
                if tag.lower() in ("item", "charge", "row", "record"):
                    row = {}
                    for child in elem:
                        ctag = (
                            child.tag.split("}")[-1]
                            if "}" in child.tag
                            else child.tag
                        )
                        row[ctag.lower()] = child.text or ""
                    mapped = ChargemasterAgent._map_columns(row, meta)
                    if mapped:
                        records.append(mapped)
                    elem.clear()
                    if len(records) >= 500_000:
                        break
        except ET.ParseError as exc:
            logger.warning("XML parse error: %s", exc)

        return records

    @staticmethod
    def _map_columns(row: dict, meta: dict) -> dict:
        """
        Map various hospital chargemaster column names to our
        standardized schema. Handles the chaos of real-world data.
        """
        # Lowercase all keys for matching
        lower = {k.lower().strip(): v for k, v in row.items()}

        def find(*candidates):
            for c in candidates:
                for k, v in lower.items():
                    if c in k:
                        return str(v).strip()
            return ""

        return {
            "hospital_name": meta.get("hospital_name", ""),
            "hospital_npi": meta.get("npi", ""),
            "ein": meta.get("ein", ""),
            "code_type": find("code_type", "code type", "codetype"),
            "code": find(
                "cpt", "hcpcs", "billing_code", "procedure_code",
                "drg", "code",
            ),
            "description": find(
                "description", "service", "item", "procedure_name", "name",
            ),
            "rev_code": find("rev_code", "revenue_code", "rev code"),
            "gross_charge": find(
                "gross_charge", "gross charge", "charge_amount",
                "standard_charge", "price",
            ),
            "discounted_cash_price": find(
                "cash_price", "cash price", "discounted_cash",
                "self_pay", "cash_discount",
            ),
            "min_negotiated_rate": find(
                "min_negotiated", "minimum", "de_identified_min",
            ),
            "max_negotiated_rate": find(
                "max_negotiated", "maximum", "de_identified_max",
            ),
            "payer_name": find("payer", "insurance", "carrier"),
            "plan_name": find("plan", "plan_name", "product"),
            "negotiated_rate": find(
                "negotiated_rate", "negotiated_charge",
                "negotiated_dollar", "allowed",
            ),
            "rate_type": find("methodology", "rate_type", "type"),
        }

    @staticmethod
    def _safe_filename(url: str) -> str:
        import hashlib
        from urllib.parse import urlparse

        parsed = urlparse(url)
        name = Path(parsed.path).name or "chargemaster"
        h = hashlib.sha256(url.encode()).hexdigest()[:8]
        return f"{h}_{name}"
