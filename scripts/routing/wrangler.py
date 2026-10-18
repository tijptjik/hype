#!/usr/bin/env python3
"""Run Wrangler with optional environment-specific routing deployment credentials.

Usage: python3 scripts/routing/wrangler.py <wrangler arguments>
Reads only the two Cloudflare values from the selected Git-ignored token file.
ROUTING_CLOUDFLARE_ENV_FILE selects another operator-provided credential file;
without a local file, existing Cloudflare environment credentials are retained.
"""
import os
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
env = dict(os.environ)
arguments = sys.argv[1:]
target = arguments[arguments.index('--env') + 1] if '--env' in arguments else None
default_file = root / f'.env.routing-{target}.local' if target else root / '.env.routing.local'
credential_file = Path(os.environ.get('ROUTING_CLOUDFLARE_ENV_FILE', default_file))
credential_lines = credential_file.read_text().splitlines() if credential_file.exists() else []
for line in credential_lines:
    if not line.strip() or line.lstrip().startswith('#'):
        continue
    key, value = line.split('=', 1)
    key = key.strip()
    if key in ('CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'):
        env[key] = value.strip().strip('"\'')
env['WRANGLER_LOG_PATH'] = '/tmp/hype-routing-wrangler.log'
sys.exit(subprocess.call(['bun', 'x', 'wrangler', *sys.argv[1:]], cwd=root, env=env))
