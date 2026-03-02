#!/bin/bash
# ClearNetwork Nightly MRF Crawl
# Runs all automatable insurers with up to 50 files each
# Scheduled via crontab: 0 2 * * * /home/smudoshi/Github/MediCosts/clearnetwork/scripts/nightly-crawl.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/crawl-$(date +%Y%m%d-%H%M%S).log"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Activate virtualenv
source "$PROJECT_DIR/.venv/bin/activate"

# Load environment variables
set -a
source "$(dirname "$PROJECT_DIR")/.env" 2>/dev/null || true
set +a

echo "=== ClearNetwork Nightly Crawl ===" | tee "$LOG_FILE"
echo "Started: $(date)" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Run the crawler with all automatable insurers
cd "$PROJECT_DIR"
python -u -m crawler.orchestrator --automatable-only --max-files=50 2>&1 | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
echo "Finished: $(date)" | tee -a "$LOG_FILE"

# Clean up old logs (keep last 30 days)
find "$LOG_DIR" -name "crawl-*.log" -mtime +30 -delete 2>/dev/null || true
