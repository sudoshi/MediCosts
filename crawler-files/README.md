# Healthcare Cost Transparency Scraper

A fault-tolerant, async Python agent framework for scraping healthcare cost data from CMS machine-readable files (MRFs), hospital chargemasters, and custom API endpoints.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Orchestrator                            │
│                     (main.py / config.json)                     │
├─────────────┬──────────────────┬────────────────────────────────┤
│  MRF Agent  │ Chargemaster     │  Custom URL Agent              │
│             │ Agent            │                                │
│ • TOC index │ • Hospital list  │ • JSON APIs                   │
│ • In-net    │ • CSV/JSON/XML   │ • CSV downloads               │
│   rates     │ • Column mapping │ • Paginated endpoints         │
│ • ijson     │ • Format detect  │ • Cursor/offset/page          │
│   streaming │                  │                                │
├─────────────┴──────────────────┴────────────────────────────────┤
│                     Base Agent                                  │
│          discover() → process() → report()                      │
│          Concurrency control via asyncio.Semaphore              │
├─────────────────────────────────────────────────────────────────┤
│                  Resilient HTTP Client                           │
│          aiohttp + streaming + Range resume                     │
├──────────┬──────────────┬──────────────┬────────────────────────┤
│  Retry   │   Circuit    │  Checkpoint  │   Dead Letter          │
│  w/exp   │   Breaker    │  Manager     │   Queue                │
│  backoff │  (per-domain)│  (SQLite)    │   (SQLite)             │
│  +jitter │  3-state FSM │  crash-safe  │   replay support       │
├──────────┴──────────────┴──────────────┴────────────────────────┤
│               SQLite (WAL mode) — scraper_state.db              │
└─────────────────────────────────────────────────────────────────┘
```

## Resilience Features (in priority order)

### 1. Auto-Retry with Exponential Backoff
- Configurable max retries, base delay, ceiling, and jitter
- Adaptive to `Retry-After` headers (429 responses)
- Per-domain token-bucket rate limiting that slows automatically under pressure

### 2. Checkpoint / Resume
- Every job tracked in SQLite with WAL journaling
- Streaming downloads checkpoint every 5 MB
- Resume via HTTP `Range` header after crash
- Stale in-progress jobs auto-reset on restart

### 3. Dead Letter Queue
- Jobs exceeding max retries land in persistent DLQ
- Inspect with `--status`, replay with `--replay-dlq`
- Each entry preserves error type, message, attempt count

### 4. Circuit Breaker
- Per-domain 3-state FSM: closed → open → half-open → closed
- Opens after N consecutive failures, probes after recovery timeout
- Prevents hammering flaky sources

## Quick Start

```bash
pip install aiohttp ijson pyyaml

# Edit the example config
cp config.example.json config.json
# Add your payer TOC URLs, hospital URLs, etc.

# Run
python -m healthcare_scraper --config config.json

# Check progress
python -m healthcare_scraper --status

# Resume after crash
python -m healthcare_scraper --resume

# Replay failed jobs
python -m healthcare_scraper --replay-dlq
```

## CLI Usage

```bash
# Single MRF source
python -m healthcare_scraper --agent mrf \
  --toc-url https://transparency-in-coverage.uhc.com/api/v1/uhc/blobs/

# Single hospital chargemaster
python -m healthcare_scraper --agent chargemaster \
  --hospital-url https://www.hospital.org/chargemaster.csv

# Custom API endpoint
python -m healthcare_scraper --agent custom \
  --url https://data.cms.gov/provider-data/api/1/datastore/query/mj5m-pzi6
```

## Configuration Reference

```json
{
  "settings": {
    "db_path": "scraper_state.db",
    "download_dir": "./downloads",
    "output_dir": "./output",
    "max_concurrent": 5,
    "request_timeout": 300.0,
    "default_rps": 2.0
  },
  "mrf": {
    "enabled": true,
    "toc_urls": ["https://..."]
  },
  "chargemaster": {
    "enabled": true,
    "hospitals": [
      {
        "name": "Hospital Name",
        "npi": "1234567890",
        "url": "https://.../chargemaster.csv",
        "format": "auto"
      }
    ]
  },
  "custom": {
    "enabled": true,
    "targets": [
      {
        "url": "https://api.example.com/data",
        "type": "paginated_api",
        "jq_path": "results",
        "pagination": {
          "type": "offset",
          "param": "offset",
          "page_size": 500,
          "max_pages": 20
        }
      }
    ]
  }
}
```

## Output

All agents produce normalized CSV files in `./output/<agent_type>/`:

- **MRF**: `{job_id}_rates.csv` — billing_code, negotiated_rate, billing_class, etc.
- **Chargemaster**: `{job_id}_charges.csv` — standardized schema across hospitals
- **Custom**: `{output_name}.csv` — whatever the source returns, flattened

## Extending

Create a new agent by subclassing `BaseAgent`:

```python
from healthcare_scraper.agents.base import BaseAgent

class MyAgent(BaseAgent):
    def __init__(self):
        super().__init__(name="my_agent")

    async def discover(self):
        # Register jobs
        self.checkpoint.register_job(url="...", source_type="mine")

    async def process(self, job):
        # Download + parse
        data = await self.http.fetch_json(job.url)
        # ... write output
```

You inherit retry, circuit breaker, checkpoint, DLQ, rate limiting,
and graceful shutdown for free.

## Project Structure

```
healthcare_scraper/
├── __init__.py
├── __main__.py
├── main.py                  # Orchestrator + CLI
├── config.example.json
├── requirements.txt
├── core/
│   ├── resilience.py        # Retry, CircuitBreaker, Checkpoint, DLQ
│   └── http_client.py       # Resilient async HTTP with streaming
├── agents/
│   ├── base.py              # BaseAgent lifecycle
│   ├── mrf_agent.py         # CMS MRF transparency files
│   ├── chargemaster_agent.py # Hospital price transparency
│   └── custom_agent.py      # Arbitrary URL/API endpoints
├── parsers/                  # (extensible) format-specific parsers
└── sources/                  # (extensible) source registries
```
