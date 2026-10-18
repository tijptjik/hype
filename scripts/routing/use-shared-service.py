#!/usr/bin/env python3
"""Configure Hype's credential for the private SaanSeoi routing service.

Usage: python3 scripts/routing/use-shared-service.py local|production|preview [--clients FILE]
Local setup updates .dev.vars; remote setup uploads only ROUTING_TOKEN.
"""
import argparse
import json
import os
import re
import tempfile
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]


def main():
    """Configure the local or deployed Hype credential for its shared routing service."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('target', choices=['local', 'production', 'preview'])
    parser.add_argument('--clients', type=Path)
    args = parser.parse_args()
    registry_target = 'preview' if args.target == 'local' else args.target
    path = args.clients or ROOT.parent / 'saanseoi/.local/routing' / f'clients-{registry_target}.json'
    clients = json.loads(path.read_text())
    token = clients.get('hype')
    if not isinstance(token, str) or not token:
        raise SystemExit('No Hype client credential in the selected private registry.')
    if args.target == 'local':
        env_path = ROOT / '.dev.vars'
        content = env_path.read_text() if env_path.exists() else ''
        assignment = 'ROUTING_TOKEN=' + json.dumps(token)
        pattern = r'(?m)^[ \t]*(?:export[ \t]+)?ROUTING_TOKEN[ \t]*=[^\n]*'
        if len(re.findall(pattern, content)) > 1:
            raise SystemExit('Multiple ROUTING_TOKEN entries in .dev.vars; resolve them first.')
        if re.search(pattern, content):
            content = re.sub(pattern, lambda _: assignment, content)
        else:
            content = content.rstrip('\n') + '\n' + assignment + '\n'
        # Replace the secret file atomically with owner-only permissions.
        with tempfile.NamedTemporaryFile(mode='w', dir=ROOT, prefix='.dev.vars.routing-', delete=False) as temporary:
            temporary.write(content)
        os.replace(temporary.name, env_path)
        print('Configured local Hype for ss-routing-preview; restart Vite.')
        return
    subprocess.run([sys.executable, 'scripts/routing/wrangler.py', 'secret', 'put',
                    'ROUTING_TOKEN', '--config', 'wrangler.toml', '--env', args.target],
                   input=token + '\n', text=True, cwd=ROOT, check=True)
    print(f'Configured Hype {args.target} for the private shared SaanSeoi router.')


if __name__ == '__main__':
    main()
