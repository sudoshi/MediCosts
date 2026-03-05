"""
Healthcare Cost Transparency Scraper — Orchestrator

Runs one or more agents (MRF, Chargemaster, Custom URL) with full
fault-tolerance: retry, circuit breaker, checkpoint/resume, DLQ.

Usage:
  # Run all agents from config file
  python -m healthcare_scraper.main --config config.yaml

  # Run specific agent
  python -m healthcare_scraper.main --agent mrf --toc-url https://example.com/toc.json

  # Resume interrupted jobs
  python -m healthcare_scraper.main --resume

  # Replay dead-letter queue
  python -m healthcare_scraper.main --replay-dlq

  # Show status
  python -m healthcare_scraper.main --status
"""

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

from .agents import (
    AgentConfig,
    MRFAgent,
    ChargemasterAgent,
    CustomURLAgent,
)
from .core import CheckpointManager, DeadLetterQueue


def setup_logging(level: str = "INFO", log_file: str = "scraper.log"):
    fmt = "%(asctime)s %(levelname)-8s %(name)-20s %(message)s"
    handlers = [
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(log_file),
    ]
    logging.basicConfig(level=level, format=fmt, handlers=handlers)
    # Quiet noisy libraries
    logging.getLogger("aiohttp").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)


def load_config(config_path: str) -> dict:
    """
    Load YAML or JSON configuration.

    Expected structure:
    ```yaml
    settings:
      db_path: scraper_state.db
      download_dir: ./downloads
      output_dir: ./output
      max_concurrent: 5
      default_rps: 2.0

    mrf:
      enabled: true
      toc_urls:
        - https://transparency-in-coverage.uhc.com/api/v1/uhc/blobs/
        - https://www.cigna.com/static/.../mrf.json

    chargemaster:
      enabled: true
      hospitals:
        - name: "Mass General Hospital"
          npi: "1234567890"
          url: "https://www.massgeneral.org/chargemaster.csv"
          format: csv
      registry_url: null

    custom:
      enabled: true
      targets:
        - url: "https://api.example.com/rates"
          name: "example_rates"
          type: json_api
          jq_path: "data.results"
    ```
    """
    path = Path(config_path)
    if not path.exists():
        raise FileNotFoundError(f"Config not found: {config_path}")

    text = path.read_text()

    if path.suffix in (".yaml", ".yml"):
        try:
            import yaml
            return yaml.safe_load(text)
        except ImportError:
            raise ImportError(
                "PyYAML required for YAML configs: pip install pyyaml"
            )
    else:
        return json.loads(text)


async def run_agents(config: dict):
    """Run enabled agents from configuration."""
    settings = config.get("settings", {})
    agent_config = AgentConfig(
        db_path=settings.get("db_path", "scraper_state.db"),
        download_dir=settings.get("download_dir", "./downloads"),
        output_dir=settings.get("output_dir", "./output"),
        max_concurrent=settings.get("max_concurrent", 5),
        request_timeout=settings.get("request_timeout", 300.0),
        default_rps=settings.get("default_rps", 2.0),
    )

    agents = []

    # MRF Agent
    mrf_cfg = config.get("mrf", {})
    if mrf_cfg.get("enabled", False):
        agents.append(
            MRFAgent(
                payer_toc_urls=mrf_cfg.get("toc_urls", []),
                config=agent_config,
            )
        )

    # Chargemaster Agent
    cm_cfg = config.get("chargemaster", {})
    if cm_cfg.get("enabled", False):
        agents.append(
            ChargemasterAgent(
                hospitals=cm_cfg.get("hospitals", []),
                hospital_registry_url=cm_cfg.get("registry_url"),
                config=agent_config,
            )
        )

    # Custom URL Agent
    custom_cfg = config.get("custom", {})
    if custom_cfg.get("enabled", False):
        agents.append(
            CustomURLAgent(
                targets=custom_cfg.get("targets", []),
                config=agent_config,
            )
        )

    if not agents:
        logging.warning("No agents enabled. Check your config.")
        return

    logging.info("Starting %d agent(s)...", len(agents))

    # Run agents concurrently
    results = await asyncio.gather(
        *(agent.start() for agent in agents),
        return_exceptions=True,
    )

    for agent, result in zip(agents, results):
        if isinstance(result, Exception):
            logging.error(
                "Agent %s failed: %s", agent.name, result
            )


def show_status(db_path: str):
    """Print current scraper status."""
    cp = CheckpointManager(db_path)
    dlq = DeadLetterQueue(db_path)

    for status_name in ("pending", "in_progress", "completed", "failed", "partial"):
        jobs = cp.get_jobs_by_status(status_name)
        if jobs:
            print(f"\n{'─' * 60}")
            print(f" {status_name.upper()} ({len(jobs)} jobs)")
            print(f"{'─' * 60}")
            for j in jobs[:20]:
                meta = json.loads(j.metadata) if j.metadata else {}
                print(
                    f"  {j.job_id[:30]:30s} "
                    f"bytes={j.bytes_downloaded:>12,} "
                    f"records={j.records_parsed:>8,} "
                    f"attempts={j.attempt_count}"
                )
            if len(jobs) > 20:
                print(f"  ... and {len(jobs) - 20} more")

    dlq_items = dlq.list_all()
    if dlq_items:
        print(f"\n{'─' * 60}")
        print(f" DEAD LETTER QUEUE ({len(dlq_items)} items)")
        print(f"{'─' * 60}")
        for dl in dlq_items[:20]:
            print(
                f"  [{dl.id}] {dl.job_id[:25]:25s} "
                f"{dl.error_type}: {dl.error_message[:60]}"
            )

    cp.close()
    dlq.close()


async def replay_dlq(db_path: str):
    """Replay all dead-letter items back to pending."""
    cp = CheckpointManager(db_path)
    dlq = DeadLetterQueue(db_path)
    count = dlq.replay_all(cp)
    print(f"Replayed {count} dead-letter items back to pending.")
    cp.close()
    dlq.close()


def main():
    parser = argparse.ArgumentParser(
        description="Healthcare Cost Transparency Scraper"
    )
    parser.add_argument(
        "--config", "-c",
        help="Path to YAML/JSON config file",
    )
    parser.add_argument(
        "--agent",
        choices=["mrf", "chargemaster", "custom"],
        help="Run a single agent type",
    )
    parser.add_argument(
        "--toc-url",
        action="append",
        help="MRF TOC URL (can specify multiple)",
    )
    parser.add_argument(
        "--hospital-url",
        action="append",
        help="Hospital chargemaster URL",
    )
    parser.add_argument(
        "--url",
        action="append",
        help="Custom URL to scrape",
    )
    parser.add_argument("--resume", action="store_true",
                        help="Resume interrupted jobs")
    parser.add_argument("--replay-dlq", action="store_true",
                        help="Replay dead-letter queue")
    parser.add_argument("--status", action="store_true",
                        help="Show current status")
    parser.add_argument("--db", default="scraper_state.db",
                        help="Database path")
    parser.add_argument("--log-level", default="INFO")
    parser.add_argument("--log-file", default="scraper.log")

    args = parser.parse_args()
    setup_logging(args.log_level, args.log_file)

    if args.status:
        show_status(args.db)
        return

    if args.replay_dlq:
        asyncio.run(replay_dlq(args.db))
        return

    # Build config
    if args.config:
        config = load_config(args.config)
    else:
        config = {"settings": {"db_path": args.db}}

        if args.agent == "mrf" and args.toc_url:
            config["mrf"] = {
                "enabled": True,
                "toc_urls": args.toc_url,
            }
        elif args.agent == "chargemaster" and args.hospital_url:
            config["chargemaster"] = {
                "enabled": True,
                "hospitals": [
                    {"url": u, "name": f"Hospital_{i}", "format": "auto"}
                    for i, u in enumerate(args.hospital_url)
                ],
            }
        elif args.agent == "custom" and args.url:
            config["custom"] = {
                "enabled": True,
                "targets": [
                    {"url": u, "type": "json_api", "name": f"custom_{i}"}
                    for i, u in enumerate(args.url)
                ],
            }
        elif args.resume:
            # Resume mode: just process existing pending jobs
            config["mrf"] = {"enabled": True, "toc_urls": []}
        else:
            parser.print_help()
            return

    asyncio.run(run_agents(config))


if __name__ == "__main__":
    main()
