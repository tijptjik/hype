#!/usr/bin/env python3
"""Refs #194. Seed explicit A-Z review starting points into a local SQLite database only."""
import argparse
import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

SCENARIOS = {
 'A': 'Register an unknown identity', 'B': 'Correct the same continuing identity',
 'C': 'Distinguish two branches', 'D': 'Temporarily close and reopen',
 'E': 'Retain a permanently closed establishment', 'F': 'Replace a demolished building',
 'G': 'Keep a sign separate from its operating business', 'H': 'Revise canonical address content',
 'I': 'Retain two distinct address identities', 'J': 'Select a qualified address',
 'K': 'Retain an accepted old address during review', 'L': 'Rank multiple address choices',
 'M': 'Group nested premises', 'N': 'Return to former premises as a new occupancy episode',
 'O': 'Keep placement under fixed policy', 'P': 'Review a proposed move',
 'Q': 'Assess a verified move under follow policy', 'R': 'Associate directly to a building',
 'S': 'Accept facts independently of placement', 'T': 'Resolve Project and Layer policy',
 'U': 'Retain identity after source omission', 'V': 'Apply an Organisation-scoped suppression',
 'W': 'Browse present and former occupants', 'X': 'Retain placement history after unlink',
 'Y': 'Keep a private endpoint out of shared views', 'Z': 'Reject a stale successor and replay safely',
}

def encoded(value):
    """Use canonical fixture JSON for deterministic content hashes."""
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def insert(db, table, values):
    """Insert one known fixture row using bound values, never interpolated user SQL."""
    keys = ','.join('"'+key+'"' for key in values)
    db.execute(f'INSERT INTO "{table}"({keys}) VALUES({",".join("?" for _ in values)})', list(values.values()))


def seed(db, organisation, project, layer):
    """Populate distinct local examples; do not infer any relationship in imported user data."""
    if not db.execute('SELECT 1 FROM layer WHERE id=? AND projectId=? AND organisationId=?', (layer,project,organisation)).fetchone():
        raise RuntimeError('The requested Organisation/Project/Layer ancestry does not match')
    if not db.execute("SELECT 1 FROM sqlite_master WHERE name='locationOccupancy'").fetchone():
        raise RuntimeError('Apply the lifecycle migrations first')
    existing = db.execute("SELECT count(*) FROM location WHERE id LIKE 'lifecycle-demo-%'").fetchone()[0]
    if existing:
        expected = 26 * 4
        feature_count=db.execute("SELECT count(*) FROM feature WHERE id LIKE 'lifecycle-demo-%' AND organisationId=? AND projectId=? AND layerId=?",(organisation,project,layer)).fetchone()[0]
        owned=db.execute("SELECT count(*) FROM location WHERE id LIKE 'lifecycle-demo-%' AND ownerOrganisationId=?",(organisation,)).fetchone()[0]
        if existing != expected or feature_count != 26 or owned != expected: raise RuntimeError('Partial fixture namespace or different review scope; restore the before-image before reseeding')
        return {'replayed': True, 'locations': existing}
    now = datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
    actor = 'fixture:location-lifecycle'
    for code, title in SCENARIOS.items():
        prefix = 'lifecycle-demo-'+code.lower()
        ids = {role:prefix+'-'+role for role in ['shop','building','premises','destination']}
        def revision(role, version=1, status=None):
            kind = 'establishment' if role=='shop' else 'premises' if role=='premises' else 'building'
            if code=='A' and role=='shop': kind='unknown'
            if code=='M' and role=='destination': kind='premises'
            if code=='C' and role=='destination': kind='establishment'
            details = {'brands':[]} if kind=='establishment' else {}
            if status: details['operatingStatus' if kind=='establishment' else 'buildingStatus']=status
            facts = {'schemaVersion':1,'kind':kind,'common':{'names':{'en':f'{code} · {title} · {role}'+(' (corrected)' if version>1 and code=='B' else '')},'location':{'geometry':{'type':'Point','coordinates':[114.16+(ord(code)-65)*.001,22.30+(.003 if role=='destination' else 0)]}}},'details':details}
            rid=ids[role]+'-r'+str(version)
            insert(db,'locationRevision',{'id':rid,'locationId':ids[role],'version':version,'origin':'local','contentHash':hashlib.sha256(encoded(facts).encode()).hexdigest(),'rawSource':encoded({'kind':'synthetic-lifecycle-fixture','scenario':code,'actorId':actor}),'facts':encoded(facts)})
            return rid
        for role,lid in ids.items():
            kind='establishment' if role=='shop' else 'premises' if role=='premises' else 'building'
            if code=='A' and role=='shop':kind='unknown'
            if code=='M' and role=='destination':kind='premises'
            if code=='C' and role=='destination':kind='establishment'
            insert(db,'location',{'id':lid,'kind':kind,'state':'manual' if code=='Y' else 'unresolved','ownerOrganisationId':organisation,'sourceAvailability':'missing' if code=='U' else 'current'})
            revision(role,status='permanently_closed' if code=='E' and role=='shop' else 'demolished' if code=='F' and role=='building' else None)
        scope=organisation if code=='Y' else None
        common={'scopeOrganisationId':scope,'actorId':actor,'provenance':encoded({'fixture':code}),'evidence':'[]'}
        member=prefix+'-member'
        insert(db,'locationMembership',{'id':member,'relationshipId':member,'childLocationId':ids['building'],'parentLocationId':ids['premises'],'membershipState':'current',**common})
        if code=='M':
            outer=prefix+'-outer-member'
            insert(db,'locationMembership',{'id':outer,'relationshipId':outer,'childLocationId':ids['premises'],'parentLocationId':ids['destination'],'membershipState':'current',**common})
        if code=='C':
            branch=prefix+'-second-branch'
            insert(db,'locationOccupancy',{'id':branch,'relationshipId':branch,'establishmentLocationId':ids['destination'],'containerLocationId':ids['building'],'occupancyState':'current',**common})
        if code!='A':
            episode=prefix+'-occupancy'
            insert(db,'locationOccupancy',{'id':episode,'relationshipId':episode,'establishmentLocationId':ids['shop'],'containerLocationId':ids['building'],'occupancyState':'current',**common})
            if code in ['N','O','P','Q','W']:
                insert(db,'locationOccupancy',{'id':episode+'-ended','relationshipId':episode,'previousRevisionId':episode,'establishmentLocationId':ids['shop'],'containerLocationId':ids['building'],'occupancyState':'former','effectiveTo':'2020','effectiveToPrecision':'year',**common})
                nextid=prefix+'-new-episode'
                insert(db,'locationOccupancy',{'id':nextid,'relationshipId':nextid,'establishmentLocationId':ids['shop'],'containerLocationId':ids['building'] if code=='N' else ids['destination'],'occupancyState':'current' if code!='P' else 'unconfirmed','verifiedAt':now if code=='Q' else None,**common})
            if code=='V':
                insert(db,'locationOccupancy',{'id':episode+'-suppressed','relationshipId':episode,'establishmentLocationId':ids['shop'],'containerLocationId':ids['building'],'occupancyState':'current',**common,'scopeOrganisationId':organisation,'assertionState':'suppressed'})
        if code in ['B','D','S']:
            revision('shop',2,'temporarily_closed' if code=='D' else None)
            if code=='D':revision('shop',3,'open')
        if code=='F':
            tid=prefix+'-replacement'
            insert(db,'locationTransition',{'id':tid,'transitionId':tid,'type':'replacement','basis':'real_world',**common,'evidence':encoded([{'source':{'kind':'record','resourceType':'locationRevision','revisionId':ids['building']+'-r1'},'supports':['before','after'],'description':'Synthetic redevelopment example; not a real-world assertion.','quotedText':None,'sourceDate':None}])})
            for role,side in [('building','before'),('destination','after')]:insert(db,'locationTransitionParticipant',{'transitionRevisionId':tid,'locationId':ids[role],'side':side})
        if code in ['H','I','J','K','L']:
            for n in [1,2]:
                aid=prefix+'-address'+str(n if code in ['I','L'] else 1)
                if n==1 or code in ['I','L']:insert(db,'address',{'id':aid,'sourceKey':encoded({'provider':'synthetic-fixture','family':'addresses','id':aid})})
                arid=prefix+'-address-r'+str(n)
                components={'scope':'unit' if code=='J' else 'building','i18n':{'en':{'formattedAddress':('Shop 12, 1/F, ' if code=='J' else '')+('12-18' if n==1 else '12')+' Garden Street, Example Court','streetName':'Garden Street','buildingNumberExpression':'12-18' if n==1 else '12','premisesName':'Example Court'}},'unit':{'unitRef':'12','unitType':'S','floorRef':'1','floorType':'F','unitPortion':None} if code=='J' else None,'unitI18n':{}}
                insert(db,'addressRevision',{'id':arid,'addressId':aid,'scope':'unit' if code=='J' else 'building','components':encoded(components),'contentHash':hashlib.sha256(encoded(components).encode()).hexdigest(),'sourceReferences':'[]','rawSource':encoded({'fixture':code,'version':n})})
                rel=arid+'-association'
                insert(db,'locationAddress',{'id':rel,'relationshipId':rel,'locationId':ids['building'],'addressRevisionId':arid,'addressState':'current','priority':n*10 if code=='L' else None,**common})
        # Features remain unpublished and use the provided local review scope.
        fid=prefix+'-feature'
        point={'type':'Point','coordinates':[114.16+(ord(code)-65)*.001,22.30]}
        insert(db,'feature',{'id':fid,'organisationId':organisation,'projectId':project,'layerId':layer,'geometry':encoded(point),'isPublished':0,'isDraft':0,'addressMeta':'{}'})
        insert(db,'featureI18n',{'featureId':fid,'locale':'en','title':f'{code} · {title}'})
        role='building' if code=='R' else 'shop'
        binding={'featureId':fid,'locationId':ids[role],'version':prefix+'-accepted','factsRevisionId':ids[role]+'-r1','locationRevisionId':ids[role]+'-r1','actorId':actor}
        if code!='A' and code!='R':binding.update(occupancyRevisionId=prefix+'-occupancy',membershipRevisionIds=encoded([member, prefix+'-outer-member'] if code=='M' else [member]))
        if code=='R':binding['membershipRevisionIds']=encoded([member])
        if code=='K':binding['addressRevisionId']=prefix+'-address-r1'
        insert(db,'featureLocation',binding)
        if code=='X':db.execute('DELETE FROM featureLocation WHERE featureId=?',(fid,))
    return {'replayed':False,'locations':104,'features':26,'scenarios':SCENARIOS}


def main():
    """Require a concrete local database, explicit review scope and an apply flag."""
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db',type=Path,required=True)
    for name in ['organisation','project','layer']:parser.add_argument('--'+name,required=True)
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    path=args.db.resolve(strict=True)
    if path.suffix!='.sqlite':raise RuntimeError('Only an explicit local .sqlite file is supported')
    if not args.apply:
        print(json.dumps({'database':str(path),'scenarios':SCENARIOS,'action':'Pass --apply to create 26 unpublished review Features and 104 synthetic Locations.'},indent=2));return
    db=sqlite3.connect(path)
    db.execute('PRAGMA foreign_keys=ON')
    backup=path.with_name(path.name+'.before-lifecycle-fixtures')
    if not backup.exists():
        with sqlite3.connect(backup) as target:db.backup(target)
    with db:
        db.execute('BEGIN IMMEDIATE')
        result=seed(db,args.organisation,args.project,args.layer)
        if db.execute('PRAGMA foreign_key_check').fetchone():raise RuntimeError('Fixture integrity failed')
    print(json.dumps(result,indent=2))

if __name__=='__main__':main()
