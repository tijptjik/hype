"""Convert TKO Plaza's official image-map hotspots into schematic indoor layers.

Coordinates remain in the website's displayed image pixels, not longitude/latitude.
Reviewed artwork traces supplement source hotspots; no routing geometry is inferred.
"""
import argparse
import datetime
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import struct
import tempfile
import urllib.parse
import urllib.request
import uuid
from shapely.geometry import shape, mapping, Polygon, box
from shapely import make_valid
from shapely.ops import unary_union
from tko_geometry import close_unit_seams

BASE = 'https://www.tkoplaza.com.hk'
NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, BASE)
LAYERS = ('venue_polygon', 'level_polygon', 'unit_polygon', 'opening_line', 'amenity_point', 'occupant_point')


def identity(key):
    """Derive repeatable IDs from the source's location identity, never display names."""
    return str(uuid.uuid5(NAMESPACE, key))


class FloorParser(HTMLParser):
    """Read only structured map areas and their explicitly linked directory labels."""
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.areas, self.labels = [], {}
        self.current = None
        self.in_name = False
        self.in_code = False
        self.image = None
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'area':
            self.areas.append(attrs)
        if tag == 'img' and attrs.get('usemap'):
            self.image = attrs
        if tag == 'li' and attrs.get('id', '').startswith('location_'):
            self.current = {'location': attrs['id'], 'shop': attrs.get('shop_id'), 'name': '', 'code': ''}
        if tag == 'div' and attrs.get('class') == 'name' and self.current:
            self.in_name = True
        if tag == 'span' and self.in_name:
            self.in_code = True

    def handle_data(self, text):
        if self.current and self.in_name:
            self.current['code' if self.in_code else 'name'] += text

    def handle_endtag(self, tag):
        if tag == 'span':
            self.in_code = False
        if tag == 'div':
            self.in_name = False
        if tag == 'li' and self.current:
            record = self.current
            record['name'] = ' '.join(record['name'].split())
            record['code'] = ' '.join(record['code'].split())
            if record['location'] in self.labels:
                raise ValueError('Duplicate source location')
            self.labels[record['location']] = record
            self.current = None


def polygon(area):
    """Expand rectangles and close polygons without changing source vertices."""
    numbers = [int(n) for n in area['coords'].rstrip(',').split(',')]
    if area['shape'] == 'rect' and len(numbers) == 4:
        x1, y1, x2, y2 = numbers
        points = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
    elif area['shape'] == 'poly' and len(numbers) >= 6 and len(numbers) % 2 == 0:
        points = [numbers[i:i + 2] for i in range(0, len(numbers), 2)]
    else:
        raise ValueError(f'Unsupported hotspot: {area}')
    if points[-1] != points[0]:
        points.append(points[0][:])
    return {'type': 'Polygon', 'coordinates': [points]}


def jpeg_size(raw):
    """Read original JPEG dimensions to match the website's displayed image scale."""
    if raw[:2] != b'\xff\xd8':
        raise ValueError('Expected JPEG artwork')
    offset = 2
    while offset < len(raw):
        if raw[offset] != 255:
            raise ValueError('Invalid JPEG marker')
        marker = raw[offset + 1]
        length = int.from_bytes(raw[offset + 2:offset + 4], 'big')
        if marker in (192, 193, 194):
            height, width = struct.unpack('>HH', raw[offset + 5:offset + 9])
            return width, height
        offset += 2 + length
    raise ValueError('Missing JPEG dimensions')


def collect(archive, destination, annotations_path):
    """Archive public responses and emit a provenance-labelled schematic snapshot."""
    if destination.exists():
        raise ValueError('Preserve the existing snapshot; choose a new destination')
    archive.mkdir(parents=True, exist_ok=True)
    destination.mkdir(parents=True)
    annotations = json.loads(annotations_path.read_text())
    sources = []
    unmapped = []

    def fetch(url, filename, body=None):
        path = archive / filename
        # Reuse the immutable archive for repeatable conversion without extra requests.
        if not path.exists():
            request = urllib.request.Request(url, data=body)
            with urllib.request.urlopen(request, timeout=60) as response:
                path.write_bytes(response.read())
        raw = path.read_bytes()
        sources.append({'url': url, 'method': 'POST' if body else 'GET', 'body': body.decode() if body else None,
                        'file': filename, 'sha256': hashlib.sha256(raw).hexdigest()})
        return raw

    venue = identity('venue')
    layers = {name: [] for name in LAYERS}
    for floor in (1, 2):
        body = urllib.parse.urlencode({'level': floor}).encode()
        en = FloorParser(fetch(f'{BASE}/en/floor_level', f'level-{floor}-en.html', body).decode())
        zh = FloorParser(fetch(f'{BASE}/hk/floor_level', f'level-{floor}-zh.html', body).decode())
        if not en.image or not en.areas or len(en.areas) != len(en.labels):
            raise ValueError('Incomplete source floor')
        level = identity(f'level:{floor}')
        image_url = urllib.parse.urljoin(BASE, en.image['src'])
        raw = fetch(image_url, f'level-{floor}.jpg')
        width, height = jpeg_size(raw)
        display_width = int(en.image['width'])
        display_height = height * display_width / width
        shutil.copyfile(archive / f'level-{floor}.jpg', destination / f'level-{floor}.jpg')
        common = {'venue_id': venue, 'venue_name_en': 'TKO Plaza', 'venue_name_zh': '將軍澳廣場',
                  'level_id': level, 'level_ordinal': floor, 'level_z_value': None,
                  'level_name_en': f'Level {floor}', 'level_name_zh': f'{floor}樓',
                  'level_short_name_en': f'L{floor}', 'source_url': f'{BASE}/en/find-us?submenu=floor&level={floor}'}
        annotation = annotations['floors'][str(floor)]
        boundary = annotation['boundary']
        extent = {'type': 'Polygon', 'coordinates': [boundary + [boundary[0]]]}
        layers['level_polygon'].append({'type': 'Feature', 'geometry': extent, 'properties': {
            **common, 'geometry_role': 'reviewed_artwork_trace', 'image_path': f'level-{floor}.jpg',
            'image_width': display_width, 'image_height': display_height}})
        if floor == 1:
            layers['venue_polygon'].append({'type': 'Feature', 'geometry': extent, 'properties': {
                'venue_id': venue, 'venue_name_en': 'TKO Plaza', 'venue_name_zh': '將軍澳廣場', 'geometry_role': 'reviewed_artwork_trace'}})
        # Separate service-colour regions from circulation; retain neutral semantics.
        import cv2
        import numpy as np
        from PIL import Image
        pixels = np.asarray(Image.open(archive / f'level-{floor}.jpg').convert('RGB'))
        mask = (np.max(abs(pixels.astype(int) - [209, 210, 212]), axis=2) < 18).astype('uint8') * 255
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        scale = display_width / width
        contours = sorted(contours, key=lambda c: tuple(cv2.boundingRect(c)[:2]))
        for index, contour in enumerate(contours):
            if cv2.contourArea(contour) * scale * scale < 80:
                continue
            ring = [[round(float(x) * scale, 2), round(float(y) * scale, 2)]
                    for [[x, y]] in cv2.approxPolyDP(contour, 1.5 / scale, True)]
            if len(ring) < 3:
                continue
            layers['unit_polygon'].append({'type': 'Feature', 'geometry': {'type': 'Polygon', 'coordinates': [ring + [ring[0]]]},
                'properties': {**common, 'unit_id': identity(f'level:{floor}:grey:{index}'),
                    'unit_category': 'unspecified', 'unit_name_en': 'Unclassified area',
                    'geometry_role': 'artwork_colour_trace', 'source_colour': '#d1d2d4'}})
        for category, name, x, y in annotation['amenities']:
            layers['amenity_point'].append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [x, y]},
                'properties': {**common, 'amenity_id': identity(f'level:{floor}:symbol:{name}'),
                    'amenity_category': category, 'amenity_name_en': name,
                    'geometry_role': 'reviewed_symbol_anchor', 'source_image': f'level-{floor}.jpg'}})
        for area in en.areas:
            label = en.labels[area['shop']]
            chinese = zh.labels.get(area['shop'])
            if not chinese or chinese['shop'] != label['shop']:
                raise ValueError('Bilingual source identity mismatch')
            traced = annotation['missingUnits'].get(area['shop'])
            if not area['coords'].strip() and not traced:
                unmapped.append({**label, 'nameZh': chinese['name'], 'level': floor, 'reason': 'Source hotspot has no coordinates'})
                continue
            geometry = {'type': 'Polygon', 'coordinates': [traced + [traced[0]]]} if traced else polygon(area)
            if any(not (0 <= x <= display_width and 0 <= y <= display_height) for x, y in geometry['coordinates'][0]):
                raise ValueError('Hotspot outside displayed image')
            # Repair source self-intersections while retaining exact raw source coordinates.
            source_geometry = shape(geometry)
            repaired = not source_geometry.is_valid
            if repaired:
                valid = make_valid(source_geometry)
                if valid.geom_type == 'GeometryCollection':
                    valid = unary_union([part for part in valid.geoms if part.geom_type in ('Polygon', 'MultiPolygon')])
                geometry = json.loads(json.dumps(mapping(valid)))
            unit = identity(f'level:{floor}:location:{area["shop"]}')
            properties = {**common, 'unit_id': unit, 'unit_category': 'room', 'unit_name_en': label['code'],
                          'unit_name_zh': chinese['code'], 'unit_unitnumbername': label['code'],
                          'unit_restriction': None, 'unit_accessibility': None,
                          'geometry_role': 'reviewed_artwork_trace' if traced else 'clickable_hotspot', 'source_location_id': area['shop'],
                          'geometry_repaired': repaired, 'source_shape': area['shape'], 'source_coords': area['coords'], 'source_shop_id': label['shop']}
            layers['unit_polygon'].append({'type': 'Feature', 'geometry': geometry, 'properties': properties})
            if not label['name'] or not re.fullmatch(r'shop_\d+', label['shop'] or ''):
                continue
            points = polygon(area)['coordinates'][0][:-1] if not traced else traced
            # This display anchor is not an entrance or routing endpoint.
            anchor = [sum(p[i] for p in points) / len(points) for i in (0, 1)]
            layers['occupant_point'].append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': anchor},
                'properties': {**common, 'unit_id': unit, 'occupant_id': identity(f'occupant:{floor}:{area["shop"]}:{label["shop"]}'),
                               'occupant_name_en': label['name'], 'occupant_name_zh': chinese['name'],
                               'occupant_category': 'shopping', 'source_shop_id': label['shop'], 'geometry_role': 'display_anchor'}})
        close_unit_seams([feature for feature in layers['unit_polygon'] if feature['properties']['level_id'] == level], floor=shape(extent))
        # Apply reviewed shared coordinates where the raster and hotspot outlines disagree.
        floor_units = [feature for feature in layers['unit_polygon'] if feature['properties']['level_id'] == level]
        for feature in floor_units:
            properties = feature['properties']
            ring = annotation.get('reviewedUnits', {}).get(properties.get('source_location_id')) or annotation.get('reviewedAreas', {}).get(properties['unit_id'])
            if ring:
                feature['geometry'] = mapping(Polygon(ring))
                properties['boundary_regularization'] = 'reviewed-shared-coordinates'
        # Shop boundaries own their edge; trim grey artwork traces at those shared interfaces.
        reviewed = [shape(feature['geometry']) for feature in floor_units if feature['properties'].get('source_location_id')]
        reviewed_coverage = unary_union(reviewed)
        for feature in floor_units:
            if feature['properties']['geometry_role'] == 'artwork_colour_trace':
                feature['geometry'] = mapping(shape(feature['geometry']).difference(reviewed_coverage))
        if floor == 1:
            shop = next(feature for feature in floor_units if feature['properties'].get('unit_unitnumbername') == 'L1-142')
            original = shape(shop['geometry'])
            rectangle = box(90, 425, 146, 449)
            neighbour = min((feature for feature in floor_units if feature['properties']['geometry_role'] == 'artwork_colour_trace'), key=lambda feature: shape(feature['geometry']).distance(original))
            neighbour['geometry'] = mapping(shape(neighbour['geometry']).union(original).union(rectangle).difference(rectangle))
            shop['geometry'] = mapping(rectangle)
            shop['properties']['boundary_regularization'] = 'reviewed-rectangle'

    manifest = {'venueId': venue, 'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'source': 'TKO Plaza official floor directory', 'sourceUrl': f'{BASE}/en/find-us?submenu=floor',
                'coordinateSpace': 'image-pixels', 'geometryRole': 'hotspots-and-reviewed-artwork-traces', 'annotationMethod': annotations['method'],
                'limitations': 'Schematic image-map hotspots, not surveyed boundaries. No geographic registration, heights, doorways or navigation network supplied.',
                'boundaryCorrection': {'method': 'minimum-corridor-width', 'minimumCorridorWidthPixels': 10, 'reference': 'Narrow stepped passage beside L1-004 in the official plan', 'regularization': 'Shared planar coverage simplified at 2px, plus reviewed orthogonal coordinates', 'preserves': 'Source coordinates, unit identities and reference corridor' },
                'sources': sources, 'unmappedPlaces': unmapped, 'entries': []}
    for layer, features in layers.items():
        payload = {'type': 'FeatureCollection', 'coordinateSpace': 'image-pixels', 'features': features, 'totalFeatures': len(features)}
        raw = (json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
        (destination / f'{layer}.json').write_bytes(raw)
        manifest['entries'].append({'layer': layer, 'count': len(features), 'sha256': hashlib.sha256(raw).hexdigest()})
    (destination / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print({layer: len(features) for layer, features in layers.items()})


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('destination', type=Path)
    parser.add_argument('--annotations', type=Path, required=True, help='Reviewed annotation data from the external source archive')
    args = parser.parse_args()
    if args.destination.exists():
        raise ValueError('Destination already exists')
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=args.destination.parent) as staging:
        snapshot = Path(staging) / 'snapshot'
        collect(args.archive, snapshot, args.annotations)
        snapshot.rename(args.destination)
