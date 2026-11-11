#!/usr/bin/env python3
"""Seed a named, synthetic relationship review fixture in the local dev database (Refs #194)."""
import argparse
import hashlib
import json
import sqlite3
from pathlib import Path

PREFIX = "relationship-demo-"


def insert(db, table, values):
    """Insert known fixture columns using bound values; never update existing assertions."""
    columns = ",".join('"'+key+'"' for key in values)
    db.execute(f'INSERT INTO "{table}" ({columns}) VALUES ({",".join("?" for _ in values)})', list(values.values()))


def seed(db):
    """Create independent local demo identities and varied immutable relationship histories."""
    if db.execute("SELECT 1 FROM location WHERE id=?", (PREFIX+"building",)).fetchone():
        return {"replayed": True, "record": PREFIX+"building"}
    owner = db.execute("SELECT id FROM organisation ORDER BY id LIMIT 1").fetchone()[0]
    names = [
        ("building", "built", "building", "TEST · Harbour House"),
        ("complex", "built", "premises", "TEST · Harbour Quarter"),
        ("old-complex", "built", "premises", "TEST · Old Harbour Estate"),
        ("annex", "built", "building", "TEST · Harbour Annex"),
        ("east", "built", "building_part", "TEST · East Wing"),
        ("west", "built", "building_part", "TEST · West Wing"),
        ("shop", "operational", "establishment", "TEST · Harbour Coffee"),
        ("bakery", "operational", "establishment", "TEST · Morning Bakery"),
        ("books", "operational", "establishment", "TEST · Lantern Books"),
        ("florist", "operational", "establishment", "TEST · Harbour Flowers"),
        ("studio", "operational", "establishment", "TEST · Harbour Studio"),
        ("previous", "built", "building", "TEST · Former Harbour House"),
        ("successor", "built", "building", "TEST · New Harbour House"),
    ]
    for index, (suffix, kind, cls, title) in enumerate(names):
        lid = PREFIX+suffix
        insert(db, "location", {"id":lid,"kind":kind,"class":cls,"state":"unresolved","ownerOrganisationId":owner})
        facts = {"schemaVersion":1,"kind":cls,"common":{"names":{"en":title},"location":{"geometry":{"type":"Point","coordinates":[114.169+index*.0001,22.32]}}},"details":{"brands":[]} if cls=="establishment" else {}}
        encoded = json.dumps(facts)
        insert(db,"locationRevision",{"id":lid+"-r1","locationId":lid,"version":1,"origin":"local","contentHash":hashlib.sha256(encoded.encode()).hexdigest(),"rawSource":json.dumps({"fixture":"relationship-review","synthetic":True}),"facts":encoded})
    common = {"actorId":"fixture:relationship-review","provenance":json.dumps({"fixture":"relationship-review","synthetic":True}),"evidence":"[]"}
    def relation(table, suffix, fields, **extra):
        rid=PREFIX+suffix
        insert(db,table,{"id":rid,"relationshipId":rid,**common,**fields,**extra})
    for suffix,parent,state in [("complex-member","complex","current"),("old-member","old-complex","former")]:
        relation("locationMembership",suffix,{"childLocationId":PREFIX+"building","parentLocationId":PREFIX+parent,"membershipState":state})
    for part in ["east","west"]:
        relation("locationMembership",part+"-member",{"childLocationId":PREFIX+part,"parentLocationId":PREFIX+"building","membershipState":"current"})
    for index,(shop,state) in enumerate([("shop","current"),("bakery","current"),("books","former"),("florist","unconfirmed"),("studio","former")]):
        relation("locationOccupancy",shop+"-period",{"establishmentLocationId":PREFIX+shop,"containerLocationId":PREFIX+"building","occupancyState":state},effectiveFrom=str(2010+index*3),effectiveFromPrecision="year",**({"effectiveTo":"2024","effectiveToPrecision":"year"} if state=="former" else {}))
    relation("locationOccupancy","shop-old-period",{"establishmentLocationId":PREFIX+"shop","containerLocationId":PREFIX+"annex","occupancyState":"former"},effectiveFrom="2005",effectiveFromPrecision="year",effectiveTo="2009",effectiveToPrecision="year")
    # A superseded assertion makes the history toggle visibly different from the current view.
    relation("locationOccupancy","books-period-correction",{"establishmentLocationId":PREFIX+"books","containerLocationId":PREFIX+"building","occupancyState":"former"},relationshipId=PREFIX+"books-period",previousRevisionId=PREFIX+"books-period",effectiveFrom="2016",effectiveFromPrecision="year",effectiveTo="2023",effectiveToPrecision="year")
    for index,label in enumerate(["12 Harbour Road · Main entrance","2 Lantern Lane · Side entrance","10 Harbour Road · Former postal address"]):
        aid=PREFIX+"address-"+str(index)
        insert(db,"address",{"id":aid,"sourceKey":json.dumps({"provider":"fixture","family":"address","id":aid})})
        insert(db,"addressRevision",{"id":aid+"-r1","addressId":aid,"scope":"building","components":json.dumps({"i18n":{"en":{"formattedAddress":label}}}),"contentHash":aid,"sourceReferences":"[]","rawSource":'{"synthetic":true}'})
        for suffix in ["building","shop"]:
            relation("locationAddress",suffix+"-address-"+str(index),{"locationId":PREFIX+suffix,"addressRevisionId":aid+"-r1","addressState":"former" if index==2 else "current","priority":index if index<2 else None})
    for suffix,kind,before,after in [
        ("replacement","replacement",["previous"],["building"]),
        ("reconfiguration","reconfiguration",["building"],["building","annex"]),
        ("shop-merge","merge",["books","shop"],["shop"]),
    ]:
        rid=PREFIX+suffix
        insert(db,"locationTransition",{"id":rid,"transitionId":rid,"type":kind,"basis":"real_world",**common,"effectiveFrom":"2020","effectiveFromPrecision":"year"})
        for side,items in [("before",before),("after",after)]:
            for item in items:
                insert(db,"locationTransitionParticipant",{"transitionRevisionId":rid,"locationId":PREFIX+item,"side":side})
    return {"locations":len(names),"record":PREFIX+"building","operating_editor":PREFIX+"shop"}


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database",type=Path,required=True)
    args=parser.parse_args()
    path=args.database.resolve()
    local=(Path(__file__).resolve().parents[2]/".wrangler/state").resolve()
    if not path.is_relative_to(local) or not path.is_file():
        parser.error("Use an existing local .wrangler/state SQLite database only")
    db=sqlite3.connect(path)
    db.execute("PRAGMA foreign_keys=ON")
    with db:
        print(json.dumps(seed(db),indent=2))
