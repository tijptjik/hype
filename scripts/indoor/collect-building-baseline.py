"""Collect complete government building maps without inferring links or occupancy.

Raw WFS pages are retained with hashes. Completed venues are resumable and immutable.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import datetime
import hashlib
import gzip
import json
from pathlib import Path
import re
import shutil
import tempfile
import time
import urllib.parse
import urllib.request

LAYERS = ('venue_polygon', 'level_polygon', 'unit_polygon', 'opening_line', 'amenity_point', 'occupant_point')


def write_json(path, value):
    """Write compact derived metadata without rewriting raw source responses."""
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n')


def expected_total(previous, offset, reported):
    """Accept either global totals or this API's count remaining after startIndex."""
    if reported < 0:
        raise ValueError('Negative source feature count')
    if previous is None:
        return reported
    if reported not in (previous, previous - offset):
        raise ValueError('Source count changed while paging')
    return previous


def collect(feature, root, existing):
    """Collect all six layers, checking pagination and exact source identity."""
    properties = feature['properties']
    venue_id = properties['venue_id']
    target = root / 'buildings' / venue_id
    slug = re.sub(r'[^a-z0-9]+', '-', properties['venue_name_en'].lower()).strip('-')[:80].rstrip('-') or 'building'
    identity = existing.get(venue_id, {'id': f'{slug}-{venue_id[:8]}', 'code': f'BLDG-{venue_id.upper()}'})
    entry = dict(id=identity['id'], code=identity['code'], venueId=venue_id, name=properties['venue_name_en'], nameZh=properties.get('venue_name_zh') or '', kind='building', sourceDataset='landsd-building', sourceDirectory=str(target), bundle=str(target / ('bundle.json' if (target / 'bundle.json').exists() else 'bundle.json.gz')))
    if (target / 'manifest.json').exists():
        manifest = json.loads((target / 'manifest.json').read_bytes())
        for page in manifest['pages']:
            stored = (target / page['path']).read_bytes()
            original = gzip.decompress(stored) if page['path'].endswith('.gz') else stored
            assert hashlib.sha256(original).hexdigest() == page['sha256']
        bundle_path = target / 'bundle.json'
        bundle_bytes = bundle_path.read_bytes() if bundle_path.exists() else gzip.decompress((target / 'bundle.json.gz').read_bytes())
        assert hashlib.sha256(bundle_bytes).hexdigest() == manifest['bundleHash']
        return entry
    if shutil.disk_usage(root).free < 1024 ** 3:
        raise RuntimeError('Less than 1 GiB disk space remains; collection paused')
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=target.parent, prefix=f'.{venue_id}-') as temporary:
        staging = Path(temporary)
        retrieved = datetime.datetime.now(datetime.timezone.utc).isoformat()
        pages, data = [], {}
        for layer in LAYERS:
            features, seen, expected = [], set(), None
            while expected is None or len(features) < expected:
                query = urllib.parse.urlencode(dict(service='WFS', version='1.1.0', request='GetFeature', outputFormat='application/json', srsName='EPSG:4326', cql_filter=f"venue_id='{venue_id}'", maxFeatures=5000, startIndex=len(features), sortBy=f"{layer.split('_')[0]}_id"))
                url = f'https://mapapi.hkmapservice.gov.hk/ogc/wfs/indoor/{layer}?{query}'
                for attempt in range(4):
                    try:
                        with urllib.request.urlopen(urllib.request.Request(url, headers={'Accept-Encoding': 'gzip'}), timeout=60) as response:
                            raw = response.read()
                        if response.headers.get('Content-Encoding') == 'gzip':
                            raw = gzip.decompress(raw)
                        page = json.loads(raw)
                        assert page['type'] == 'FeatureCollection'
                        break
                    except Exception:
                        if attempt == 3:
                            raise
                        time.sleep(2 ** attempt)
                total = int(page['totalFeatures'])
                expected = expected_total(expected, len(features), total)
                if expected and not page['features']:
                    raise ValueError(f'Incomplete page for {layer}')
                for item in page['features']:
                    assert item['properties']['venue_id'] == venue_id
                    source_id = item['properties'][f"{layer.split('_')[0]}_id"]
                    if source_id in seen:
                        raise ValueError(f'Duplicate page identity for {layer}')
                    seen.add(source_id)
                name = f'{layer}-{len(features):06d}.json'
                (staging / name).write_bytes(raw)
                pages.append(dict(path=name, url=url, sha256=hashlib.sha256(raw).hexdigest(), count=len(page['features'])))
                features.extend(page['features'])
                if len(features) > expected:
                    raise ValueError(f'Invalid total for {layer}')
            if layer == 'venue_polygon' and len(features) != 1:
                raise ValueError('Expected exactly one venue')
            data[layer] = dict(type='FeatureCollection', features=features)
        data.update(retrievedAt=retrieved, connections=[], sourceDataset='landsd-building')
        write_json(staging / 'bundle.json', dict(schemaVersion=1, data=data, documents=[]))
        write_json(staging / 'manifest.json', dict(venueId=venue_id, retrievedAt=retrieved, pages=pages, bundleHash=hashlib.sha256((staging / 'bundle.json').read_bytes()).hexdigest()))
        staging.rename(target)
    entry['bundle'] = str(target / 'bundle.json')
    return entry


def collect_batch(features, root, existing):
    """Fetch a small exact-ID group, retain raw pages once, then split complete venues."""
    if shutil.disk_usage(root).free < 1024 ** 3:
        raise RuntimeError('Less than 1 GiB disk space remains; collection paused')
    ids = sorted(f['properties']['venue_id'] for f in features)
    group_id = hashlib.sha256(','.join(ids).encode()).hexdigest()[:24]
    group = root / 'groups' / group_id
    group.parent.mkdir(parents=True, exist_ok=True)
    pages, data = [], {}
    retrieved = datetime.datetime.now(datetime.timezone.utc).isoformat()
    if group.exists():
        manifest = json.loads((group / 'manifest.json').read_bytes())
        pages, retrieved = manifest['pages'], manifest['retrievedAt']
        data = {layer: [] for layer in LAYERS}
        for page in pages:
            raw = gzip.decompress((group / page['path']).read_bytes())
            assert hashlib.sha256(raw).hexdigest() == page['sha256']
            data[page['layer']].extend(json.loads(raw)['features'])
    else:
        with tempfile.TemporaryDirectory(dir=group.parent, prefix='.batch-') as temporary:
            staging = Path(temporary)
            for layer in LAYERS:
                items, seen, expected = [], set(), None
                while expected is None or len(items) < expected:
                    selected = ','.join(f"'{value}'" for value in ids)
                    query = urllib.parse.urlencode(dict(service='WFS', version='1.1.0', request='GetFeature', outputFormat='application/json', srsName='EPSG:4326', cql_filter=f'venue_id IN ({selected})', maxFeatures=5000, startIndex=len(items), sortBy=f"{layer.split('_')[0]}_id"))
                    url = f'https://mapapi.hkmapservice.gov.hk/ogc/wfs/indoor/{layer}?{query}'
                    for attempt in range(4):
                        try:
                            with urllib.request.urlopen(urllib.request.Request(url, headers={'Accept-Encoding': 'gzip'}), timeout=90) as response:
                                raw = response.read()
                                if response.headers.get('Content-Encoding') == 'gzip':
                                    raw = gzip.decompress(raw)
                            page = json.loads(raw)
                            assert page['type'] == 'FeatureCollection'
                            break
                        except Exception:
                            if attempt == 3:
                                raise
                            time.sleep(2 ** attempt)
                    total = int(page['totalFeatures'])
                    expected = expected_total(expected, len(items), total)
                    if expected and not page['features']:
                        raise ValueError(f'Incomplete batch page for {layer}')
                    for item in page['features']:
                        assert item['properties']['venue_id'] in ids
                        source_id = item['properties'][f"{layer.split('_')[0]}_id"]
                        if source_id in seen:
                            raise ValueError(f'Duplicate page identity for {layer}')
                        seen.add(source_id)
                    name = f'{layer}-{len(items):06d}.json.gz'
                    (staging / name).write_bytes(gzip.compress(raw, compresslevel=3, mtime=0))
                    pages.append(dict(path=name, layer=layer, url=url, sha256=hashlib.sha256(raw).hexdigest(), count=len(page['features'])))
                    items.extend(page['features'])
                    if len(items) > expected:
                        raise ValueError(f'Invalid total for {layer}')
                data[layer] = items
            assert {f['properties']['venue_id'] for f in data['venue_polygon']} == set(ids)
            write_json(staging / 'manifest.json', dict(retrievedAt=retrieved, pages=pages))
            staging.rename(group)
    for feature in features:
        venue_id = feature['properties']['venue_id']
        target = root / 'buildings' / venue_id
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            continue
        with tempfile.TemporaryDirectory(dir=target.parent, prefix='.derived-') as temporary:
            staging = Path(temporary)
            venue_data = {layer: dict(type='FeatureCollection', features=[f for f in data[layer] if f['properties']['venue_id'] == venue_id]) for layer in LAYERS}
            assert len(venue_data['venue_polygon']['features']) == 1
            venue_data.update(retrievedAt=retrieved, connections=[], sourceDataset='landsd-building')
            write_json(staging / 'bundle.json', dict(schemaVersion=1, data=venue_data, documents=[]))
            shared_pages = [{**page, 'path': f"../../groups/{group_id}/{page['path']}"} for page in pages]
            write_json(staging / 'manifest.json', dict(venueId=venue_id, retrievedAt=retrieved, pages=shared_pages, bundleHash=hashlib.sha256((staging / 'bundle.json').read_bytes()).hexdigest()))
            staging.rename(target)
    return [collect(feature, root, existing) for feature in features]


def main():
    """Resume the exact inventory and emit successful entries plus explicit failures."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inventory', type=Path)
    parser.add_argument('destination', type=Path)
    parser.add_argument('--existing', type=Path, required=True)
    args = parser.parse_args()
    root = args.destination.resolve()
    root.mkdir(parents=True, exist_ok=True)
    raw = args.inventory.read_bytes()
    inventory = json.loads(raw)
    features = inventory['features']
    assert len(features) == int(inventory['totalFeatures'])
    assert len({f['properties']['venue_id'] for f in features}) == len(features)
    retained = root / 'venue-inventory.json'
    if retained.exists():
        assert retained.read_bytes() == raw, 'Cannot resume a different inventory'
    else:
        retained.write_bytes(raw)
    existing = json.loads(args.existing.read_bytes())
    entries, failures, pending = [], [], []
    for feature in features:
        if (root / 'buildings' / feature['properties']['venue_id'] / 'manifest.json').exists():
            entries.append(collect(feature, root, existing))
        else:
            pending.append(feature)
    print(f'RESUME {len(entries)}/{len(features)} complete', flush=True)
    batches = [pending[i:i + 8] for i in range(0, len(pending), 8)]
    with ThreadPoolExecutor(max_workers=4) as pool:
        jobs = {pool.submit(collect_batch, batch, root, existing): batch for batch in batches}
        for future in as_completed(jobs):
            batch = jobs[future]
            try:
                entries.extend(future.result())
                print(f"COMPLETE {len(entries)}/{len(features)}", flush=True)
            except Exception as error:
                for feature in batch:
                    failures.append(dict(venueId=feature['properties']['venue_id'], name=feature['properties']['venue_name_en'], error=str(error)))
                print(f"FAILED batch: {error}", flush=True)
    entries.sort(key=lambda entry: entry['id'])
    assert len({e['id'] for e in entries}) == len(entries), 'Map identity collision'
    write_json(root / 'index.json', entries)
    write_json(root / 'collection.json', dict(expected=len(features), complete=len(entries), failures=failures))
    print(json.dumps(dict(expected=len(features), complete=len(entries), failures=failures)), flush=True)
    if failures:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
