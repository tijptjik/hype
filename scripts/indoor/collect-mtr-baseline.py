"""Collect all catalogued MTR source snapshots and prepare an immutable R2 upload.

No remote writes or database publication. Stage outside the auto-synced research tree.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shutil
import time

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('geometry', Path(__file__).with_name('download-geometry.py'))
geometry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(geometry)


def write_json(path, value):
    """Write deterministic JSON for content-addressed upload preparation."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def main():
    """Validate inventory coverage, collect with bounded retries, then inventory every object."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inventory', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    destination = args.destination.resolve()
    if destination.exists():
        raise ValueError('Use a new baseline directory; existing snapshots are immutable')
    inventory = json.loads(args.inventory.read_bytes())
    stations = json.loads((ROOT / 'src/lib/routing/mtr-catalog.json').read_bytes())['stations']
    if len(inventory['features']) != int(inventory['totalFeatures']):
        raise ValueError('Incomplete venue inventory')
    by_name = {s['name'].casefold(): s for s in stations}
    matched = []
    for feature in inventory['features']:
        props = feature['properties']
        station = by_name[props['venue_name_en'].removesuffix(' Station').casefold()]
        matched.append((station, props['venue_id']))
    if len({s['id'] for s, _ in matched}) != len(stations) or len(matched) != len(stations):
        raise ValueError('Inventory does not match the complete station catalogue')
    destination.mkdir(parents=True)
    shutil.copyfile(args.inventory, destination / 'venue-inventory.json')
    write_json(destination / 'catalogue.json', stations)
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()

    def collect_station(station, venue_id):
        """Retry complete atomic station collection without retaining partial layers."""
        target = destination / 'stations' / station['id']
        for attempt in range(3):
            try:
                geometry.collect(venue_id, target)
                manifest = json.loads((target / 'manifest.json').read_bytes())
                data = {layer: json.loads((target / f'{layer}.json').read_bytes()) for layer in geometry.LAYERS}
                data.update(retrievedAt=manifest['retrievedAt'], connections=[])
                bundle = {'schemaVersion': 1, 'data': data, 'documents': []}
                map_id = re.sub(r'[^a-z0-9]+', '-', station['name'].lower()).strip('-') + '-mtr'
                write_json(target / 'bundle.json', bundle)
                return dict(code=station['id'], venueId=venue_id, id=map_id, name=station['name'], nameZh=station['nameZh'], kind='station', sourceDataset='landsd-mtr', sourceDirectory=str(target), bundle=str(target / 'bundle.json'), counts={e['layer']: e['count'] for e in manifest['entries']})
            except Exception:
                if target.exists() or attempt == 2:
                    raise
                time.sleep(2 ** attempt)

    results, failures = [], []
    with ThreadPoolExecutor(max_workers=4) as pool:
        jobs = {pool.submit(collect_station, station, venue): station for station, venue in matched}
        for future in as_completed(jobs):
            station = jobs[future]
            try:
                results.append(future.result())
                print(f"COMPLETE {station['id']} {len(results)}/{len(stations)}", flush=True)
            except Exception as error:
                failures.append(dict(code=station['id'], error=str(error)))
                print(f"FAILED {station['id']}: {error}", flush=True)
    results.sort(key=lambda entry: entry['code'])
    write_json(destination / 'index.json', results)
    write_json(destination / 'collection.json', dict(startedAt=started, finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(), inventoryUrl='https://mapapi.hkmapservice.gov.hk/ogc/wfs/indoor/mtr_venue_polygon?service=WFS&version=1.1.0&request=GetFeature&outputFormat=application%2Fjson&srsName=EPSG%3A4326', expected=len(stations), complete=len(results), failures=failures, publication='not published; connections and documents require review'))
    objects = []
    for path in sorted(destination.rglob('*')):
        if path.is_file():
            raw = path.read_bytes()
            objects.append(dict(path=path.relative_to(destination).as_posix(), bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest()))
    write_json(destination / 'upload-manifest.json', dict(remote=f'r2-tijpdata:hype-assets-raw-dev/premises-maps/source-baselines/{destination.name}', objects=objects, totalBytes=sum(o['bytes'] for o in objects), ready=not failures))
    if failures:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
