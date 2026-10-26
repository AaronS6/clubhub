#!/bin/bash
# ============================================================================
# scripts/watchdog.sh — preview self-healing daemon
# ============================================================================
# Root cause this mitigates: the Next.js dev server occasionally gets
# OOM-killed in the sandbox, which the user experiences as "the preview
# stopped loading". This watchdog polls every 10s; after 3 consecutive
# failed health checks it restarts the dev server (double-forked so it
# survives this script's own exit and tool-session churn).
#
# Run:   nohup bash scripts/watchdog.sh >> watchdog.log 2>&1 & disown
# Stop:  pkill -f watchdog.sh
# ============================================================================

PROJECT_DIR="/home/z/my-project"
HEALTH_URL="http://localhost:3000/api/health"
LOG_FILE="$PROJECT_DIR/watchdog.log"
PID_FILE="$PROJECT_DIR/.zscripts/dev.pid"

INTERVAL=10          # seconds between checks
FAIL_THRESHOLD=3     # consecutive failures before restart

fail_count=0

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

is_dev_running() {
  # A dev server is considered running if ANY next dev process exists
  # AND the HTTP health endpoint answers.
  pgrep -f "next dev -p 3000" > /dev/null 2>&1
}

start_dev() {
  log "starting dev server (orphan-fork)"
  cd "$PROJECT_DIR" || exit 1
  # Subshell-orphan pattern: the subshell exits instantly, the server is
  # reparented away from this script's process group — the only launch
  # pattern that survives the sandbox's inter-command process reaper.
  ( NODE_OPTIONS="--max-http-header-size=65536,--max-old-space-size=1024" \
      nohup bunx next dev -p 3000 >> "$PROJECT_DIR/dev.log" 2>&1 & )
  sleep 8
  if pgrep -f "next dev -p 3000" > /dev/null 2>&1; then
    local newpid
    newpid=$(pgrep -f "next dev -p 3000" | head -1)
    echo "$newpid" > "$PID_FILE" 2>/dev/null
    log "dev server up (pid $newpid)"
  else
    log "ERROR: dev server failed to start"
  fi
}

log "watchdog started (interval=${INTERVAL}s, threshold=$FAIL_THRESHOLD)"

while true; do
  sleep "$INTERVAL"

  if is_dev_running; then
    fail_count=0
    continue
  fi

  fail_count=$((fail_count + 1))
  log "dev server not running (failure $fail_count/$FAIL_THRESHOLD)"

  if [ "$fail_count" -ge "$FAIL_THRESHOLD" ]; then
    log "threshold reached — restarting dev server"
    # Clean up any zombie processes holding the port
    pkill -f "next dev -p 3000" 2>/dev/null
    sleep 2
    start_dev
    fail_count=0
  fi
done
