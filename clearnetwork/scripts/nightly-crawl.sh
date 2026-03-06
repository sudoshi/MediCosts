#!/bin/bash
# ClearNetwork Nightly Pipeline — Scout + Crawl + Report
# Scheduled via crontab: 0 2 * * * /home/smudoshi/Github/MediCosts/clearnetwork/scripts/nightly-crawl.sh
#
# Three-stage pipeline:
#   1. Scout: Discover new insurers, probe URLs, score transparency
#   2. Crawl: Run 50-state parallel crawler on all automatable insurers
#   3. Report: Generate stats + email nightly report

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$PROJECT_DIR")"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/crawl-$(date +%Y%m%d-%H%M%S).log"

# Hard deadline: crawlers must stop by 9 AM so blog publishes by 10 AM
DEADLINE_HOUR=9

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Activate virtualenv
source "$PROJECT_DIR/.venv/bin/activate"

# Load environment variables
set -a
source "$ROOT_DIR/.env" 2>/dev/null || true
set +a

# Check if we've passed the deadline — if so, skip crawl stages
past_deadline() {
  [ "$(date +%H)" -ge "$DEADLINE_HOUR" ]
}

echo "=== ClearNetwork Nightly Pipeline ===" | tee "$LOG_FILE"
echo "Started: $(date)" | tee -a "$LOG_FILE"
echo "Deadline: ${DEADLINE_HOUR}:00 AM" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Kill any stale crawl processes older than 12 hours
STALE_PIDS=$(pgrep -f "crawler\.\(orchestrator\|state_runner\|scout\)" -u "$(whoami)" 2>/dev/null | while read PID; do
  START=$(stat -c %Y "/proc/$PID" 2>/dev/null || echo 0)
  NOW=$(date +%s)
  AGE=$(( NOW - START ))
  if [ "$AGE" -gt 43200 ]; then echo "$PID"; fi
done || true)
if [ -n "$STALE_PIDS" ]; then
  echo "Killing stale processes: $STALE_PIDS" | tee -a "$LOG_FILE"
  echo "$STALE_PIDS" | xargs kill 2>/dev/null || true
  sleep 2
fi

cd "$PROJECT_DIR"

# ── Stage 1: Scout (discover + probe + score) ──
if past_deadline; then
  echo "SKIPPED Stage 1 — past ${DEADLINE_HOUR}:00 deadline" | tee -a "$LOG_FILE"
else
  echo "" | tee -a "$LOG_FILE"
  echo "=== Stage 1: Scout — Discovering insurers across 50 states ===" | tee -a "$LOG_FILE"
  echo "Started: $(date)" | tee -a "$LOG_FILE"

  python -u -m crawler.scout --concurrency 30 2>&1 | tee -a "$LOG_FILE" || {
    echo "WARNING: Scout failed — continuing with existing registry" | tee -a "$LOG_FILE"
  }

  echo "Scout finished: $(date)" | tee -a "$LOG_FILE"
fi

# ── Stage 2: State Runner (parallel 50-state crawl) ──
if past_deadline; then
  echo "SKIPPED Stage 2 — past ${DEADLINE_HOUR}:00 deadline" | tee -a "$LOG_FILE"
else
  echo "" | tee -a "$LOG_FILE"
  echo "=== Stage 2: State Runner — Crawling all automatable insurers ===" | tee -a "$LOG_FILE"
  echo "Started: $(date)" | tee -a "$LOG_FILE"

  # Calculate seconds remaining until deadline
  DEADLINE_TS=$(date -d "today ${DEADLINE_HOUR}:00" +%s)
  NOW_TS=$(date +%s)
  REMAINING=$(( DEADLINE_TS - NOW_TS ))
  if [ "$REMAINING" -lt 600 ]; then REMAINING=600; fi

  timeout "${REMAINING}s" python -u -m crawler.state_runner \
    --concurrency 10 \
    --max-files 20 \
    --insurer-timeout 3600 \
    --automatable-only \
    2>&1 | tee -a "$LOG_FILE" || {
    echo "WARNING: State runner stopped (timeout or error) — continuing to report" | tee -a "$LOG_FILE"
  }

  echo "State runner finished: $(date)" | tee -a "$LOG_FILE"
fi

# ── Stage 3: Legacy orchestrator (existing known insurers) ──
if past_deadline; then
  echo "SKIPPED Stage 3 — past ${DEADLINE_HOUR}:00 deadline" | tee -a "$LOG_FILE"
else
  echo "" | tee -a "$LOG_FILE"
  echo "=== Stage 3: Legacy Orchestrator — Known insurer deep crawl ===" | tee -a "$LOG_FILE"

  DEADLINE_TS=$(date -d "today ${DEADLINE_HOUR}:00" +%s)
  NOW_TS=$(date +%s)
  REMAINING=$(( DEADLINE_TS - NOW_TS ))
  if [ "$REMAINING" -lt 600 ]; then REMAINING=600; fi

  timeout "${REMAINING}s" python -u -m crawler.orchestrator \
    --automatable-only \
    --max-files=50 \
    --insurer-timeout=7200 \
    2>&1 | tee -a "$LOG_FILE" || {
    echo "WARNING: Legacy orchestrator stopped (timeout or error)" | tee -a "$LOG_FILE"
  }

  echo "Legacy orchestrator finished: $(date)" | tee -a "$LOG_FILE"
fi

# ── Stage 4: Nightly Report ──
echo "" | tee -a "$LOG_FILE"
echo "=== Stage 4: Generating nightly report ===" | tee -a "$LOG_FILE"

python -u "$SCRIPT_DIR/nightly-report.py" --email 2>&1 | tee -a "$LOG_FILE" || {
  echo "WARNING: Report generation/email failed" | tee -a "$LOG_FILE"
}

# ── Stage 5: Daily Blog Post ──
echo "" | tee -a "$LOG_FILE"
echo "=== Stage 5: Generating daily blog post ===" | tee -a "$LOG_FILE"

python -u "$SCRIPT_DIR/generate-blog-post.py" --email 2>&1 | tee -a "$LOG_FILE" || {
  echo "WARNING: Blog post generation failed" | tee -a "$LOG_FILE"
}

echo "Blog post generated: $(date)" | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
echo "=== Pipeline Complete ===" | tee -a "$LOG_FILE"
echo "Finished: $(date)" | tee -a "$LOG_FILE"

# Clean up old logs (keep last 30 days)
find "$LOG_DIR" -name "crawl-*.log" -mtime +30 -delete 2>/dev/null || true
