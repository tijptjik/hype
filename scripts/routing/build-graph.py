#!/usr/bin/env python3
"""Build one shared HK graph with Valhalla 3.8.3; emit WASM and native configs.

Usage: python3 scripts/routing/build-graph.py /absolute/input.osm.pbf
Requires Docker and the checked-out valhalla-wasm scripts passed in SDK_SOURCE.
Outputs are ignored under build/routing-benchmark, never application data.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / 'build/routing-benchmark'
IMAGE = 'ghcr.io/valhalla/valhalla:3.8.3@sha256:70b45295d81035e3562e1bbf996a28d5fc55e1ccc5d7e3fff9f297d3b1a1359f'
REVISION = 'a60c7cbfc83e073f50887cd27e0109d02e6b64e5'


def digest(path):
    """Calculate a streaming SHA-256 for reproducible build provenance."""
    result = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for part in iter(lambda: stream.read(1048576), b''):
            result.update(part)
    return result.hexdigest()


def run(*args, capture=False):
    """Run an isolated, memory-limited native graph builder."""
    return subprocess.run(['docker', 'run', '--rm', '--memory=3g', '--memory-swap=3g',
        '--cpus=2', '--user', f'{os.getuid()}:{os.getgid()}',
        '-v', f'{WORK}:/work', '--entrypoint', args[0], IMAGE, *args[1:]],
        check=True, capture_output=capture, text=True)


def main():
    """Build graph artifacts without replacing an existing experiment."""
    source = Path(sys.argv[1]).resolve(strict=True)
    sdk = Path(os.environ['SDK_SOURCE']).resolve(strict=True)
    sdk_revision = subprocess.check_output(['git','-C',str(sdk),'rev-parse','HEAD'],text=True).strip()
    if sdk_revision != '53db62e78891b51e06600ed6369005c975ce5835':
        raise SystemExit('Use the SDK validator revision pinned in scripts/routing/README.md.')
    WORK.mkdir(parents=True, exist_ok=True)
    if (WORK / 'graph.tar').exists():
        raise SystemExit('Graph already exists; retain it or choose a fresh experiment directory.')
    shutil.copyfile(source, WORK / 'input.osm.pbf')
    config = json.loads(run('valhalla_build_config', capture=True).stdout)
    config['mjolnir'].update(tile_dir='/work/tiles', tile_extract='', tile_url='',
        concurrency=1, admin='', timezone='', include_driving=True,
        include_bicycle=True, include_pedestrian=True, max_cache_size=256*1048576,
        use_lru_mem_cache=True, lru_mem_cache_hard_control=True,
        global_synchronized_cache=False)
    # This experiment compares untimed street routes; transit/timezone import is separate.
    config['mjolnir']['data_processing']['use_admin_db'] = False
    config['loki'].update(use_connectivity=False, actions=['route'])
    config['thor'].update(max_reserved_labels_count_astar=16384,
        max_reserved_labels_count_bidir_astar=16384, clear_reserved_memory=False)
    config['httpd']['service']['listen'] = 'tcp://0.0.0.0:8002'
    for section in ('mjolnir', 'loki', 'thor', 'odin'):
        config[section]['logging'] = {'type': 'std_err', 'color': False}
    (WORK / 'build-config.json').write_text(json.dumps(config, indent=2))
    run('valhalla_build_tiles', '-c', '/work/build-config.json', '/work/input.osm.pbf')
    config['mjolnir']['tile_extract'] = '/work/graph.tar'
    (WORK / 'archive-config.json').write_text(json.dumps(config, indent=2))
    run('valhalla_build_extract', '-c', '/work/archive-config.json')
    # Reuse the SDK's archive validator, which verifies native GraphIds and byte offsets.
    spec = importlib.util.spec_from_file_location('sdk_builder', sdk / 'scripts/build-dataset.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    index, tiles = module.inspect_archive(WORK / 'graph.tar')
    release = 'hk-2026-10-01'
    output = WORK / 'datasets' / release
    output.mkdir(parents=True, exist_ok=True)
    config['mjolnir'].update(tile_dir='', tile_extract='', admin='', timezone='')
    config['mjolnir']['max_cache_size'] = 64*1048576
    config_bytes = module.json_bytes(config)
    (output / 'config.json').write_bytes(config_bytes)
    shutil.copyfile(WORK / 'graph.tar', output / 'graph.tar')
    archive_hash = digest(output / 'graph.tar')
    manifest = {'schema': 1, 'release': release, 'valhallaRevision': REVISION,
        'valhallaVersion': '3.8.3', 'costings': ['auto','bicycle','pedestrian','truck'],
        'coverage': [113.8,22.1,114.5,22.6],
        'config': {'url':'config.json', 'sha256':module.sha(config_bytes)},
        'archive': {'url':'graph.tar', 'size':str((output/'graph.tar').stat().st_size),
            'etag':f'"{archive_hash}"', 'headerSha256':module.sha((output/'graph.tar').open('rb').read(512)),
            'indexSize':str(len(index)), 'indexSha256':module.sha(index)}, 'tiles':tiles,
        'source': {'sha256':digest(source), 'attribution':'© OpenStreetMap contributors, ODbL 1.0'}}
    (output / 'manifest.json').write_bytes(module.json_bytes(manifest))
    # Native and WASM share identical graph bytes, cache size and search reservations.
    native = json.loads(config_bytes)
    native['mjolnir'].update(tile_dir='/routing/tiles', tile_extract='/routing/graph.tar')
    (WORK / 'native-config.json').write_bytes(module.json_bytes(native))
    destination = ROOT / 'workers/routing-benchmark/container/data'
    destination.mkdir(parents=True, exist_ok=True)
    for name in ('native-config.json','graph.tar'):
        shutil.copyfile(WORK/name, destination/name)
    report = {'sourceSha256':digest(source), 'graphSha256':archive_hash,
        'archiveBytes':(output/'graph.tar').stat().st_size, 'tiles':len(tiles),
        'largestTileBytes':max(int(t['size']) for t in tiles.values()),
        'nativeImage':IMAGE, 'valhallaRevision':REVISION,
        'limitations':['No elevation, traffic, admin/timezone databases or transit feeds imported.']}
    (WORK/'build-report.json').write_bytes(module.json_bytes(report))
    print(json.dumps(report,indent=2))


if __name__ == '__main__':
    main()
