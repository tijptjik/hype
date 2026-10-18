#!/usr/bin/env python3
"""Configure Hype's credential for the private SaanSeoi routing service.

Usage: python3 scripts/routing/use-shared-service.py production|preview [--clients FILE]
Only the app's ROUTING_TOKEN secret is updated; app code is not deployed.
"""
import argparse
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]


def main():
    """Read the operator-held Hype client token and upload it over stdin."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('target', choices=['production', 'preview'])
    parser.add_argument('--clients', type=Path)
    args = parser.parse_args()
    path = args.clients or ROOT.parent / 'saanseoi/.local/routing' / f'clients-{args.target}.json'
    clients = json.loads(path.read_text())
    token = clients.get('hype')
    if not isinstance(token, str) or not token:
        raise SystemExit('No Hype client credential in the selected private registry.')
    subprocess.run([sys.executable, 'scripts/routing/wrangler.py', 'secret', 'put',
                    'ROUTING_TOKEN', '--config', 'wrangler.toml', '--env', args.target],
                   input=token + '\n', text=True, cwd=ROOT, check=True)
    print(f'Configured Hype {args.target} for the private shared SaanSeoi router.')


if __name__ == '__main__':
    main()
