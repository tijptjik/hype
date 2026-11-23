"""Prepare a private, target-checked D1 data group for reviewed Location and catalogue work."""

import argparse
import collections
from graphlib import TopologicalSorter
import gzip
import io
import hashlib
import json
import os
import sqlite3
from pathlib import Path

from scope import FILTERS, initialize_scope, layout, read_db, records
from production_baseline import ProductionAncestry, REFERENCE

ACTOR = "qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM"
STAGE = "_matchingBrandingReleaseRows"
# These triggers would recreate captured immutable evidence, alter historical snapshots,
# or require the original temporal sequence when restoring normalized storage. The
# manifest pins every suspended definition. Query, count, spatial and FTS triggers run.
HISTORICAL_TRIGGERS = {
    "identity_catalogue_storage_insert",
    "identity_catalogue_i18n_guard_insert",
    "identity_catalogue_i18n_guard_update",
    "identity_catalogue_i18n_guard_delete",
    "identity_catalogue_revision_immutable_update",
    "identity_catalogue_revision_immutable_delete",
    "identity_catalogue_group_update",
    "identity_catalogue_group_insert",
    "identity_catalogue_group_revision",
    "identity_catalogue_group_head",
    "location_revision_storage_insert",
    "location_revision_i18n_guard_insert",
    "location_revision_i18n_guard_update",
    "location_revision_no_update",
    "location_canonical_source_only",
    "location_canonical_draft_insert",
    "location_redirect_no_initial",
    "location_local_change",
    "location_shared_refresh",
    "organisation_location_change_insert",
    "feature_location_history_update",
    "feature_location_history_insert",
    "feature_location_history_delete",
    "feature_location_grouping_insert",
    "feature_location_grouping_update",
    "feature_revision_projection_update",
    "feature_current_revision_owner",
    "feature_revision_chain",
    "feature_revision_gallery",
    "feature_revision_gallery_pins",
    "feature_revision_gallery_refresh",
    "feature_name_featureLocation_insert",
    "feature_name_featureLocation_update",
    "feature_name_featureLocation_delete",
    "feature_name_feature_update",
    "feature_name_input",
    "feature_name_featureProperty_insert",
    "feature_name_featureProperty_update",
    "feature_name_location_scope",
    "feature_display_template_insert",
    "feature_display_template_scope",
    "feature_location_clear_detached",
}
# The same scoped write normally goes through featureRevisionWriteScope. The retained
# Feature revision and all its materialized children are verified in the same transaction.
for table in [
    "featureLocation",
    "featureI18n",
    "featureProperty",
    "featurePropertyI18n",
    "featureLocationMembership",
]:
    for op in ["insert", "update", "delete"]:
        HISTORICAL_TRIGGERS.add(f"feature_revision_guard_{table}_{op}")


def compact(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def sha(path):
    with path.open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def guard(predicate, params=()):
    return statement(
        "SELECT CASE WHEN ("
        + predicate
        + ") THEN 1 ELSE json('CURATION_RELEASE_CONFLICT') END",
        params,
    )


def statement(sql, params=()):
    return {"sql": sql, "params": list(params)}


def key(row, keys):
    return tuple(row[k] for k in keys)


def inventory(db):
    """Keep source-specific stable IDs and whole cohort counts out of public Git artifacts."""
    return {
        name: [tuple(r) for r in db.execute(sql)]
        for name, sql in {
            "crosswalk": "SELECT sourceTable,sourceId,featureId,sourceHash FROM breadlineImportFeature ORDER BY 1,2",
            "identities": "SELECT id,locationId,ssId,reviewId,sourceRevisionId FROM locationIdentityHistory ORDER BY id",
            "shops": """SELECT d.sourceKey,l.id,l.ssId FROM locationCanonicalDraft d JOIN location l ON l.id=d.locationId
            WHERE d.sourceKey GLOB 'mtr-shop:*' ORDER BY d.sourceKey""",
            "donorTitles": "SELECT featureId,locale,templateId,templateVersion,title FROM featureDisplayTemplateOutput WHERE featureId IN selected_features ORDER BY 1,2",
        }.items()
    }


def release_seed(db):
    """Project exactly the checked-in 0247 seed through the current catalogue storage views."""
    seed = sqlite3.connect(":memory:")
    seed.row_factory = sqlite3.Row
    for kind in ("table", "view", "trigger"):
        for (sql,) in db.execute(
            """SELECT sql FROM sqlite_schema WHERE type=? AND
                (tbl_name GLOB 'identityCatalogue*') AND name NOT GLOB 'revision_deploy_*'
                AND sql IS NOT NULL ORDER BY name""",
            (kind,),
        ):
            seed.execute(sql)
    seed.executescript(
        Path("migrations/0247_seed_active_identity_catalogue.sql").read_text()
    )
    rows = {}
    for table in FILTERS:
        if table.startswith("identityCatalogue"):
            _, keys = layout(db, table)
            rows[table] = {
                key(r, keys): dict(r) for r in seed.execute(f'SELECT * FROM "{table}"')
            }
    seed.close()
    return rows


def capture(args):
    old, new = read_db(args.baseline), read_db(args.snapshot)
    for db in (old, new):
        initialize_scope(db)
    dest = args.output
    dest.mkdir(parents=True, exist_ok=True)
    out = dest / "records.jsonl.gz"
    if out.exists():
        raise ValueError(f"Capture already exists at {out}")
    triggers = {
        r["name"]: [r["tbl_name"], r["sql"]]
        for r in new.execute(
            "SELECT name,tbl_name,sql FROM sqlite_schema WHERE type='trigger'"
        )
        if r["tbl_name"] in FILTERS
    }
    report = {}
    seeds = release_seed(new)
    retired = (
        records(old, "identityCatalogue").keys()
        - records(new, "identityCatalogue").keys()
    )
    with (
        out.with_suffix(".partial").open("xb") as raw,
        gzip.GzipFile(filename="", mtime=0, fileobj=raw, mode="wb") as compressed,
        io.TextIOWrapper(compressed, encoding="utf8") as f,
    ):
        for table in FILTERS:
            cols, keys = layout(new, table)
            if layout(old, table) != (cols, keys):
                raise ValueError(f"Baseline needs current schema for {table}")
            oldrows, newrows = records(old, table), records(new, table)
            # 0247 skipped existing dev heads. A target seeded from empty can therefore
            # retain other exact versions of a subsequently retired identity.
            for identity, row in seeds.get(table, {}).items():
                if (
                    (row.get("catalogueId"),) in retired
                    and identity not in oldrows
                    and identity not in newrows
                ):
                    if row.get("actorId") == "system:migration:0247":
                        row["createdAt"] = "0247-target-clock"
                    oldrows[identity] = row
            # Preserve the original attribution in the backup. Map only actual user FK
            # columns, following the operator's verified production contributor selection.
            user_fks = [
                r["from"]
                for r in new.execute(f'PRAGMA foreign_key_list("{table}")')
                if r["table"] == "user"
            ]
            mapped = 0
            for row in newrows.values():
                for col in user_fks:
                    if row[col] == "hype-local-agent-admin":
                        row[col] = ACTOR
                        mapped += 1
            report[table] = {
                "baseline": len(oldrows),
                "desired": len(newrows),
                "mappedUserReferences": mapped,
            }
            f.write(compact({"table": table, "cols": cols, "keys": keys}) + "\n")
            for ident in sorted(oldrows.keys() | newrows.keys(), key=compact):
                before, after = oldrows.get(ident), newrows.get(ident)
                # Store equal dependencies once. Their contents still guard target ancestry.
                f.write(compact([before, "=" if before == after else after]) + "\n")
    out.with_suffix(".partial").rename(out)
    manifest = {
        "format": 1,
        "sourceSha256": sha(args.snapshot),
        "baselineSha256": sha(args.baseline),
        "recordsSha256": sha(out),
        "tables": report,
        "triggers": triggers,
        "requiredActor": {"username": "tijptjik", "id": ACTOR},
        "expected": inventory(new),
    }
    (dest / "curation.json").write_text(compact(manifest) + "\n")
    print(
        "Captured",
        sum(r["desired"] for r in report.values()),
        "scoped rows in",
        len(report),
        "tables",
    )


def stream(directory, manifest):
    path = directory / "records.jsonl.gz"
    if manifest["format"] != 1:
        raise ValueError("Unsupported curation format")
    if sha(path) != manifest["recordsSha256"]:
        raise ValueError("Curation record digest differs")
    with gzip.open(path, "rt") as f:
        for line in f:
            yield json.loads(line)


def seeded_equal(current, expected, table):
    if (
        table == "operator"
        and current
        and expected
        and expected["id"] == "mtr-corporation"
    ):
        return all(current[c] == v for c, v in expected.items() if c != "createdAt")
    if table != "identityCatalogueRevision" or not current or not expected:
        return False
    return current["actorId"] == expected["actorId"] == "system:migration:0247" and all(
        current[c] == v for c, v in expected.items() if c != "createdAt"
    )


def qualified(alias, field):
    return f'{alias}."{field}"'


def extract(alias, side, field):
    return f"""json_extract({alias}.{side},'$.{field}')"""


def sql_stage(table, cols, keys, ops):
    """Set-based transactional DML. Every touched primary key is compared byte-for-byte."""
    name = f'"{table}"'
    clauses = []
    for op in sorted(ops):
        src = "a" if op == "insert" else "b"
        rows = f"""(SELECT * FROM {STAGE} WHERE tbl='{table}' AND op='{op}')"""
        join = " AND ".join(
            f"{qualified('t', c)} IS {extract('s', src, c)}" for c in keys
        )
        eq = " AND ".join(
            f"{qualified('t', c)} IS {extract('s', 'b', c)}" for c in cols
        )
        if op == "insert":
            clauses.append(
                guard(f"NOT EXISTS(SELECT 1 FROM {rows} s JOIN {name} t ON {join})")
            )
            clauses.append(
                statement(
                    f"INSERT INTO {name}({','.join(cols)}) SELECT "
                    + ",".join(extract("s", "a", c) for c in cols)
                    + f" FROM {rows} s ORDER BY s.ord"
                )
            )
        else:
            clauses.append(
                guard(
                    f'NOT EXISTS(SELECT 1 FROM {rows} s LEFT JOIN {name} t ON {join} WHERE t."{keys[0]}" IS NULL OR NOT ({eq}))'
                )
            )
            if op == "delete":
                # Key lookup drives deletion from the small, explicitly reviewed set.
                clauses.append(
                    statement(
                        f"DELETE FROM {name} WHERE ({','.join(keys)}) IN (SELECT "
                        + ",".join(extract("s", "b", c) for c in keys)
                        + f" FROM {rows} s)"
                    )
                )
            else:
                changed = op.removeprefix("update:").split(",")
                assignments = ",".join(f'"{c}"={extract("s", "a", c)}' for c in changed)
                clauses.append(
                    statement(
                        f"UPDATE {name} AS t SET {assignments} FROM {rows} AS s WHERE {join}"
                    )
                )
    return clauses


def execute(db, group):
    db.execute("BEGIN")
    try:
        for s in group["statements"]:
            try:
                db.execute(s["sql"], s["params"])
            except sqlite3.Error as e:
                raise ValueError(f"{group['label']}: {s['sql'][:150]}: {e}") from e
        db.commit()
    except BaseException:
        db.rollback()
        raise


def groups_for(pending, table_ops, manifest, db):
    groups = []

    def add(label, statements):
        # Leave capacity for the managed runner's journal cursor and fences.
        if len(statements) > 900 or any(
            len(x["sql"].encode()) > 95000 or len(x["params"]) > 100 for x in statements
        ):
            raise ValueError(f"Runner limit exceeded in {label}")
        groups.append(dict(label="curation/" + label, statements=statements))

    add(
        "stage",
        [
            statement(
                f"CREATE TABLE {STAGE}(tbl TEXT,ord INTEGER,op TEXT,b TEXT,a TEXT,PRIMARY KEY(tbl,ord))"
            )
        ],
    )
    # Each binding is kept below the D1 value limit. Group requests remain bounded.
    # A bound JSON array stages many rows per statement without any dynamic SQL values.
    # Cap request and parameter sizes independently and keep statement counts below the runner limit.
    chunk, size = [], 0

    def stage_chunk():
        add(
            f"stage-{len(groups)}",
            [
                statement(
                    f"INSERT INTO {STAGE} SELECT "
                    + ",".join(f"json_extract(value,'$[{i}]')" for i in range(5))
                    + " FROM json_each(?)",
                    [compact(chunk)],
                )
            ],
        )

    for params in pending:
        size += sum(len(v.encode()) for v in params if isinstance(v, str))
        if chunk and (size > 480_000 or len(chunk) >= 2000):
            stage_chunk()
            chunk, size = [], sum(len(v.encode()) for v in params if isinstance(v, str))
        chunk.append(params)
    if chunk:
        stage_chunk()
    expected_triggers = {
        name: sql
        for name, (table, sql) in manifest["triggers"].items()
        if table in table_ops and name in HISTORICAL_TRIGGERS
    }
    active_triggers = {
        row["name"]: row["sql"]
        for row in db.execute("SELECT name,sql FROM sqlite_schema WHERE type='trigger'")
        if row["name"] in expected_triggers
    }
    if active_triggers != expected_triggers:
        mismatch = [
            name
            for name, sql in expected_triggers.items()
            if active_triggers.get(name) != sql
        ]
        raise ValueError(f"Historical replay trigger definitions differ: {mismatch}")
    final = [
        statement("PRAGMA defer_foreign_keys=ON"),
        guard(
            "EXISTS(SELECT 1 FROM user WHERE id=? AND username=?)", (ACTOR, "tijptjik")
        ),
        guard(f"(SELECT count(*) FROM {STAGE})=?", (len(pending),)),
    ]
    for name, sql in sorted(active_triggers.items()):
        final.extend(
            [
                guard(
                    "EXISTS(SELECT 1 FROM sqlite_schema WHERE type='trigger' AND name=? AND sql=?)",
                    (name, sql),
                ),
                statement(f'DROP TRIGGER "{name}"'),
            ]
        )
    for table, (cols, keys, ops) in table_ops.items():
        final.extend(sql_stage(table, cols, keys, ops))
    for name in sorted(active_triggers):
        final.append(statement(active_triggers[name]))
    # Verify the projected row values again after every table and its normal derived triggers.
    # Catalogue codes are operational identities; an unrelated target row cannot acquire
    # the same active kind/code as an incoming identity during the fenced install.
    final.append(
        guard("""NOT EXISTS(SELECT 1 FROM identityCatalogue c JOIN identityCatalogueRevisionContent r
      ON r.catalogueId=c.id AND r.version=c.version WHERE coalesce(json_extract(r.content,'$.isArchived'),0)=0
      AND json_extract(r.content,'$.code') IS NOT NULL GROUP BY c.kind,json_extract(r.content,'$.code') HAVING count(*)>1)""")
    )
    for table, (cols, keys, ops) in table_ops.items():
        join = " AND ".join(
            f"{qualified('t', c)} IS {extract('s', 'a', c)}" for c in keys
        )
        eq = " AND ".join(
            f"{qualified('t', c)} IS {extract('s', 'a', c)}" for c in cols
        )
        final.append(
            guard(f"""NOT EXISTS(SELECT 1 FROM {STAGE} s LEFT JOIN "{table}" t ON {join}
         WHERE s.tbl='{table}' AND s.op!='delete' AND (t."{keys[0]}" IS NULL OR NOT ({eq})))""")
        )
    final.extend(
        [
            guard("NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check)"),
            statement(f"DROP TABLE {STAGE}"),
        ]
    )
    add("install", final)
    return groups


def compare(directory, manifest, db, conflict_path=None):
    """Reject unknown target versions. Preserve independent, unselected target records."""
    initialize_scope(db)
    if not db.execute(
        "SELECT 1 FROM user WHERE id=? AND username=?", (ACTOR, "tijptjik")
    ).fetchone():
        raise ValueError("Target contributor identity differs")
    pending, table_ops, conflicts = [], {}, []
    seeds = release_seed(db)
    ancestry = None
    if (directory / REFERENCE).is_file() and db.execute(
        """SELECT 1 FROM featureLocationHistory h JOIN breadlineImportFeature b
           ON b.featureId=h.featureId WHERE h.action='baseline' AND h.version='initial' LIMIT 1"""
    ).fetchone():
        ancestry = ProductionAncestry(directory, manifest, db, stream)
    for entry in stream(directory, manifest):
        if isinstance(entry, dict):
            table, cols, keys = entry["table"], entry["cols"], tuple(entry["keys"])
            if table not in FILTERS:
                raise ValueError(f"Unexpected table {table}")
            target_cols, target_keys = layout(db, table)
            # All reads and writes name their columns. Enrollment order can change physical order.
            if set(target_cols) != set(cols) or target_keys != keys:
                raise ValueError(f"Target schema differs for {table}")
            existing = {}
            for row in db.execute(f'SELECT {",".join(cols)} FROM "{table}"'):
                ident = key(row, keys)
                if ident in existing:
                    raise ValueError(f"Ambiguous target key {table} {ident}")
                existing[ident] = dict(row)
            continue
        before, after = entry
        if after == "=":
            after = before
        if ancestry:
            pair = ancestry.adapt(table, before, after)
            if pair is None:
                continue
            before, after = pair
        identity = key(after or before, keys)
        current = existing.get(identity)
        if current == after or seeded_equal(current, after, table):
            continue
        seed = seeds.get(table, {}).get(identity)
        if (
            current != before
            and not seeded_equal(current, before, table)
            and not (seed and (current == seed or seeded_equal(current, seed, table)))
        ):
            # 0247 seeds only heads; earlier authenticated catalogue revisions may be missing.
            if current is not None or not table.startswith("identityCatalogue"):
                conflicts.append(
                    dict(
                        table=table,
                        key=identity,
                        before=before,
                        target=current,
                        desired=after,
                    )
                )
                continue
        op = (
            "delete"
            if after is None
            else "insert"
            if current is None
            else "update:" + ",".join(c for c in cols if current[c] != after[c])
        )
        pending.append(
            [
                table,
                len(pending),
                op,
                compact(current) if current else None,
                compact(after) if after else None,
            ]
        )
        table_ops.setdefault(table, (cols, keys, set()))[2].add(op)
    if conflicts:
        if conflict_path:
            with gzip.open(conflict_path, "wt", encoding="utf8") as out:
                json.dump(conflicts, out, ensure_ascii=False)
        counts = collections.Counter(c["table"] for c in conflicts)
        raise ValueError(
            f"{len(conflicts)} divergent target keys by table: {dict(counts)}"
        )
    # Snapshot IDs are opaque. Relationship and revision validators observe insertion
    # order, including multiple changes recorded in the same millisecond.
    by_table = collections.defaultdict(dict)
    for row in pending:
        if row[2] == "insert":
            after = json.loads(row[4])
            if "id" in after and (
                "previousRevisionId" in after or "previousHistoryId" in after
            ):
                by_table[row[0]][after["id"]] = (row, after)
    for entries in by_table.values():
        graph = TopologicalSorter()
        for ident, (_, after) in entries.items():
            parents = [
                after.get(c)
                for c in (
                    "previousRevisionId",
                    "mergedFromRevisionId",
                    "previousHistoryId",
                )
            ]
            graph.add(ident, *(p for p in parents if p in entries))
        slots = sorted(row[1] for row, _ in entries.values())
        for number, ident in zip(slots, graph.static_order(), strict=True):
            entries[ident][0][1] = number
    return pending, table_ops


def prepare(args):
    manifest = json.loads((args.package / "curation.json").read_text())
    args.output.mkdir(parents=True, exist_ok=False)
    target = read_db(args.target)
    trial = sqlite3.connect(args.output / "rehearsal.sqlite")
    target.backup(trial)
    target.close()
    trial.row_factory = sqlite3.Row
    trial.execute("PRAGMA foreign_keys=ON")
    pending, ops = compare(
        args.package, manifest, trial, args.output / "conflicts.json.gz"
    )
    print("Target-specific row operations", len(pending), flush=True)
    groups = groups_for(pending, ops, manifest, trial) if pending else []
    for group in groups:
        execute(trial, group)
    trial.close()
    trial = read_db(args.output / "rehearsal.sqlite")
    remaining, _ = compare(args.package, manifest, trial)
    if (
        remaining
        or trial.execute("pragma integrity_check").fetchone()[0] != "ok"
        or trial.execute("pragma foreign_key_check").fetchone()
    ):
        raise ValueError("Rehearsal failed replay or integrity")
    actual = inventory(trial)
    for k, values in manifest["expected"].items():
        if not {tuple(r) for r in values}.issubset(set(actual[k])):
            raise ValueError("Conservation failed for " + k)
    planfile = args.output / "groups.json"
    planfile.write_text(compact(groups) + "\n")
    report = {
        "targetSha256": sha(args.target),
        "recordsSha256": manifest["recordsSha256"],
        "groupsSha256": sha(planfile),
        "groups": len(groups),
        "operations": len(pending),
        "replayOperations": 0,
        "integrity": "ok",
        "foreignKeys": 0,
        "cohorts": {k: len(v) for k, v in manifest["expected"].items()},
    }
    (args.output / "verification.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))


if __name__ == "__main__":
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("capture")
    for name in ["baseline", "snapshot", "output"]:
        p.add_argument(name, type=Path)
    p = sub.add_parser("prepare")
    for name in ["package", "target", "output"]:
        p.add_argument(name, type=Path)
    args = parser.parse_args()
    (capture if args.cmd == "capture" else prepare)(args)
