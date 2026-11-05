#!/usr/bin/env bash
# Export Hype's schema SQL, copy it to the clipboard, and open a local ChartDB review.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "$script_dir/../.." && pwd)"
chartdb_dir="${CHARTDB_DIR:-$HOME/.tools/chartdb}"
if [[ -z "${CHARTDB_DIR:-}" && ! -d "$chartdb_dir" ]]; then
  chartdb_dir="$repo_dir/.local/tools/chartdb"
fi
state_dir="$repo_dir/.local/chartdb"
schema_file="$state_dir/schema.sql"
chartdb_log="$state_dir/dev.log"
chartdb_pid="$state_dir/dev.pid"

if [[ "${1:-}" != "" && "${1:-}" != "--export-only" ]] || [[ $# -gt 1 ]]; then
  echo 'Usage: bun run db:chart [--export-only]' >&2
  exit 1
fi

# Keep SQL available for manual import even when no desktop clipboard is available.
mkdir -p "$state_dir"
cd "$repo_dir"
schema_tmp="$(mktemp "$state_dir/schema.XXXXXX.sql")"
trap 'rm -f "$schema_tmp"' EXIT
bun run "$script_dir/export-schema-sql.ts" >"$schema_tmp"
mv "$schema_tmp" "$schema_file"
echo "Schema SQL exported to $schema_file"
if [[ "${1:-}" == "--export-only" ]]; then
  exit 0
fi

if [[ ! -f "$chartdb_dir/package.json" ]]; then
  echo "ChartDB installation not found: $chartdb_dir" >&2
  echo 'Set CHARTDB_DIR to your ChartDB checkout, or install it with:' >&2
  echo "  git clone https://github.com/chartdb/chartdb.git '$repo_dir/.local/tools/chartdb'" >&2
  echo "  cd '$repo_dir/.local/tools/chartdb' && bun install" >&2
  exit 1
fi

if command -v wl-copy >/dev/null 2>&1 && wl-copy <"$schema_file"; then
  echo 'Schema SQL copied to clipboard.'
elif command -v xclip >/dev/null 2>&1 && xclip -selection clipboard <"$schema_file"; then
  echo 'Schema SQL copied to clipboard.'
elif command -v xsel >/dev/null 2>&1 && xsel --clipboard --input <"$schema_file"; then
  echo 'Schema SQL copied to clipboard.'
else
  echo "Clipboard unavailable; import $schema_file in ChartDB." >&2
fi

# Read only loopback URLs from the dev server's log.
extract_chartdb_url() {
  if [[ -f "$chartdb_log" ]]; then
    grep -Eo 'http://(localhost|127\.0\.0\.1):[0-9]+' "$chartdb_log" | tail -n 1
  fi
}

# Detach the server so it survives the command opening the browser and exiting.
start_chartdb() {
  : >"$chartdb_log"
  (
    cd "$chartdb_dir"
    nohup bun run dev --host 127.0.0.1 </dev/null >"$chartdb_log" 2>&1 &
    echo "$!" >"$chartdb_pid"
  )
}

if [[ -f "$chartdb_pid" ]] && kill -0 "$(cat "$chartdb_pid")" 2>/dev/null; then
  chartdb_url="$(extract_chartdb_url || true)"
else
  rm -f "$chartdb_pid"
  start_chartdb
  chartdb_url=""
fi

# A logged URL alone is not readiness; wait for the server to respond as well.
for ((attempt = 0; attempt < 60; attempt++)); do
  if ! kill -0 "$(cat "$chartdb_pid")" 2>/dev/null; then
    echo "ChartDB dev server exited unexpectedly. Check $chartdb_log" >&2
    exit 1
  fi
  chartdb_url="$(extract_chartdb_url || true)"
  if [[ -n "$chartdb_url" ]] && curl --noproxy '*' --fail --silent --output /dev/null --max-time 1 "$chartdb_url"; then
    break
  fi
  sleep 1
done

if [[ -z "$chartdb_url" ]] || ! curl --noproxy '*' --fail --silent --output /dev/null --max-time 1 "$chartdb_url"; then
  echo "ChartDB did not become ready. Check $chartdb_log" >&2
  exit 1
fi

echo "ChartDB is running at $chartdb_url"
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$chartdb_url" >/dev/null 2>&1 &
fi
echo 'In ChartDB, choose SQLite, select SQL Script, paste the clipboard contents, and click Import.'
