# ADR 0001 — Retire the ClearNetwork HTML scraper; move provider-directory acquisition to standards-based ingestion

- **Status:** Accepted
- **Date:** 2026-06-20
- **Deciders:** Dr. Sanjay Udoshi
- **Context tags:** ClearNetwork, data acquisition, M2 modernization

## Context

ClearNetwork's network-directory data was acquired by a nightly Python scraper
(`clearnetwork/scripts/nightly-crawl.sh` → `crawler.scout` / `crawler.state_runner` /
`crawler.orchestrator`) scheduled at 02:00 via crontab. It crawled insurer provider
directories and MRF files across 50 states and wrote to the `clearnetwork.*` schema.

A June 2026 operational review found the pipeline had been **non-functional for over
two months**, silently:

- **Last productive run: 2026-04-07.** No `crawl_jobs` row records `providers_found > 0`
  after that date.
- **2026-05-20 → 2026-06-03:** runs completed but wrote **zero** new providers (no-ops).
- **2026-06-04 → 2026-06-20:** hard failure every night — `ModuleNotFoundError: aiohttp`
  / `asyncpg`. Root cause: the host Python advanced to **3.14.4** and the crawler venv's
  compiled wheels became ABI-incompatible. There is **no `requirements.txt`** to rebuild from.
- Failures were **silent**: the nightly-report email stage is itself broken (`asyncpg`),
  so 17 consecutive failures went unnoticed.
- **Reliability was poor even when working:** of 442 lifetime `crawl_jobs`, 172 failed and
  131 were orphaned in `running` (hung mid-crawl) — ~69% never completed cleanly. Several
  large insurers (e.g. Centene's 42-state portal) actively block automated access.

Meanwhile:

- The **live site does not depend on the scraper.** `medicosts.acumenus.net` serves headline
  figures (47.7M records / $6.6B) from the CMS-derived `medicosts`/`stage` schemas, not the
  live crawl.
- The crawl-built asset already exists in the DB as a **read-only snapshot**: ~74.7M
  `network_providers`, ~9M `canonical_providers`, ~12M `plans`, 43 insurers.
- The **blog stage was already removed** from the pipeline (commit 5775688), so the crawler no
  longer feeds anything user-facing.
- Re-enabling carries real downside: the MRF download path (`downloader.py`, `mrf_parser.py`,
  `mrf_index.py`) previously inflated disk to ~162 GB on the **shared NVMe** whose I/O
  saturation has degraded Parthenon production; and high-concurrency directory scraping is
  ToS-gray and invites IP bans.

## Decision

1. **Retire the nightly HTML scraper.** The crontab entry is disabled (commented, not
   deleted, 2026-06-20). The crawler code remains in-tree for reference but is no longer scheduled.
2. **Treat the April 2026 `clearnetwork.*` snapshot as the current data basis.** It is served
   read-only and is adequate until replaced.
3. **Defer to the M2 modernization for a proper replacement.** If provider-directory freshness
   becomes a product requirement, acquire it from **authoritative, standards-based sources**
   rather than scraping HTML:
   - **NPPES** monthly bulk download (canonical provider identity / NPI).
   - **CMS Transparency-in-Coverage MRF index** for machine-readable network/rate files.
   - **Payer FHIR R4 Provider Directory APIs** (`PractitionerRole`, `Location`, `Organization`)
     mandated under CMS Interoperability & Patient Access.

## Consequences

- **Positive:** No silent-failure cron noise; no MRF/NVMe pressure on shared prod storage; no
  ToS/IP-ban exposure; replacement aligns with the project's standards-first principles and the
  in-progress TypeScript migration.
- **Negative / accepted:** The `clearnetwork.*` snapshot goes stale (provider directories drift
  ~2–3%/month). Acceptable because no user-facing feature depends on freshness today.
- **Guardrail:** Do **not** reflexively re-enable the cron job on seeing it disabled — that
  reverts this decision. Any one-off refresh must use a pinned Python ≤3.12 venv with bounded
  concurrency and capped MRF downloads. The durable path is the M2 ingestion above.

## References

- Crawler entrypoint: `clearnetwork/scripts/nightly-crawl.sh`
- Original design: `docs/clearnetwork.md`
- Operational history: `docs/devlog.md` (ClearNetwork hardening, 2026-03-04)
