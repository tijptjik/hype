#!/usr/bin/env bash
# Install only the owned indoor-map units; user drop-ins remain untouched.
set -euo pipefail
if [[ $# != 2 || $1 != --target || ! $2 =~ ^(local|prod)$ ]]; then
  echo 'Usage: bash scripts/dataops/install-systemd.sh --target local|prod' >&2
  exit 2
fi
indoor_target=$2
indoor_units=$(cd "$(dirname "${BASH_SOURCE[0]}")/systemd" && pwd)
indoor_destination="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
mkdir -p "$indoor_destination"
sed "s/Environment=HYPE_INDOOR_TARGET=local/Environment=HYPE_INDOOR_TARGET=$indoor_target/" "$indoor_units/hype-indoor-monthly.service" > "$indoor_destination/hype-indoor-monthly.service"
install -m 644 "$indoor_units/hype-indoor-monthly.timer" "$indoor_destination/hype-indoor-monthly.timer"
systemd-analyze --user verify "$indoor_destination/hype-indoor-monthly.service" "$indoor_destination/hype-indoor-monthly.timer"
systemctl --user daemon-reload
systemctl --user enable --now hype-indoor-monthly.timer
systemctl --user list-timers hype-indoor-monthly.timer --no-pager
