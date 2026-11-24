#!/usr/bin/env bash
# Finite integration fixture: private HTTP worker exists only while Chrome tests run.
set -euo pipefail
set -a
source "${FLOORPLAN_DEV_ENV:-$HOME/.local/state/hype-floorplans/development.env}"
set +a
export FLOORPLAN_PORT=18931
export FLOORPLAN_STATE
FLOORPLAN_STATE=$(mktemp -d)
python3 scripts/floorplans/fixture_server.py &
worker_pid=$!
trap 'kill "$worker_pid" 2>/dev/null || true; wait "$worker_pid" 2>/dev/null || true; rm -rf "$FLOORPLAN_STATE"' EXIT
for attempt in {1..50}; do
  if curl -s -o /dev/null http://127.0.0.1:18931/jobs; then break; fi
  sleep .1
done
dev-remote --port 4173 chrome env FLOORPLAN_INTEGRATION=1 bun x playwright test --config .dotjik-runner/playwright.config.mjs tests/e2e/interior-editor/interior.spec.mjs
