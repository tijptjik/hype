"""Collect a complete Lands Department venue snapshot, preserving raw responses."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import tempfile
import urllib.parse
import urllib.request

LAYERS = ('venue_polygon', 'level_polygon', 'unit_polygon', 'opening_line', 'amenity_point', 'occupant_point')


def collect(venue_id, destination, building=False):
    """Validate all layers before publishing the snapshot directory."""
    manifest = {
        'venueId': venue_id,
        'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'source': 'Lands Department 3D Indoor Building Map API' if building else 'Lands Department 3D Indoor MTR Station Map API',
        'documentation': 'https://tools.csdi.gov.hk/csdi-webpage/apidoc/' + ('3d-indoor-map-api' if building else '3d-indoor-mtr-station-map'),
        'entries': [],
    }
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        raise ValueError('Destination already exists; preserve the existing snapshot')
    with tempfile.TemporaryDirectory(dir=destination.parent) as temporary:
        staging = Path(temporary) / 'snapshot'
        staging.mkdir()
        for layer in LAYERS:
            query = urllib.parse.urlencode(dict(service='WFS', version='1.1.0', request='GetFeature', outputFormat='application/json', srsName='EPSG:4326', cql_filter=f"venue_id='{venue_id}'"))
            prefix = '' if building else 'mtr_'
            url = f'https://mapapi.hkmapservice.gov.hk/ogc/wfs/indoor/{prefix}{layer}?{query}'
            with urllib.request.urlopen(url, timeout=120) as response:
                raw = response.read()
            data = json.loads(raw)
            features = data['features']
            if data['type'] != 'FeatureCollection' or len(features) != int(data['totalFeatures']) or len(features) >= 5000:
                raise ValueError(f'Incomplete or capped layer: {layer}')
            if any(f['properties']['venue_id'] != venue_id for f in features):
                raise ValueError(f'Unexpected venue: {layer}')
            if layer == 'venue_polygon' and len(features) != 1:
                raise ValueError('Expected exactly one venue')
            (staging / f'{layer}.json').write_bytes(raw)
            manifest['entries'].append(dict(layer=layer, url=url, count=len(features), bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest()))
            print(layer, len(features), flush=True)
        (staging / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        staging.rename(destination)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('venue_id')
    parser.add_argument('destination', type=Path)
    parser.add_argument('--building', action='store_true', help='Use the building API instead of the MTR API')
    args = parser.parse_args()
    collect(args.venue_id, args.destination, args.building)
