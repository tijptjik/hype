#!/usr/bin/env python3
"""Copy missing catalogue PNGs from isolated local R2 to the shared development bucket.

Existing objects must match byte-for-byte. This command never changes catalogue URLs,
production buckets, or database records. Run without --apply to preview missing assets.
"""
import argparse
import hashlib
import json
import re
import sqlite3
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


def fetch(url):
    """Return bytes, or None only for an explicit missing object."""
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            if response.headers.get_content_type() != 'image/png':
                raise RuntimeError(f'Not a PNG: {url}')
            return response.read()
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None
        raise


def main():
    """Preview or repair the development-only object set and write verification receipts."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', required=True, type=Path)
    parser.add_argument('--source-origin', default='http://127.0.0.1:4173')
    parser.add_argument('--target-origin', default='http://hype.localhost')
    parser.add_argument('--report', required=True, type=Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    for origin in [args.source_origin, args.target_origin]:
        host = urllib.parse.urlparse(origin).hostname or ''
        if host not in ('127.0.0.1', 'localhost') and not host.endswith('.localhost'):
            parser.error('Only local server origins are supported')
    with sqlite3.connect(f'file:{args.database.resolve()}?mode=ro', uri=True) as db:
        rows = db.execute("""SELECT DISTINCT json_extract(r.content,'$.logo')
          FROM identityCatalogue c JOIN identityCatalogueRevisionContent r
          ON r.catalogueId=c.id AND r.version=c.version
          WHERE json_extract(r.content,'$.logo') IS NOT NULL""").fetchall()
    receipts = []
    args.report.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='hype-catalogue-logos-') as folder:
        for (path,) in rows:
            if not re.fullmatch(r'/api/identity-catalogue/logos/[a-f0-9-]{36}', path):
                raise RuntimeError('Unexpected catalogue asset path')
            source = fetch(args.source_origin + path)
            if not source or source[:8] != b'\x89PNG\r\n\x1a\n' or len(source) > 1048576:
                raise RuntimeError(f'Missing or invalid source PNG: {path}')
            digest = hashlib.sha256(source).hexdigest()
            target = fetch(args.target_origin + path)
            if target is not None and target != source:
                raise RuntimeError(f'Existing object differs; refusing replacement: {path}')
            state = 'verified' if target is not None else 'missing'
            if target is None and args.apply:
                asset_id = path.rsplit('/', 1)[1]
                filename = Path(folder) / f'{asset_id}.png'
                filename.write_bytes(source)
                subprocess.run(['bun', 'x', 'wrangler', 'r2', 'object', 'put',
                    f'hype-assets-dev/identity-catalogue/{asset_id}.png', '--remote',
                    '--file', str(filename), '--content-type', 'image/png',
                    '--cache-control', 'public, max-age=31536000, immutable'], check=True)
                if fetch(args.target_origin + path) != source:
                    raise RuntimeError(f'Target verification failed: {path}')
                state = 'uploaded-and-verified'
            receipts.append({'path': path, 'sha256': digest, 'bytes': len(source), 'state': state})
            args.report.write_text(json.dumps(receipts, indent=2) + '\n')
            print(state, path, flush=True)
    print(f'{len(receipts)} catalogue logos checked; report: {args.report}')


if __name__ == '__main__':
    main()
