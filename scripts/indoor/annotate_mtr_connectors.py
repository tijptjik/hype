"""Generate source-pinned connector associations using the reviewed Kennedy Town rules.

Usage: dev-check python3 scripts/indoor/annotate_mtr_connectors.py INPUT_DIRECTORY OUTPUT_DIRECTORY
INPUT_DIRECTORY contains inputs.json, bundles/CODE.json and networks/CODE.json.
No source polygon, correction or published map is modified. Requires shapely.
"""
import hashlib
import json
import math
import sys
from pathlib import Path
from shapely.geometry import LineString, Point, shape


def annotate(bundle_path, network_path):
    """Match unique same-category sloping edges at the exact source landing elevation."""
    data = json.loads(bundle_path.read_text())['data']
    network = json.loads(network_path.read_text())
    assert data['venue_polygon']['features'][0]['properties']['venue_id'] == network['venueId']
    nodes = {node['id']: node for node in network['nodes']}
    levels = {level['properties']['level_id']: level for level in data['level_polygon']['features']}
    # A sloping edge may terminate just beyond a floor boundary. Follow one same-kind,
    # flat landing edge by exact node identity, never by coordinate proximity alone.
    landing_edges = {}
    for edge in network['edges']:
        points = [nodes[node_id] for node_id in edge['nodeIds']]
        if max(p['z'] for p in points) - min(p['z'] for p in points) > .05:
            continue
        for node_id in (edge['nodeIds'][0], edge['nodeIds'][-1]):
            landing_edges.setdefault((node_id, edge['kind']), []).append(points)

    def endpoint_floors(node, kind):
        """Include only floors established by a flat, same-kind edge at the same node."""
        return set(node['floorIds']) | {floor_id for points in landing_edges.get((node['id'], kind), [])
            for point in points for floor_id in point['floorIds']}

    annotations, unresolved = {}, []
    for unit in data['unit_polygon']['features']:
        properties = unit['properties']
        category = properties['unit_category']
        if category not in ('stairs', 'steps', 'escalator', 'ramp'):
            continue
        floor = levels[properties['level_id']]['properties']
        z = float(floor['level_z_value'])
        polygon = shape(unit['geometry'])
        matches = []
        for edge in network['edges']:
            if edge['kind'] != ('stairs' if category == 'steps' else category):
                continue
            points = [nodes[node_id] for node_id in edge['nodeIds']]
            line = LineString([node['point'] for node in points])
            coverage = polygon.intersection(line).length / (line.length or 1)
            rise = points[-1]['z'] - points[0]['z']
            # Require a unique sloping segment, meaningful footprint overlap, and a landing at this floor.
            if coverage <= 0 or abs(rise) < .25:
                continue
            near = min((points[0], points[-1]), key=lambda node: abs(node['z'] - z))
            far = points[-1] if near is points[0] else points[0]
            if abs(near['z'] - z) > .25:
                continue
            landing = any(
                properties['level_id'] in {floor_id for point in flat for floor_id in point['floorIds']}
                and polygon.intersection(LineString([point['point'] for point in flat])).length > 0
                for flat in landing_edges.get((near['id'], edge['kind']), [])
            )
            if not any(properties['level_id'] in node['floorIds'] for node in points) and not landing:
                continue
            exterior = not any(level_id in levels for level_id in endpoint_floors(far, edge['kind']))
            if coverage < .25 and not exterior and not landing:
                continue
            ordered = points if near is points[0] else list(reversed(points))
            # Boundary portals need only a source landing inside the exact polygon.
            if exterior and not polygon.covers(Point(near['point'])):
                continue
            dx = ordered[1]['point'][0] - ordered[0]['point'][0]
            dy = ordered[1]['point'][1] - ordered[0]['point'][1]
            mx = 111320 * math.cos(math.radians(near['point'][1]))
            norm = math.hypot(dx * mx, dy * 111320)
            if norm <= 0:
                continue
            normal = [-dy * 111320 / norm, dx * mx / norm]
            cross = LineString([[near['point'][0] + sign * normal[0] * 100 / mx,
                                 near['point'][1] + sign * normal[1] * 100 / 111320]
                                for sign in (-1, 1)])
            cut = polygon.intersection(cross)
            width = cut.length / math.hypot(normal[0] / mx, normal[1] / 111320)
            matches.append(dict(edgeId=edge['id'], coverage=round(coverage, 4),
                                width=round(width, 4),
                                exterior=exterior,
                                path=[[*node['point'], round(node['z'] - near['z'], 4)] for node in ordered],
                                entrance=near['point'], destination=far['point'],
                                rise=round(far['z'] - near['z'], 4),
                                travel='both' if edge['direction'] == 'both' else
                                       'outward' if near is points[0] else 'inward'))
        if len(matches) != 1:
            unresolved.append(properties['unit_id'])
            continue
        annotations[properties['unit_id']] = dict(matches[0], geometry=unit['geometry'],
            levelId=properties['level_id'], floorZ=z, category=category)
    result = dict(schemaVersion=1, venueId=network['venueId'],
        sourceUrl=f"https://tiles.saanseoi.hk/routing/hk/indoor/2026-11-16/stations/{network['code']}.json",
        networkSha256=hashlib.sha256(network_path.read_bytes()).hexdigest(),
        bundleSha256=hashlib.sha256(bundle_path.read_bytes()).hexdigest(),
        annotations=annotations, unresolved=unresolved)
    return result


def main():
    """Generate independent station artifacts and an explicit coverage manifest."""
    source, output = map(Path, sys.argv[1:])
    output.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for item in json.loads((source / "inputs.json").read_text()):
        code = item["code"]
        if not item["network"]:
            manifest[code] = dict(status="missing-network", mapId=item["mapId"])
            continue
        result = annotate(source / "bundles" / f"{code}.json", source / "networks" / f"{code}.json")
        (output / f"{code}.json").write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
        manifest[code] = dict(status="matched", venueId=result["venueId"], mapId=item["mapId"], annotated=len(result["annotations"]), unresolved=len(result["unresolved"]), exterior=sum(a["exterior"] for a in result["annotations"].values()), oneWay=sum(a["travel"] != "both" for a in result["annotations"].values()))
        print(code, manifest[code], flush=True)
    loaders = "// Generated by scripts/indoor/annotate_mtr_connectors.py; load one station at a time.\nexport const networkConnectorLoaders = {\n"
    for code, entry in manifest.items():
        if entry["status"] == "matched":
            loaders += f"  {code}: () => import('./{code}.json'),\n"
    (output / "loaders.ts").write_text(loaders + "}\n")
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
