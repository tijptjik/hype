#!/usr/bin/env bash
# Additive, two-way research synchronisation. Differing existing files are conflicts.
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
local_root="$root/.research"
remote='r2-tijpdata:hype-research'
mkdir -p "$local_root"
exec 9>"${XDG_RUNTIME_DIR:-/tmp}/hype-research-sync.lock"
flock -n 9 || exit 0
# The synchroniser retains previous versions and refuses simultaneous edits.
exec python3 "$root/scripts/research/sync.py"
