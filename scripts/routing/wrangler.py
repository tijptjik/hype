#!/usr/bin/env python3
"""Run Wrangler with the dedicated routing token, overriding inherited credentials.

Usage: python3 scripts/routing/wrangler.py <wrangler arguments>
Reads only the two Cloudflare values from the Git-ignored local token file.
"""
import os
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
env = dict(os.environ)
for line in (root / '.env.routing-benchmark.local').read_text().splitlines():
    if not line.strip() or line.lstrip().startswith('#'):
        continue
    key, value = line.split('=', 1)
    key = key.strip()
    if key in ('CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'):
        env[key] = value.strip().strip('"\'')
env['WRANGLER_LOG_PATH'] = '/tmp/hype-routing-wrangler.log'
sys.exit(subprocess.call(['bun', 'x', 'wrangler', *sys.argv[1:]], cwd=root, env=env))
