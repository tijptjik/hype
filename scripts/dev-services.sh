#!/usr/bin/env bash
# Supervise the local web/search stack independently of terminals and agent sessions.
# Usage: bash scripts/dev-services.sh start|status|stop
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
saanseoi_root="${SAANSEOI_ROOT:-$(dirname "$repo_root")/saanseoi}"
units=(hype-web-dev hype-atlas-dev hype-exports-dev)
action="${1:-status}"

case "$action" in
  status) exec systemctl --user status "${units[@]}" --no-pager ;;
  stop) exec systemctl --user stop "${units[@]}" ;;
  start) ;;
  *) echo "Usage: $0 start|status|stop" >&2; exit 64 ;;
esac

# Keep each complete process tree in its own managed memory boundary. The launcher
# scope only submits the service; systemd owns its logs, lifetime and restart policy.
start_service() {
  local unit="$1" directory="$2" port="$3"
  shift 3
  if systemctl --user is-active --quiet "$unit"; then
    echo "$unit is already running"
    return
  fi
  if ss -H -ltn "sport = :$port" | read -r _; then
    echo "Cannot start $unit: port $port has another owner. Inspect it before stopping it." >&2
    exit 1
  fi
  if systemctl --user is-failed --quiet "$unit"; then
    systemctl --user reset-failed "$unit"
  fi
  dev-server systemd-run --user --unit="$unit" \
    --property="WorkingDirectory=$directory" \
    --property="Environment=PATH=$PATH" \
    --slice=app-development.slice \
    --property=MemoryHigh=15% --property=MemoryMax=25% \
    --property=MemorySwapMax=1G --property=OOMPolicy=kill \
    --property=Restart=always --property=RestartSec=5 \
    --property=StartLimitIntervalSec=120 --property=StartLimitBurst=5 \
    -- "$@"
}

start_service hype-atlas-dev "$saanseoi_root/apps/atlas-api" 8791 \
  "$(command -v bun)" run dev
start_service hype-exports-dev "$saanseoi_root/apps/release-exports" 8793 \
  "$(command -v bun)" run dev
start_service hype-web-dev "$repo_root" 5175 \
  "$(command -v node)" "$repo_root/node_modules/vite/bin/vite.js" dev \
  --host 127.0.0.1 --port 5175 --strictPort
