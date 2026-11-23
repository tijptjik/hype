"""Plan complete code coverage and isolated linked-occupant matches from retained evidence.

Read-only: writes a reviewable plan; never accepts upstream identity or invents geometry.
"""

import json, re, collections, hashlib
from pathlib import Path

p = json.load(open(".local/places/mtr-network/plan.json"))
s = [json.loads(l) for l in open(".research/mtr-shops/2026-11-14/records.ndjson")]
left = {
    r["sourceRecordId"]
    for r in json.load(open(".local/places/mtr-network/shop-group-code-import.json"))[
        "records"
    ]
    if r["status"] != "placed"
}


def norm(s):
    s = re.sub(r"^(?:F&B|KIOSK|SHOP)\s+", "", s, flags=re.I)
    s = re.sub(r"\s+", "", s.upper()).replace("–", "-").replace("AND", "&")
    return re.sub(r"(?<=\d)-(?=[A-Z]$)", "", s)


station_codes = {r["properties"]["shopNumber"][:3].upper() for r in s}


def parts(s):
    s = norm(s)
    m = re.fullmatch(r"([A-Z]{3})(.+)", s)
    if not m:
        return None
    prefix, tail = m.groups()
    out = set()
    if prefix not in station_codes:
        return None
    # Expand complete numeric groups and letter suffix groups, retaining the prefix.
    for chunk in re.split("[&,/]", tail):
        if re.fullmatch(r"[A-Z]*\d+[A-Z]?", chunk):
            out.add(prefix + chunk)
            continue
        z = re.fullmatch(r"([A-Z]*)(\d+)([A-Z]?)-([A-Z]*)(\d+)([A-Z]?)", chunk)
        if not z:
            return None
        a, n, b, c, v, d = z.groups()
        c = c or a
        if a == c and not b and not d and 0 < int(v) - int(n) <= 30:
            out.update(prefix + a + str(i) for i in range(int(n), int(v) + 1))
        elif a == c and n == v and b and d and 0 < ord(d) - ord(b) <= 26:
            out.update(prefix + a + n + chr(i) for i in range(ord(b), ord(d) + 1))
        else:
            return None
    return out


units = {u["ref"]: u for u in p["units"]}
sets = {}
overrides = json.load(open("scripts/indoor/mtr-shop-unit-overrides.json"))
byref = {x["unitRef"]: x for x in overrides}
for u in p["units"]:
    for field in ["unit_name_en", "unit_unitnumbername"]:
        v = u["rawSource"]["properties"].get(field)
        if u["ref"] in byref:
            v = byref[u["ref"]]["code"]
        if v and parts(v):
            sets.setdefault(u["ref"], []).append(parts(v))
for o in p["occupantEvidence"]:
    v = o["names"].get("en", "")
    if parts(v):
        sets.setdefault(o["unitRef"], []).append(parts(v))
nameunits = collections.defaultdict(set)
for o in p["occupantEvidence"]:
    u = units[o["unitRef"]]
    station = u["rawSource"]["properties"]["venue_name_en"].removesuffix(" Station")
    if u["rawSource"]["properties"]["unit_category"] in [
        "room",
        "foodservice",
        "retail",
    ]:
        for name in o["names"].values():
            nameunits[(station, name.lower().strip())].add(o["unitRef"])
shopnames = collections.Counter(
    (r["properties"]["station"], r["businessName"].lower().strip()) for r in s
)
res = []
for r in s:
    if r["sourceRecordId"] not in left:
        continue
    code = r["properties"]["shopNumber"]
    target = parts(code)
    matches = []
    method = None
    if target:
        for ref, ss in sets.items():
            if any(x == target for x in ss):
                matches.append(ref)
        if len(matches) == 1:
            method = "equivalent-complete-code"
        elif len(matches) > 1:
            # Identically numbered adjacent polygons on one source floor form one mapped shop.
            floors = {units[ref]["floor"]["sourceId"] for ref in matches}
            vertices = {
                ref: {
                    tuple(point[:2])
                    for ring in units[ref]["rawSource"]["geometry"]["coordinates"]
                    for point in ring
                }
                for ref in matches
                if units[ref]["rawSource"]["geometry"]["type"] == "Polygon"
            }
            connected = {matches[0]}
            while True:
                extended = connected | {
                    ref
                    for ref in matches
                    if any(
                        vertices.get(ref, set()) & vertices.get(other, set())
                        for other in connected
                    )
                }
                if extended == connected:
                    break
                connected = extended
            if len(floors) == 1 and connected == set(matches):
                method = "adjacent-polygons-same-code"
        elif not matches and len(target) > 1:
            candidates = [
                (ref, x) for ref, ss in sets.items() for x in ss if x < target
            ]
            candidates = sorted({(ref, tuple(sorted(x))) for ref, x in candidates})
            covered = set()
            good = True
            for ref, x in candidates:
                if covered.intersection(x):
                    good = False
                covered.update(x)
            if good and covered == target:
                matches = [ref for ref, x in candidates]
                method = "complete-multi-unit-code"
    key = (r["properties"]["station"], r["businessName"].lower().strip())
    if not method and shopnames[key] == 1 and len(nameunits[key]) == 1:
        ref = next(iter(nameunits[key]))
        u = units[ref]
        prop = u["rawSource"]["properties"]
        if prop["unit_category"] in ["room", "foodservice", "retail"]:
            existing = sets.get(ref, [])
            # Never displace an explicitly numbered unit solely by a matching tenant.
            linked = {
                o["names"].get("en", "").lower().strip()
                for o in p["occupantEvidence"]
                if o["unitRef"] == ref
            }
            if not existing and linked == {key[1]}:
                matches = [ref]
                method = "unique-linked-occupant"
    if method:
        evidence = [byref[ref] for ref in matches if ref in byref]
        if evidence:
            method = "map-verified-code"
        res.append(
            {
                "record": r,
                "units": sorted(matches),
                "method": method,
                "mapEvidence": evidence,
            }
        )

# Retain every outstanding record and its evidence limitation, not just successful matches.
resolved = {x["record"]["sourceRecordId"] for x in res}
unresolved = []
for r in s:
    if r["sourceRecordId"] not in left or r["sourceRecordId"] in resolved:
        continue
    code = r["properties"]["shopNumber"]
    target = parts(code)
    reason = (
        "station-map-not-in-baseline"
        if code.startswith("WEK")
        else "incomplete-or-ambiguous-code-group"
        if target and len(target) > 1
        else "service-footprint-or-code-unconfirmed"
        if re.search(r"ATM|VEM|APM|F\d", code)
        else "unit-code-or-source-version-mismatch"
    )
    unresolved.append({"record": r, "reason": reason})
paths = [
    ".local/places/mtr-network/plan.json",
    ".research/mtr-shops/2026-11-14/records.ndjson",
    "scripts/indoor/mtr-shop-unit-overrides.json",
    "scripts/indoor/mtr-unit-name-corrections.json",
]
result = {
    "inputs": {
        path: hashlib.sha256(Path(path).read_bytes()).hexdigest() for path in paths
    },
    "resolutions": res,
    "unresolved": unresolved,
    "nameCorrections": json.load(open("scripts/indoor/mtr-unit-name-corrections.json")),
}
Path(".local/places/mtr-network/resolutions.json").write_text(
    json.dumps(result, ensure_ascii=False, indent=2) + "\n"
)
print(
    json.dumps(
        {
            "resolved": len(res),
            "methods": dict(collections.Counter(x["method"] for x in res)),
            "remaining": dict(collections.Counter(x["reason"] for x in unresolved)),
        }
    )
)
