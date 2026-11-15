#!/usr/bin/env bash
# Hold a kernel-managed lock across manual and scheduled commands; crashes release it.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
mkdir -p "${XDG_STATE_HOME:-$HOME/.local/state}/hype/indoor-dataops"
exec flock --nonblock "${XDG_STATE_HOME:-$HOME/.local/state}/hype/indoor-dataops/command.lock" bun scripts/dataops/indoor/cli.ts "$@"
