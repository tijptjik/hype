#!/usr/bin/env bash
# Dry-run by default; explicit --apply uploads only the verified source archive.
set -euo pipefail
root=$(realpath "${1:?Usage: upload-mtr-baseline.sh BASELINE_DIRECTORY [--apply]}")
mode=${2:---dry-run}
if [[ "$mode" != '--apply' && "$mode" != '--dry-run' ]]; then
  echo 'Expected --apply or --dry-run' >&2
  exit 2
fi
dev-check bun scripts/indoor/verify-mtr-baseline.ts "$root"
remote=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["remote"])' "$root/upload-manifest.json")
case "$remote" in
  r2-tijpdata:hype-assets-raw-dev/premises-maps/source-baselines/*) ;;
  *) echo 'Unexpected baseline destination' >&2; exit 2 ;;
esac
flags=(--immutable --transfers 4 --checkers 4)
if [[ "$mode" != '--apply' ]]; then flags+=(--dry-run); fi
rclone copy "$root" "$remote" "${flags[@]}"
if [[ "$mode" == '--apply' ]]; then
  rclone check "$root" "$remote" --download --one-way
fi
