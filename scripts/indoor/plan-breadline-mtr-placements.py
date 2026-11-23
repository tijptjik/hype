"""Plan Breadline MTR placements from retained source identities and concourse exits.

Read-only database access. Exact station/unit evidence precedes brand/name matching.
Ambiguous brands use the donor's exit hint and planar metres to a labelled indoor
concourse/ticket-hall entry, never a street-level exit. Results retain all candidates.
"""
import argparse
import collections
import hashlib
import json
import math
import re
import sqlite3
from pathlib import Path
from shapely.geometry import shape


def normal(value):
    """Normalize spelling without collapsing different business brands."""
    value = str(value or '').casefold().replace('arôme', 'arome').replace('aromi', 'arome')
    value = re.sub(r'[^a-z0-9]', '', value)
    aliases = {'seveneleven': '7eleven', 'maximscake': 'maximscakes', 'maxims': 'maximscakes',
               'saintHonore'.lower(): 'sainthonore', 'yamazakiboulangeriechaude': 'yamazaki', 'yamazakibakery': 'yamazaki',
               'aromebakery': 'arome', 'sainthonorecake': 'sainthonore', 'sainthonorecake shop'.replace(' ', ''): 'sainthonore'}
    return aliases.get(value, value)


def brand(source):
    """Use donor brand or its original shop-name prefix, not the edited Feature title."""
    name = source.get('name_en', '').split(' - ')[0]
    return normal(name or source.get('brand'))


def metres(a, b):
    """Horizontal station-scale distance; not a pedestrian route or access assertion."""
    return math.hypot((a[0]-b[0])*111320*math.cos(math.radians((a[1]+b[1])/2)), (a[1]-b[1])*111320)


def main():
    """Write an evidence-pinned match plan without changing any identity or relationship."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('database')
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    c = sqlite3.connect(Path(args.database).resolve().as_uri()+'?mode=ro', uri=True)
    c.row_factory = sqlite3.Row
    inputs = {}
    def read(path):
        raw = Path(path).read_bytes(); inputs[str(path)] = hashlib.sha256(raw).hexdigest()
        return json.loads(raw)
    plan = read('.local/places/mtr-network/plan.json')
    catalogue = read('src/lib/routing/mtr-catalog.json')['stations']
    stations = {normal(s['name']): s for s in catalogue}
    stations['saukeiwan'] = stations['shaukeiwan']
    units = {u['ref']: u for u in plan['units']}
    unit_ids = {r['sourceKey']: r['locationId'] for r in c.execute("select * from locationCanonicalDraft where sourceKey like 'landsd-mtr-unit:%'")}
    source = {}
    for r in c.execute("select rawSource from locationRevisionContent where json_extract(rawSource,'$.kind')='breadline-place-import' order by version"):
        d = json.loads(r[0])
        if d.get('sourceTable') == 'donors': source.setdefault(str(d['sourceId']), d['source'])
    candidates = collections.defaultdict(list)
    for r in c.execute("select d.sourceKey,d.locationId,r.id revisionId,r.rawSource from locationCanonicalDraft d join locationRevisionContent r on r.locationId=d.locationId where d.sourceKey like 'mtr-shop:%' and r.version=(select max(version) from locationRevisionContent where locationId=d.locationId)"):
        raw = json.loads(r['rawSource']); shop = raw['record']; prop = shop['properties']
        station = stations.get(normal(prop['station']))
        if not station: continue
        occ = list(c.execute("select o.*,d.sourceKey unitRef from locationOccupancyHead o join locationCanonicalDraft d on d.locationId=o.containerLocationId where o.establishmentLocationId=? and o.assertionState='asserted' and o.occupancyState='current'", (r['locationId'],)))
        for o in occ:
            if o['unitRef'] not in units: continue
            u = units[o['unitRef']]
            if normal(u['rawSource']['properties']['venue_name_en'].removesuffix(' Station')) != normal(station['name']): continue
            geom = shape(u['rawSource']['geometry']); pt = geom.representative_point()
            candidates[(station['id'], normal(shop['businessName']))].append({
                'locationId':r['locationId'], 'revisionId':r['revisionId'], 'unitRef':o['unitRef'],
                'unitLocationId':unit_ids[o['unitRef']], 'unitCode':prop['shopNumber'],
                'sourceRecordId':shop['sourceRecordId'], 'sourceUrl':shop['sourceUrl'],
                'listingStatus':shop['listingStatus'], 'occupancyId':o['id'],
                'geometry':{'type':'Point','coordinates':[pt.x,pt.y]},
                'floor':u['floor'], 'section':u['section'], 'businessName':shop['businessName']})
    reviewed = {r['breadlineDonorId']: r for r in read('scripts/indoor/kowloon-tong-occupancies.json')}
    rows = []
    for f in c.execute("select i.sourceId,f.id featureId,f.projectId,f.modifiedAt,f.currentRevisionId,f.addressMeta,n.title,fl.locationId,fl.version associationVersion,fl.occupancyRevisionId from breadlineImportFeature i join feature f on f.id=i.featureId left join featureI18n n on n.featureId=f.id and n.locale='en' left join featureLocation fl on fl.featureId=f.id where i.sourceTable='donors' and f.isArchived=0 order by cast(i.sourceId as integer)"):
        donor = source.get(f['sourceId'], {})
        if 'MTR' not in (donor.get('name_en','')+' '+(f['title'] or '')).upper(): continue
        row = dict(f); row.pop('addressMeta');row['source'] = {k:donor.get(k) for k in ['id','name_en','address_full_en','nearest_mtr_station_en','nearest_mtr_exit','brand','shop_code']}
        row['featureUrl'] = 'http://hype.localhost/admin/features/'+f['featureId']; row['status']='review'
        station = stations.get(normal(donor.get('nearest_mtr_station_en')))
        # Source shop name wins over a conflicting nearest-station hint when it names one station.
        named = [s for s in catalogue if normal(s['name']) in normal(donor.get('name_en',''))]
        named.sort(key=lambda s:len(normal(s['name'])), reverse=True)
        if named: station=named[0]
        if 'westkowloon' in normal(donor.get('name_en')): station=None
        if not station: row['reason']='Unknown source station';rows.append(row);continue
        code=station['id'];row['station']=code
        pool=candidates.get((code,brand(donor)),[])
        # Current listings take precedence; closed source records are never silently placed.
        pool=[p for p in pool if p['listingStatus']!='closed']
        unique={p['unitRef']:p for p in pool};pool=list(unique.values());row['candidates']=pool
        match=None;method=None
        if f['sourceId'] in reviewed:
            m=reviewed[f['sourceId']]
            occ=c.execute("select o.*,d.sourceKey unitRef from locationOccupancyHead o join locationCanonicalDraft d on d.locationId=o.containerLocationId where o.establishmentLocationId=? and o.occupancyState='current' and o.assertionState='asserted'",(m['establishmentLocationId'],)).fetchall()
            if len(occ)==1:
                o=occ[0];u=units[o['unitRef']];pt=shape(u['rawSource']['geometry']).representative_point()
                match=dict(locationId=m['establishmentLocationId'],revisionId=m['expectedRevisionId'],unitRef=o['unitRef'],unitLocationId=o['containerLocationId'],unitCode=m['unitCode'],occupancyId=o['id'],geometry={'type':'Point','coordinates':[pt.x,pt.y]},floor=u['floor'],section=u['section'],businessName='7-Eleven',sourceUrl='https://mapapi.hkmapservice.gov.hk/ogc/wfs/indoor/mtr_occupant_point')
                method='reviewed-station-unit'
        original=donor.get('address_full_en') or ''
        codes=re.findall(r'\b'+code+r'\s*([A-Z]?[0-9]+[A-Z]?)\b',original,re.I)
        if not match and codes:
            exact=[p for p in pool if normal(p['unitCode']) in [normal(code+x) for x in codes]]
            if not exact:
                compact=normal(original)
                exact=[p for p in pool if normal(p['unitCode']) in compact]
            if len(exact)>1 and len({p['sourceRecordId'] for p in exact})==1:
                row['reason']='One shop spans multiple units; placement needs a reviewed entrance'
                exact=[]
            if len(exact)==1:match=exact[0];method='exact-source-shop-code'
            else: row.setdefault('reason','Source kiosk code has no unique current brand match')
        if not match and not codes and len(pool)==1:match=pool[0];method='unique-station-brand'
        if not match and not codes and len(pool)>1:
            address=json.loads(f['addressMeta'] or '{}').get('address',{})
            hint=' '.join(str(v) for v in address.get('accessHints',{}).values()) or str(donor.get('nearest_mtr_exit') or '')
            exits=re.findall(r'(?<![A-Za-z])([A-HJ-NP-Z](?:[1-9])?)(?![A-Za-z])',hint)
            row['exitHint']=hint
            bundlePath=Path('.local/connector-rollout/bundles')/(code+'.json')
            if exits and bundlePath.exists():
                data=read(bundlePath)['data']
                entries=[]
                for entry in data['amenity_point']['features']:
                    p=entry['properties'];label=p.get('amenity_name_en') or '';floor=p.get('level_name_en') or ''
                    token=re.fullmatch(r'Exit ([A-Z][0-9]?)',label)
                    if p['amenity_category']=='entry' and token and any(token[1]==x or (len(x)==1 and token[1].startswith(x)) for x in exits) and re.search(r'concourse|ticket|check.in',floor,re.I):entries.append(entry)
                row['exitEntries']=[{'id':e['properties']['amenity_id'],'name':e['properties']['amenity_name_en'],'floor':e['properties']['level_name_en'],'coordinates':e['geometry']['coordinates']} for e in entries]
                if entries:
                    ranked=[]
                    for p in pool:
                        dist=min(metres(p['geometry']['coordinates'],e['geometry']['coordinates']) for e in entries)
                        ranked.append((dist,p))
                    ranked.sort(key=lambda pair:pair[0]);row['distancesMetres']=[{'unit':p['unitCode'],'metres':round(d,2)} for d,p in ranked]
                    if ranked[1][0]-ranked[0][0]>1:
                        match=ranked[0][1];method='nearest-labelled-concourse-exit'
                    else:row['reason']='Exit-distance tie within one metre'
                else:row['reason']='No labelled concourse entry for access hint'
            else:row['reason']='Multiple shops; no usable exit hint or station bundle'
        if match:
            # Reuse a linked establishment unless retained source identifies a different kiosk.
            if f['locationId'] and f['sourceId'] not in reviewed:
                prior=c.execute('select id,rawSource,facts from locationRevisionContent where locationId=? order by version desc limit 1',(f['locationId'],)).fetchone()
                if prior:
                    raw=json.loads(prior['rawSource']); facts=json.loads(prior['facts'])
                    existingAddress=raw.get('source',{}).get('address_full_en') or ' '.join(x.get('displayAddress','') for x in facts.get('i18n',{}).values())
                    existingCodes=re.findall(r'\b'+code+r'\s*([A-Z]?[0-9]+[A-Z]?)\b',existingAddress,re.I)
                    if not existingCodes or normal(match['unitCode']) in [normal(code+x) for x in existingCodes] or normal(match['unitCode']) in normal(existingAddress):
                        match=dict(match);match['catalogueLocationId']=match['locationId'];match['locationId']=f['locationId'];match['revisionId']=prior['id']
                    else:
                        row['relinkReason']='Existing establishment address identifies a different kiosk' 
            row.update(status='matched',match=match,method=method)
        elif 'reason' not in row:row['reason']='No current station/brand shop with a mapped unit'
        rows.append(row)
    # Do not collapse distinct source donors onto one establishment/unit without review.
    groups=collections.defaultdict(list)
    for row in rows:
        if row['status']=='matched':groups[row['match']['unitRef']].append(row)
    for group in groups.values():
        if len(group)>1:
            exact=[r for r in group if r['method'] in ['reviewed-station-unit','exact-source-shop-code']]
            for row in group:
                if len(exact)==1 and row is exact[0]:continue
                row.update(status='review',reason='Multiple Breadline donors select the same unit')
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps({'version':1,'inputs':inputs,'distanceMethod':'Horizontal metres to labelled concourse/ticket-hall entry; not walking distance','rows':rows},indent=2,ensure_ascii=False)+'\n')
    print(json.dumps(dict(collections.Counter(r['status'] for r in rows))))
    for r in rows:print(r['sourceId'],r['source']['name_en'],r['status'],r.get('method') if r['status']=='matched' else r['reason'],r.get('match',{}).get('unitCode',''))


if __name__=='__main__':main()
