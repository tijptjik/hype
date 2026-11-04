#!/usr/bin/env bash
# Local machines share Dotjik's validation lock; isolated CI runners do not.
set -euo pipefail
if command -v dev-check >/dev/null 2>&1; then
    exec dev-check "$@"
elif [[ ${CI:-} == true || ${CI:-} == 1 ]]; then
    exec "$@"
fi
echo 'Install Dotjik dev-check before running local validation.' >&2
exit 69
