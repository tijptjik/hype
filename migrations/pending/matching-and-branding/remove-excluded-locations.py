"""Remove the approved City Recorder/EUNIC Location scope after revision-preserving detachment.

Arguments: disposable working SQLite database and private output directory.
Retains full removal before-images; preserves Feature records and revision snapshots.
"""

import json
import os
import sqlite3
import sys
from pathlib import Path

os.umask(0o077)
database = Path(sys.argv[1])
p = Path(sys.argv[2])
assert str(database).startswith(".local/") and str(p).startswith(".local/")
c = sqlite3.connect(database)
c.row_factory = sqlite3.Row
c.execute("PRAGMA foreign_keys=ON")
orgs = ["HsW1a_4LNdyA", "KpeoIsOhgyP-"]
ids = [
    r[0]
    for r in c.execute(
        "SELECT id FROM location WHERE ownerOrganisationId IN (?,?) ORDER BY id", orgs
    )
]
assert len(ids) == 444
assert (
    c.execute(
        "SELECT count(*) FROM featureLocation WHERE locationId IN (SELECT value FROM json_each(?))",
        (json.dumps(ids),),
    ).fetchone()[0]
    == 0
)
# Discover every dependent row, retaining full before-images in the private removal archive.
tables = [
    r[0]
    for r in c.execute(
        "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'featureSearchFts%' AND name NOT LIKE '_cf_%'"
    )
]
selected = {
    "location": {
        r["id"]: dict(r)
        for r in c.execute(
            "SELECT * FROM location WHERE id IN (SELECT value FROM json_each(?))",
            (json.dumps(ids),),
        )
    }
}
keys = {
    t: [r["name"] for r in c.execute('PRAGMA table_info("' + t + '")') if r["pk"]]
    for t in tables
}


def key(t, r):
    return json.dumps([r[k] for k in keys[t]], sort_keys=True)


while True:
    changed = False
    for t in tables:
        fks = {}
        for r in c.execute('PRAGMA foreign_key_list("' + t + '")'):
            fks.setdefault(r["id"], []).append(dict(r))
        for fk in fks.values():
            parent = fk[0]["table"]
            if parent not in selected:
                continue
            predicates = " AND ".join(
                'child."'
                + ref["from"]
                + "\" IS json_extract(parent.value, '$."
                + ref["to"]
                + "')"
                for ref in fk
            )
            rows = c.execute(
                f'SELECT child.* FROM "{t}" child WHERE EXISTS(SELECT 1 FROM json_each(?) parent WHERE {predicates})',
                (
                    json.dumps(
                        [
                            {ref["to"]: row[ref["to"]] for ref in fk}
                            for row in selected[parent].values()
                        ]
                    ),
                ),
            ).fetchall()
            for row in rows:
                assert t not in [
                    "feature",
                    "featureRevision",
                    "user",
                    "project",
                    "organisation",
                ], ("unapproved dependency", t)
                assert keys[t], t
                k = key(t, row)
                if k not in selected.setdefault(t, {}):
                    selected[t][k] = dict(row)
                    changed = True
    if not changed:
        break
selected = {t: r for t, r in selected.items() if r}
archive = {t: list(rows.values()) for t, rows in selected.items()}
(p / "removed-location-archive.json").write_text(json.dumps(archive))
# Keep schema identical; only disable immutable deletion guards within this atomic migration.
triggers = [
    dict(r)
    for r in c.execute(
        "SELECT name,sql,tbl_name FROM sqlite_schema WHERE type='trigger'"
    )
    if r["tbl_name"] in selected and not r["name"].startswith("revision_deploy_")
]
statements = [{"sql": "PRAGMA defer_foreign_keys=ON", "params": []}]
for r in triggers:
    statements.append({"sql": f'DROP TRIGGER "{r["name"]}"', "params": []})
for t, rows in selected.items():
    # Exact before-images are also protected by the fenced plan fingerprints.
    ks = keys[t]
    names = ",".join('"' + k + '"' for k in ks)
    expressions = ",".join(
        "json_extract(value, '$[" + str(i) + "]')" for i in range(len(ks))
    )
    values = [[row[k] for k in ks] for row in rows.values()]
    statements.append(
        {
            "sql": f'DELETE FROM "{t}" WHERE ({names}) IN (SELECT {expressions} FROM json_each(?))',
            "params": [json.dumps(values, separators=(",", ":"))],
        }
    )
for r in triggers:
    statements.append({"sql": r["sql"], "params": []})
statements.append(
    {
        "sql": "SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check) THEN 1 ELSE json('REMOVAL_FOREIGN_KEY') END",
        "params": [],
    }
)
try:
    c.execute("BEGIN")
    for s in statements:
        c.execute(s["sql"], s["params"])
    c.commit()
except:
    c.rollback()
    raise
assert c.execute("pragma integrity_check").fetchone()[0] == "ok"
assert not c.execute("pragma foreign_key_check").fetchone()
(p / "remove-groups.json").write_text(
    json.dumps([{"label": "remove-location/delete-approved", "statements": statements}])
)
print(
    "Removed rows",
    json.dumps({t: len(r) for t, r in selected.items()}),
    "statements",
    len(statements),
)
