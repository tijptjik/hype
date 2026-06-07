#!/usr/bin/env bash
set -euo pipefail

ASSET_PID=""

cleanup() {
  if [[ -n "${ASSET_PID}" ]]; then
    kill "${ASSET_PID}" 2>/dev/null || true
    wait "${ASSET_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

bun run dev:asset-service:remote &
ASSET_PID=$!

vite dev
