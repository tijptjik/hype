"""Build station-linked MTR entrances from OSM XML produced by tags-filter.

Usage: osmium tags-filter hk.osm.pbf n/railway=subway_entrance nwr/railway=station
       r/public_transport=stop_area -o mtr.osm
       python3 scripts/maps/build-mtr-catalog.py mtr.osm
Station membership prefers stop-area relations; spatial fallback is explicitly tagged.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET


def tags(element):
    """Return an OSM element's tag dictionary."""
    return {tag.get('k'): tag.get('v') for tag in element.findall('tag')}


def distance(a, b):
    """Return approximate metres between nearby Hong Kong points."""
    return math.hypot((a[0]-b[0])*math.cos(math.radians((a[1]+b[1])/2)), a[1]-b[1])*111195


def build(source):
    """Resolve station records and attach entrances with source attribution."""
    root = ET.parse(source).getroot()
    nodes = {node.get('id'): node for node in root.findall('node')}
    ways = {way.get('id'): way for way in root.findall('way')}
    def point(element):
        if element.tag == 'node':
            return [float(element.get('lon')), float(element.get('lat'))]
        if element.tag == 'relation':
            points = [point(ways[m.get('ref')]) for m in element.findall('member') if m.get('type') == 'way' and m.get('ref') in ways]
            points = [p for p in points if p]
        else:
            points = [point(nodes[n.get('ref')]) for n in element.findall('nd') if n.get('ref') in nodes]
        return [sum(p[i] for p in points)/len(points) for i in (0,1)] if points else None
    station_codes = {'Lai Chi Kok':'LCK','Sheung Shui':'SHS','Heng Fa Chuen':'HFC','Tin Hau':'TIH','Lai King':'LAK','Kam Sheung Road':'KSR','Sham Shui Po':'SSP'}
    stations = {}
    aliases = {}
    for element in [*root.findall('relation'), *nodes.values(), *ways.values()]:
        t = tags(element)
        if t.get('railway') != 'station' or t.get('station') == 'light_rail': continue
        if not ('MTR' in t.get('network','') or 'MTR' in t.get('operator','') or t.get('station') == 'subway'): continue
        name = t.get('name:en')
        if not name or name == 'Terminal 2' or not point(element): continue
        code = t.get('ref') or station_codes.get(name) or ('osm:' + element.tag[0] + element.get('id'))
        if code.isdigit(): continue
        key = name.casefold()
        if key in aliases: continue
        aliases[key] = code
        stations[code] = {'id':code,'name':name,'nameZh':t.get('name:zh-Hant') or t.get('name:zh') or name,'coordinates':point(element)}
    memberships = {}
    excluded = {'5917702060'}  # West Kowloon lift C, not a local MTR entrance.
    for relation in root.findall('relation'):
        t = tags(relation)
        if t.get('public_transport') != 'stop_area': continue
        name = t.get('name:en','').removesuffix(' Station')
        if name == 'Hong Kong West Kowloon':
            excluded.update(m.get('ref') for m in relation.findall('member') if m.get('type') == 'node')
            continue
        code = t.get('ref','')
        if code.isdigit(): continue
        station = aliases.get(name.casefold())
        if not station: continue
        for member in relation.findall('member'):
            if member.get('type') == 'node': memberships.setdefault(member.get('ref'),set()).add(station)
    exits = []
    for node_id, node in nodes.items():
        t = tags(node)
        if t.get('railway') != 'subway_entrance' or t.get('access') in ('no','private') or node_id in excluded: continue
        p = point(node)
        candidates = sorted(stations.values(),key=lambda s:distance(p,s['coordinates']))
        matched = memberships.get(node_id,set())
        station = next(iter(matched)) if len(matched)==1 else candidates[0]['id']
        method = 'stop_area' if len(matched)==1 else 'nearest_station'
        nearest = distance(p,stations[station]['coordinates'])
        if nearest > 1200: raise ValueError(f'Entrance {node_id} has no nearby station')
        ref = '' if t.get('noref')=='yes' else t.get('ref') or t.get('local_ref') or t.get('loc_ref') or ''
        # East Tsim Sha Tsui's connected concourse owns J/K/L/N/P exits;
        # its western exits are closer to the separate Tsim Sha Tsui station point.
        if station in ('ETS', 'TST') and ref[:1] in ('J', 'K', 'L', 'N', 'P'):
            station, method = 'ETS', 'station_exit_plan'
        exits.append({'id':'osm:n'+node_id,'station':station,'ref':ref,'coordinates':p,'association':method})
    return {'source':'OpenStreetMap HK 2026-10-01','sourceSha256':hashlib.sha256(Path(source).read_bytes()).hexdigest(),'stations':sorted(stations.values(),key=lambda s:s['id']),'exits':sorted(exits,key=lambda e:e['id'])}

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path)
    parser.add_argument('--output',type=Path,default=Path('src/lib/routing/mtr-catalog.json'))
    args=parser.parse_args()
    result=build(args.source)
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(f"Catalog: {len(result['stations'])} stations, {len(result['exits'])} entrances")
