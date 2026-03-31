#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <bucket> [bucket ...]" >&2
  exit 1
fi

if [[ ! -f .dev.vars ]]; then
  echo "Missing .dev.vars in $ROOT_DIR" >&2
  exit 1
fi

set -a
source .dev.vars
if [[ -f .dev.vars.production ]]; then
  source .dev.vars.production
fi
set +a

if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" || -z "${R2_S3_ACCESS_KEY_ID:-}" || -z "${R2_S3_SECRET_ACCESS_KEY:-}" ]]; then
  echo "Missing CLOUDFLARE_ACCOUNT_ID / R2_S3_ACCESS_KEY_ID / R2_S3_SECRET_ACCESS_KEY" >&2
  exit 1
fi

bun run scripts/cloud/delete-r2-buckets.ts "$@"

for bucket in "$@"; do
  printf "Deleting bucket %s\n" "$bucket"
  printf 'y\n' | bunx wrangler r2 bucket delete "$bucket"
done
