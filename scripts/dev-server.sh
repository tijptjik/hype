#!/usr/bin/env bash
# Long-lived servers use a separate memory scope without the validation lock.
set -euo pipefail
if command -v dev-server >/dev/null 2>&1; then
    exec dev-server "$@"
elif [[ ${CI:-} == true || ${CI:-} == 1 ]]; then
    exec "$@"
fi
echo 'Install Dotjik dev-server before running local development servers.' >&2
exit 69
