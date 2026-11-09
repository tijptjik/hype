"""Refs #194: inventory and guard deterministic Location.kind changes, never remote data.

See spec/breadline/proposal/01-places-features.md. SQL is an unnumbered data
plan: Agent 7 assigns any migration filename after integrating other manifests.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3
from datetime import datetime, timezone

# Reviewed persisted ancestry, not display-name, subject, archive or matching heuristics.
SCOPES = (
    ("ghost-signs", "hkghostsigns", "hkghostsigns", "building", "7akti7OImSFg"),
    ("eln-venues", "eunic", "eln", "establishment", None),
    (
        "independent-bookstores",
        "cmef",
        "independentBookstores",
        "establishment",
        "RfWMLs_jW6QJ",
    ),
    ("breadline-donors", "hkfoodworks", "breadline", "establishment", "1msQMcuqfHrP"),
)
VERSION = 1


def canonical(value: object) -> str:
    """Serialize an audit value deterministically, without losing Unicode evidence."""
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest(value: object) -> str:
    """Return the SHA-256 identity of a canonical audit value."""
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def literal(value: object) -> str:
    """Quote a SQLite literal; dynamic identifiers are separately quoted."""
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def identifier(value: str) -> str:
    """Quote a database-owned column/table identifier."""
    return '"' + value.replace('"', '""') + '"'


def rows(db: sqlite3.Connection, query: str, values: tuple = ()) -> list[dict]:
    """Read dictionaries from an explicitly selected local SQLite connection."""
    return [dict(row) for row in db.execute(query, values)]


def predicate(row: dict) -> str:
    """Fence every captured column, including NULLs and exact JSON text."""
    return " AND ".join(
        f"{identifier(key)} IS {literal(value)}" for key, value in row.items()
    )


def snapshot(db: sqlite3.Connection, table: str, where: str) -> dict:
    """Capture a complete unordered relational subset for SQL stale-data fences."""
    values = rows(db, f"SELECT * FROM {identifier(table)} WHERE {where}")
    return {"table": table, "where": where, "rows": sorted(values, key=canonical)}


def reconcile(db: sqlite3.Connection) -> dict:
    """Read kind, association and integrity counts for the application receipt."""
    return {
        "features": db.execute("SELECT count(*) FROM feature").fetchone()[0],
        "locations": db.execute("SELECT count(*) FROM location").fetchone()[0],
        "associations": db.execute("SELECT count(*) FROM featureLocation").fetchone()[
            0
        ],
        "revisions": db.execute("SELECT count(*) FROM locationRevision").fetchone()[0],
        "refreshItems": db.execute(
            "SELECT count(*) FROM locationRefreshItem"
        ).fetchone()[0],
        "kinds": rows(
            db, "SELECT kind,count(*) count FROM location GROUP BY kind ORDER BY kind"
        ),
        "foreignKeyViolations": rows(db, "PRAGMA foreign_key_check"),
        "integrity": db.execute("PRAGMA integrity_check").fetchone()[0],
    }


def plan(db: sqlite3.Connection, actor: str) -> dict:
    """Inventory all scoped Features and choose one guarded assertion per Location.

    Includes archives, historic layers and unassociated Features. Only an owner's
    unmatched/manual unknown kind can advance. Canonical/source identities and
    sharing with unclassified datasets require review, even when names look alike.
    """
    if not actor.strip():
        raise ValueError("An explicit historical actor is required")
    if "kind" not in {r["name"] for r in rows(db, "PRAGMA table_info(location)")}:
        raise ValueError("Apply coordinated Location schema migrations first")
    accessed = datetime.now(timezone.utc).isoformat()
    scopes, features, fences = [], [], []
    schema_where = "name NOT LIKE 'sqlite_%' AND name!='_location_kind_seed_guard'"
    fences.append(
        {
            "table": "sqlite_master",
            "where": schema_where,
            "rows": rows(
                db,
                f"SELECT name,type,tbl_name,sql FROM sqlite_master WHERE {schema_where} ORDER BY name",
            ),
        }
    )
    migration_head = None
    if db.execute("SELECT 1 FROM sqlite_master WHERE name='d1_migrations'").fetchone():
        fences.append(snapshot(db, "d1_migrations", "1=1"))
        migration_head = rows(
            db, "SELECT * FROM d1_migrations ORDER BY id DESC LIMIT 1"
        )[0]
    has_imports = (
        db.execute(
            "SELECT 1 FROM sqlite_master WHERE name='breadlineImportFeature'"
        ).fetchone()
        is not None
    )
    for dataset, org_code, project_code, wanted, reviewed_layer in SCOPES:
        ancestors = rows(
            db,
            """SELECT p.id projectId,p.code projectCode,
            o.id organisationId,o.code organisationCode FROM project p
            JOIN organisation o ON o.id=p.organisationId WHERE p.code=? AND o.code=?""",
            (project_code, org_code),
        )
        if len(ancestors) != 1:
            raise ValueError(f"{dataset}: expected exactly one persisted ancestry")
        ancestor = ancestors[0]
        project_id = ancestor["projectId"]
        layers = rows(
            db,
            """SELECT l.*,i.name nameEn FROM layer l LEFT JOIN layerI18n i
            ON i.layerId=l.id AND i.locale='en' WHERE l.projectId=? ORDER BY l.id""",
            (project_id,),
        )
        if reviewed_layer and not any(
            layer["id"] == reviewed_layer for layer in layers
        ):
            raise ValueError("Reviewed dataset layer missing from persisted ancestry")
        included = [
            layer
            for layer in layers
            if not reviewed_layer or layer["id"] == reviewed_layer
        ]
        # Freeze full project/layer ancestry, including empty archived layers and excluded dropoffs.
        for table, where in (
            ("organisation", f"code={literal(org_code)}"),
            ("project", f"code={literal(project_code)}"),
            ("layer", f"projectId={literal(project_id)}"),
        ):
            fences.append(snapshot(db, table, where))
        condition = f"projectId={literal(project_id)}"
        if reviewed_layer:
            condition += f" AND layerId={literal(reviewed_layer)}"
        feature_rows = rows(db, f"SELECT * FROM feature WHERE {condition} ORDER BY id")
        fences.append(snapshot(db, "feature", condition))
        layer_ids = {layer["id"] for layer in included}
        for feature in feature_rows:
            association = rows(
                db, "SELECT * FROM featureLocation WHERE featureId=?", (feature["id"],)
            )
            if (
                feature["organisationId"] != ancestor["organisationId"]
                or feature["layerId"] not in layer_ids
            ):
                raise ValueError(f"Feature ancestry mismatch: {feature['id']}")
            features.append(
                {
                    "dataset": dataset,
                    "featureId": feature["id"],
                    **ancestor,
                    "layerId": feature["layerId"],
                    "isArchived": feature["isArchived"],
                    "isPublished": feature["isPublished"],
                    "isDraft": feature["isDraft"],
                    "isIntangible": feature["isIntangible"],
                    "isVisitable": feature["isVisitable"],
                    "expectedModifiedAt": feature["modifiedAt"],
                    "requiredKind": wanted,
                    "locationId": association[0]["locationId"] if association else None,
                    "association": association[0] if association else None,
                    "legacySourceIdentities": rows(
                        db,
                        "SELECT * FROM breadlineImportFeature WHERE featureId=?",
                        (feature["id"],),
                    )
                    if has_imports
                    else [],
                }
            )
        scopes.append(
            {
                "dataset": dataset,
                **ancestor,
                "kind": wanted,
                "includedLayerIds": [layer["id"] for layer in included],
                "layers": included,
                "excludedLayers": [layer for layer in layers if layer not in included],
                "totalFeatures": len(feature_rows),
                "archivedFeatures": sum(bool(f["isArchived"]) for f in feature_rows),
            }
        )
    feature_ids = {f["featureId"] for f in features}
    # The query remains dynamic so newly added associations or shared references invalidate a plan.
    scope_filter = " OR ".join(
        f"(projectId={literal(s['projectId'])} AND layerId IN ("
        + ",".join(literal(layer_id) for layer_id in s["includedLayerIds"])
        + "))"
        for s in scopes
    )
    scoped_locations = f"SELECT locationId FROM featureLocation WHERE featureId IN (SELECT id FROM feature WHERE {scope_filter})"
    association_where = f"featureId IN (SELECT id FROM feature WHERE {scope_filter}) OR locationId IN ({scoped_locations})"
    fences.append(snapshot(db, "featureLocation", association_where))
    if has_imports:
        fences.append(
            snapshot(
                db,
                "breadlineImportFeature",
                f"featureId IN (SELECT id FROM feature WHERE {scope_filter})",
            )
        )
    fences.append(
        snapshot(db, "organisationLocation", f"locationId IN ({scoped_locations})")
    )
    # A move of an out-of-scope shared Feature can introduce a conflicting dataset intent.
    fences.append(
        snapshot(
            db,
            "feature",
            f"id IN (SELECT featureId FROM featureLocation WHERE locationId IN ({scoped_locations}))",
        )
    )
    decisions = []
    for location_id in sorted({f["locationId"] for f in features if f["locationId"]}):
        location = rows(db, "SELECT * FROM location WHERE id=?", (location_id,))[0]
        heads = rows(
            db,
            "SELECT * FROM locationRevision WHERE locationId=? ORDER BY version DESC LIMIT 1",
            (location_id,),
        )
        baseline = heads[0] if heads else None
        references = [f for f in features if f["locationId"] == location_id]
        wanted = {f["requiredKind"] for f in references}
        other_features = rows(
            db,
            "SELECT featureId FROM featureLocation WHERE locationId=? ORDER BY featureId",
            (location_id,),
        )
        outside = [
            f["featureId"] for f in other_features if f["featureId"] not in feature_ids
        ]
        source_revisions = rows(
            db,
            "SELECT id,ssId,origin FROM locationRevision WHERE locationId=? AND (origin='saanseoi' OR ssId IS NOT NULL)",
            (location_id,),
        )
        after = next(iter(wanted)) if len(wanted) == 1 else None
        if len(wanted) != 1:
            decision, reason = "conflict", "conflicting-dataset-kinds"
        elif any(
            identity["sourceTable"] != "donors"
            for f in references
            if f["dataset"] == "breadline-donors"
            for identity in f["legacySourceIdentities"]
        ):
            decision, reason = "conflict", "breadline-source-cohort-mismatch"
        elif location["kind"] == after:
            decision, reason = "no-change", "already-correct"
        elif location["kind"] != "unknown":
            decision, reason = "conflict", "contradictory-existing-kind"
        elif (
            location["ssId"] is not None
            or location["state"] == "linked"
            or source_revisions
        ):
            decision, reason = "conflict", "source-identity-review"
        elif outside:
            decision, reason = "conflict", "shared-with-unclassified-dataset"
        elif location["state"] not in ("unresolved", "manual") or location[
            "ownerOrganisationId"
        ] not in {f["organisationId"] for f in references}:
            decision, reason = "unresolved", "baseline-owner-review"
        elif not baseline or baseline["origin"] != "local":
            decision, reason = "unresolved", "missing-local-baseline"
        else:
            decision, reason = "supported", "dataset-venue-kind"
        evidence = [
            {
                "url": None,
                "recordReference": {
                    "featureId": f["featureId"],
                    "locationRevisionId": baseline["id"] if baseline else None,
                },
                "accessedAt": accessed,
                "quotedText": f"{f['organisationCode']}/{f['projectCode']}; layer {f['layerId']}",
                "supports": "identity/type",
                "sourceDate": None,
            }
            for f in references
        ]
        decisions.append(
            {
                "manifestVersion": VERSION,
                "featureId": references[0]["featureId"]
                if len(references) == 1
                else None,
                "featureIds": [f["featureId"] for f in references],
                "locationId": location_id,
                "imageId": None,
                "field": "location.kind",
                "expectedBefore": location["kind"],
                "proposedAfter": after,
                "decision": decision,
                "reason": reason,
                "evidence": evidence,
                "effectiveDate": None,
                "datePrecision": None,
                "confidence": "high"
                if decision in ("supported", "no-change")
                else "unknown",
                "notes": (
                    "Classifies the associated venue, independently of Feature subject. "
                    + (
                        "Review building/tenant identity and reassociation; retain permanent IDs and history; no automatic split."
                        if decision == "conflict"
                        else reason
                    )
                ),
                "expectedLocation": location,
                "expectedBaseline": baseline,
                "sourceLinked": bool(location["ssId"] or source_revisions),
                "sourceRevisions": source_revisions,
                "outsideFeatureIds": outside,
            }
        )
    missing = [
        {
            "manifestVersion": VERSION,
            "featureId": f["featureId"],
            "locationId": None,
            "imageId": None,
            "field": "location.kind",
            "expectedBefore": None,
            "proposedAfter": f["requiredKind"],
            "decision": "unresolved",
            "reason": "unassociated-feature",
            "expectedFeatureModifiedAt": f["expectedModifiedAt"],
            "dataset": f["dataset"],
            "isDraft": f["isDraft"],
            "isIntangible": f["isIntangible"],
            "evidence": [
                {
                    "url": None,
                    "recordReference": {
                        "featureId": f["featureId"],
                        "projectId": f["projectId"],
                        "layerId": f["layerId"],
                    },
                    "accessedAt": accessed,
                    "quotedText": "Persisted Feature has no featureLocation association",
                    "supports": "association",
                    "sourceDate": None,
                }
            ],
            "effectiveDate": None,
            "datePrecision": None,
            "confidence": "unknown",
            "notes": "No Location to classify. Review existing Feature-split eligibility; do not invent an identity.",
        }
        for f in features
        if not f["locationId"]
    ]
    result = {
        "manifestVersion": VERSION,
        "issue": "https://github.com/tijptjik/hype/issues/194",
        "actorId": actor,
        "createdAt": accessed,
        "migrationHead": migration_head,
        "scopes": scopes,
        "features": features,
        "decisions": decisions,
        "unassociated": missing,
        "fences": fences,
        "before": reconcile(db),
        "counts": {
            "totalFeatures": len(features),
            "uniqueLocations": len(decisions),
            "unassociatedFeatures": len(missing),
            "archivedFeatures": sum(bool(f["isArchived"]) for f in features),
            "sourceLinkedLocations": sum(d["sourceLinked"] for d in decisions),
            "legacySourceIdentities": sum(
                len(f["legacySourceIdentities"]) for f in features
            ),
            **{
                key: sum(d["decision"] == key for d in decisions)
                for key in ("supported", "no-change", "conflict", "unresolved")
            },
            "existingKinds": {
                kind: sum(d["expectedBefore"] == kind for d in decisions)
                for kind in sorted({d["expectedBefore"] for d in decisions})
            },
        },
    }
    result["planId"] = digest(result)
    return result


def revision_for(document: dict, decision: dict, rollback: bool = False) -> dict:
    """Author an immutable type-only owner baseline using the existing payload contract."""
    baseline = decision["expectedBaseline"]
    forward_id = "ks" + digest([document["planId"], decision["locationId"]])[:30]
    revision_id = (
        ("kr" + digest([document["planId"], decision["locationId"]])[:30])
        if rollback
        else forward_id
    )
    payload = {
        "kind": "organisation-baseline-edit",
        "actorId": document["actorId"],
        "organisationId": decision["expectedLocation"]["ownerOrganisationId"],
        "previousRevisionId": forward_id if rollback else baseline["id"],
        "typeChange": {
            "before": decision["proposedAfter"]
            if rollback
            else decision["expectedBefore"],
            "after": decision["expectedBefore"]
            if rollback
            else decision["proposedAfter"],
        },
        "provenance": {
            "locationKindSeed": {
                "manifestVersion": VERSION,
                "planId": document["planId"],
                "issue": document["issue"],
                "rationale": decision["reason"],
                "evidence": decision["evidence"],
                "rollback": rollback,
            }
        },
    }
    # New revision envelopes capture the classification at this point in history.
    # Legacy plans remain executable on their original schema; migration 0142 reads typeChange.
    facts = baseline["facts"]
    snapshot = json.loads(facts)
    if snapshot.get("schemaVersion") == 1:
        target_kind = payload["typeChange"]["after"]
        if snapshot["kind"] != target_kind:
            previous = snapshot["details"]
            if target_kind == "establishment":
                snapshot["details"] = {"brands": previous.get("brands", [])}
                if "operatingStatus" in previous:
                    snapshot["details"]["operatingStatus"] = previous["operatingStatus"]
            elif target_kind == "building":
                if previous.get("brands") or previous.get("operatingStatus") is not None:
                    raise ValueError("Reconcile establishment-specific facts before classifying a building")
                snapshot["details"] = {key: previous[key] for key in ["buildingStatus"] if key in previous}
            else:
                snapshot["details"] = {key: previous[key] for key in ["brands", "operatingStatus", "buildingStatus"] if key in previous} if target_kind == "unknown" else {}
            snapshot["kind"] = target_kind
        facts = canonical(snapshot)
    return {
        "id": revision_id,
        "locationId": decision["locationId"],
        "version": baseline["version"] + (2 if rollback else 1),
        "origin": "local",
        "ssId": None,
        "apiVersion": None,
        "releaseId": None,
        "snapshotId": None,
        "contentHash": revision_id,
        "rawSource": canonical(payload),
        "facts": facts,
        "createdAt": document["createdAt"],
    }


def statements(document: dict, rollback: bool = False) -> list[str]:
    """Emit guarded, replayable SQL; caller must execute every statement atomically.

    Exact original/post kind and baseline tokens are the only accepted states.
    An existing kind alone never counts as proof this plan was previously applied.
    """

    def check(expression: str) -> str:
        """Reject a stale assertion before authoring any type changes."""
        return f"INSERT INTO _location_kind_seed_guard SELECT CASE WHEN {expression} THEN 1 ELSE 0 END"

    output = ["CREATE TABLE _location_kind_seed_guard(ok INTEGER NOT NULL CHECK(ok=1))"]
    for fence in document["fences"]:
        table, where = identifier(fence["table"]), fence["where"]
        output.append(
            check(f"(SELECT count(*) FROM {table} WHERE {where})={len(fence['rows'])}")
        )
        for row in fence["rows"]:
            output.append(
                check(f"EXISTS(SELECT 1 FROM {table} WHERE {predicate(row)})")
            )
    changes = []
    for decision in document["decisions"]:
        old = decision["expectedLocation"]
        baseline = decision["expectedBaseline"]
        target = f"locationId={literal(old['id'])}"
        original_head = (
            f"EXISTS(SELECT 1 FROM locationRevision WHERE {predicate(baseline)} AND version=(SELECT max(version) FROM locationRevision WHERE {target}))"
            if baseline
            else f"NOT EXISTS(SELECT 1 FROM locationRevision WHERE {target})"
        )
        if decision["decision"] != "supported":
            output.append(
                check(
                    f"EXISTS(SELECT 1 FROM location WHERE {predicate(old)}) AND {original_head}"
                )
            )
            continue
        revision = revision_for(document, decision, rollback)
        forward = revision_for(document, decision)
        before = {**old, "kind": decision["proposedAfter"]} if rollback else old
        after = {**old, "kind": old["kind"] if rollback else decision["proposedAfter"]}
        predecessor = forward if rollback else baseline
        initial = (
            f"EXISTS(SELECT 1 FROM location WHERE {predicate(before)}) AND "
            f"EXISTS(SELECT 1 FROM locationRevision WHERE {predicate(predecessor)} AND version=(SELECT max(version) FROM locationRevision WHERE {target})) AND "
            f"NOT EXISTS(SELECT 1 FROM locationRevision WHERE id={literal(revision['id'])})"
        )
        applied = (
            f"EXISTS(SELECT 1 FROM location WHERE {predicate(after)}) AND "
            f"EXISTS(SELECT 1 FROM locationRevision WHERE {predicate(revision)} AND version=(SELECT max(version) FROM locationRevision WHERE {target}))"
        )
        output.append(check(f"({initial}) OR ({applied})"))
        columns = ",".join(identifier(key) for key in revision)
        values = ",".join(literal(value) for value in revision.values())
        changes.extend(
            [
                f"INSERT INTO locationRevision({columns}) SELECT {values} WHERE {initial}",
                f"UPDATE location SET kind={literal(after['kind'])} WHERE {predicate(before)} AND EXISTS(SELECT 1 FROM locationRevision WHERE {predicate(revision)})",
                check(applied),
            ]
        )
    # Validate all stale fences before any authoring. Never touch Features or correction heads.
    return [*output, *changes, "DROP TABLE _location_kind_seed_guard"]


def apply_local(db: sqlite3.Connection, document: dict, rollback: bool = False) -> dict:
    """Execute on an explicit local copy with a single transaction and read-back checks."""
    expected_hash = document["planId"]
    if (
        digest({key: value for key, value in document.items() if key != "planId"})
        != expected_hash
    ):
        raise ValueError("Plan hash mismatch")
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("BEGIN IMMEDIATE")
    try:
        before = reconcile(db)
        changes_before = db.total_changes
        for statement in statements(document, rollback):
            db.execute(statement)
        after = reconcile(db)
        if after["foreignKeyViolations"] or after["integrity"] != "ok":
            raise ValueError("Integrity/foreign-key acceptance failed")
        if any(
            before[key] != after[key]
            for key in ("features", "locations", "associations")
        ):
            raise ValueError("Identity/association counts changed")
        db.commit()
        return {
            "planId": expected_hash,
            "appliedAt": datetime.now(timezone.utc).isoformat(),
            "rollback": rollback,
            "before": before,
            "after": after,
            "expectedTypeChanges": document["counts"]["supported"],
            "appendedRevisions": after["revisions"] - before["revisions"],
            "sqlChangesIncludingGuards": db.total_changes - changes_before,
        }
    except BaseException:
        db.rollback()
        raise


def main() -> None:
    """Write private inventory/SQL artifacts or apply to an explicitly named local copy."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument(
        "--output", type=Path, required=True, help="New private artifact directory"
    )
    parser.add_argument("--actor")
    parser.add_argument("--apply-plan", type=Path)
    parser.add_argument("--rollback", action="store_true")
    args = parser.parse_args()
    os.umask(0o077)
    database = args.database.resolve(strict=True)
    output = args.output.resolve()
    if output == database or output in database.parents or output.exists():
        raise ValueError(
            "Output must be a new directory separate from the input database"
        )
    if args.rollback and not args.apply_plan:
        raise ValueError("--rollback requires --apply-plan")
    if args.apply_plan:
        # This runner deliberately cannot alter an active Miniflare database or a symlink to it.
        if ".wrangler" in database.parts:
            raise ValueError(
                "Apply only to an isolated local copy, never active Miniflare state"
            )
        document = json.loads(args.apply_plan.read_text())
        with sqlite3.connect(database) as db:
            db.row_factory = sqlite3.Row
            backup = output / "before.sqlite"
            output.mkdir(parents=True)
            with sqlite3.connect(backup) as recovery:
                db.backup(recovery)
            receipt = apply_local(db, document, args.rollback)
            (output / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
        print(json.dumps(receipt))
    else:
        if not args.actor:
            raise ValueError("--actor is required to plan authored type changes")
        with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as db:
            db.row_factory = sqlite3.Row
            db.execute("BEGIN")
            document = plan(db, args.actor)
        output.mkdir(parents=True)
        (output / "plan.json").write_text(
            json.dumps(document, ensure_ascii=False, indent=2) + "\n"
        )
        (output / "features.jsonl").write_text(
            "".join(canonical(f) + "\n" for f in document["features"])
        )
        manifest = document["decisions"] + document["unassociated"]
        (output / "manifest.jsonl").write_text(
            "".join(canonical(d) + "\n" for d in manifest)
        )
        (output / "conflicts.jsonl").write_text(
            "".join(
                canonical(d) + "\n"
                for d in manifest
                if d["decision"] in ("conflict", "unresolved")
            )
        )
        for name, rollback in (("apply.sql", False), ("rollback.sql", True)):
            header = f"-- Refs #194; plan {document['planId']}. Agent 7 assigns the migration filename.\n-- Execute atomically in an error-propagating transaction; not Bun multi-statement exec.\n"
            (output / name).write_text(
                header + ";\n".join(statements(document, rollback)) + ";\n"
            )
        (output / "counts.json").write_text(
            json.dumps(document["counts"], indent=2) + "\n"
        )
        print(json.dumps({"planId": document["planId"], **document["counts"]}))


if __name__ == "__main__":
    main()
