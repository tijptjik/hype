#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -z "${WRANGLER_DOCKER_BIN:-}" ]] && ! command -v docker >/dev/null && command -v podman >/dev/null; then
    export WRANGLER_DOCKER_BIN="$root/scripts/podman-docker.sh"
fi
exec bun x --no wrangler deploy --dry-run --outdir dist "$@"
