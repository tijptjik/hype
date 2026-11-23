"""Capture published station maps and immutable network inputs for connector preparation.

Usage: dev-check python3 scripts/indoor/capture_connector_inputs.py ORIGIN OUTPUT
Read-only HTTP requests; never changes database, map pointers or publications.
"""
import concurrent.futures
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path


def read_url(url, optional=False):
    """Retrieve public bytes with bounded retries; only a genuine 404 counts as missing."""
    response = subprocess.run(['curl', '-sS', '--retry', '2', '--max-time', '60', '-w', '\n%{http_code}', url], capture_output=True, check=True)
    body, status = response.stdout.rsplit(b'\n', 1)
    if optional and status == b'404':
        return None
    if status != b'200':
        raise ValueError(f'HTTP {status.decode()} retrieving {url}')
    return body


def main():
    """Pin complete published bundles and matching network identities with a capture manifest."""
    origin, directory = sys.argv[1:]
    output = Path(directory)
    for name in ('bundles', 'networks'):
        (output / name).mkdir(parents=True, exist_ok=True)
    catalogue = json.loads(read_url(origin.rstrip('/') + '/api/premises-maps'))
    stations = [item for item in catalogue if item['kind'] == 'station']

    def capture(item):
        """Check release integrity before recording one station's inputs."""
        code = item['code']
        assert re.fullmatch('[A-Z0-9]+', code)
        raw = read_url(f"{origin.rstrip('/')}/api/premises-maps/{item['id']}/releases/{item['publishedHash']}")
        assert hashlib.sha256(raw).hexdigest() == item['publishedHash']
        (output / 'bundles' / f'{code}.json').write_bytes(raw)
        network = read_url(f'https://tiles.saanseoi.hk/routing/hk/indoor/2026-11-16/stations/{code}.json', optional=True)
        if network is not None:
            assert json.loads(network)['code'] == code
            (output / 'networks' / f'{code}.json').write_bytes(network)
        return dict(code=code, mapId=item['id'], hash=item['publishedHash'], network=network is not None)

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(capture, stations))
    (output / 'inputs.json').write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps(dict(maps=len(results), networks=sum(r['network'] for r in results))))


if __name__ == '__main__':
    main()
