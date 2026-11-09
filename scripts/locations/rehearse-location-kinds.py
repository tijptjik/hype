"""Refs #194: rehearse type seeding on a backup of a populated local database."""

import argparse
import importlib.util
import json
import os
from pathlib import Path
import sqlite3

SPEC = importlib.util.spec_from_file_location(
    "kind_seed", Path(__file__).with_name("seed-location-kinds.py")
)
seed = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(seed)


def table_hashes(db):
    """Fingerprint every persisted table to prove unrelated values remain unchanged."""
    return {
        r["name"]: seed.digest(
            sorted(
                [
                    {
                        key: {"blobHex": value.hex()}
                        if isinstance(value, bytes)
                        else value
                        for key, value in row.items()
                    }
                    for row in seed.rows(
                        db, f"SELECT * FROM {seed.identifier(r['name'])}"
                    )
                ],
                key=seed.canonical,
            )
        )
        for r in seed.rows(
            db, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
    }


def save_plan(directory, document):
    """Save private assertion, SQL and reconciliation artifacts for this exact snapshot."""
    directory.mkdir()
    (directory / "plan.json").write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n"
    )
    manifest = document["decisions"] + document["unassociated"]
    for filename, values in (
        ("manifest.jsonl", manifest),
        ("features.jsonl", document["features"]),
        (
            "conflicts.jsonl",
            [d for d in manifest if d["decision"] in ("conflict", "unresolved")],
        ),
    ):
        (directory / filename).write_text(
            "".join(seed.canonical(d) + "\n" for d in values)
        )
    for filename, rollback in (("apply.sql", False), ("rollback.sql", True)):
        (directory / filename).write_text(
            "-- Refs #194. Unnumbered; Agent 7 coordinates migration naming.\n"
            "-- Run every statement atomically; use the guarded local runner for rehearsal.\n"
            + ";\n".join(seed.statements(document, rollback))
            + ";\n"
        )
    (directory / "counts.json").write_text(
        json.dumps(document["counts"], indent=2) + "\n"
    )


def verify(db, document):
    """Prove actual SQL preserves identities, immutable rows and all unrelated tables."""
    before = table_hashes(db)
    old_locations = {r["id"]: r for r in seed.rows(db, "SELECT * FROM location")}
    old_revisions = {
        r["id"]: r for r in seed.rows(db, "SELECT * FROM locationRevision")
    }
    old_queue = {
        (r["runId"], r["locationId"]): r
        for r in seed.rows(db, "SELECT * FROM locationRefreshItem")
    }
    receipt = seed.apply_local(db, document)
    replay = seed.apply_local(db, document)
    assert replay["appendedRevisions"] == 0
    assert seed.plan(db, "rehearsal:replan")["counts"]["supported"] == 0
    after = table_hashes(db)
    assert before.keys() == after.keys()
    for name in before:
        if name not in ("location", "locationRevision", "locationRefreshItem"):
            assert before[name] == after[name], name
    changes = {
        d["locationId"]: d["proposedAfter"]
        for d in document["decisions"]
        if d["decision"] == "supported"
    }
    for current in seed.rows(db, "SELECT * FROM location"):
        assert current == {
            **old_locations[current["id"]],
            **({"kind": changes[current["id"]]} if current["id"] in changes else {}),
        }
    for current in seed.rows(db, "SELECT * FROM locationRevision"):
        if current["id"] in old_revisions:
            assert current == old_revisions[current["id"]]
    new_queue = []
    for row in seed.rows(db, "SELECT * FROM locationRefreshItem"):
        key = row["runId"], row["locationId"]
        if key in old_queue:
            assert row == old_queue[key]
        else:
            new_queue.append(row)
    expected_queue = {
        ("local:" + seed.revision_for(document, d)["id"], d["locationId"])
        for d in document["decisions"]
        if d["decision"] == "supported"
    }
    assert {(r["runId"], r["locationId"]) for r in new_queue} == expected_queue
    assert all(
        r["status"] == "pending"
        and r["origin"] == "local"
        and r["actorId"] == document["actorId"]
        and r["revisionId"] == r["runId"][6:]
        for r in new_queue
    )
    return {
        "application": receipt,
        "replay": replay,
        "unchangedTables": len(before) - 3,
        "expectedRefreshItems": len(new_queue),
        "beforeTableHashes": before,
        "afterTableHashes": after,
    }


def inject_review_cases(db):
    """Add test-only identity conflicts to a separate copy using actual association guards."""

    def member(code, offset=0):
        return seed.rows(
            db,
            """SELECT fp.* FROM featureLocation fp JOIN feature f ON f.id=fp.featureId
            JOIN project p ON p.id=f.projectId WHERE p.code=? ORDER BY fp.featureId LIMIT 1 OFFSET ?""",
            (code, offset),
        )[0]

    ghost, source, eln = (
        member("hkghostsigns"),
        member("hkghostsigns", 1),
        member("eln"),
    )
    # Shared unresolved Locations can be referenced across Organisations; no Feature facts are edited.
    db.execute(
        """UPDATE featureLocation SET locationId=?,revision='rehearsal:conflicting-share',
        factsRevisionId=?,locationRevisionId=?,acceptedOverrides='{}',
        factsOrganisationRevision=NULL,locationOrganisationRevision=NULL WHERE featureId=?""",
        (
            ghost["locationId"],
            ghost["factsRevisionId"],
            ghost["locationRevisionId"],
            eln["featureId"],
        ),
    )
    # Synthetic canonical identity is restricted to this disposable rehearsal database.
    baseline = seed.rows(
        db,
        "SELECT * FROM locationRevision WHERE locationId=? ORDER BY sequence DESC LIMIT 1",
        (source["locationId"],),
    )[0]
    db.execute(
        "UPDATE location SET kind='establishment',state='linked',ssId='rehearsal:source-establishment',ownerOrganisationId=NULL WHERE id=?",
        (source["locationId"],),
    )
    revision = {
        **baseline,
        "id": "rehearsal:source",
        "sequence": baseline["sequence"] + 1,
        "origin": "saanseoi",
        "ssId": "rehearsal:source-establishment",
        "apiVersion": "v1",
        "releaseId": "rehearsal",
        "snapshotId": "rehearsal",
        "contentHash": "rehearsal",
        "payload": '{"rehearsal":true}',
    }
    db.execute(
        f"INSERT INTO locationRevision({','.join(seed.identifier(k) for k in revision)}) VALUES({','.join('?' for _ in revision)})",
        tuple(revision.values()),
    )
    db.commit()
    return {
        "conflictingLocation": ghost["locationId"],
        "sourceLinkedLocation": source["locationId"],
    }


def main():
    """Back up read-only local state and run forward, replay, stale and compensating rollback checks."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    source = args.database.resolve(strict=True)
    directory = args.output.resolve()
    if directory.exists() or directory in source.parents:
        raise ValueError(
            "Use a new artifact directory outside the source database path"
        )
    directory.mkdir(parents=True)
    destination = directory / "rehearsal.sqlite"
    with (
        sqlite3.connect(source.as_uri() + "?mode=ro", uri=True) as original,
        sqlite3.connect(destination) as db,
    ):
        original.backup(db)
    with sqlite3.connect(destination) as db:
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        with sqlite3.connect(directory / "before.sqlite") as backup:
            db.backup(backup)
        document = seed.plan(db, "migration:location-kind-seed-refs-194")
        save_plan(directory / "plan", document)
        receipt = verify(db, document)
        receipt["rollback"] = seed.apply_local(db, document, rollback=True)
        receipt["rollbackReplay"] = seed.apply_local(db, document, rollback=True)
        assert (
            receipt["rollback"]["appendedRevisions"] == document["counts"]["supported"]
        )
        assert receipt["rollbackReplay"]["appendedRevisions"] == 0
        (directory / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    adversarial = directory / "adversarial.sqlite"
    with (
        sqlite3.connect(directory / "before.sqlite") as original,
        sqlite3.connect(adversarial) as db,
    ):
        original.backup(db)
    with sqlite3.connect(adversarial) as db:
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        identities = inject_review_cases(db)
        document2 = seed.plan(db, "rehearsal:location-kind-seed")
        decisions = {d["locationId"]: d for d in document2["decisions"]}
        assert (
            decisions[identities["conflictingLocation"]]["reason"]
            == "conflicting-dataset-kinds"
        )
        assert decisions[identities["sourceLinkedLocation"]]["decision"] == "conflict"
        assert decisions[identities["sourceLinkedLocation"]]["sourceLinked"]
        assert document2["counts"]["no-change"] > 0
        assert document2["counts"]["unassociatedFeatures"] > 0
        save_plan(directory / "adversarial-plan", document2)
        stale = next(d for d in document2["decisions"] if d["decision"] == "supported")
        db.execute(
            "UPDATE location SET kind='natural' WHERE id=?", (stale["locationId"],)
        )
        db.commit()
        before_stale = table_hashes(db)
        try:
            seed.apply_local(db, document2)
        except sqlite3.IntegrityError:
            pass
        else:
            raise AssertionError("Stale kind was not rejected")
        assert before_stale == table_hashes(db)
        db.execute(
            "UPDATE location SET kind=? WHERE id=?",
            (stale["expectedBefore"], stale["locationId"]),
        )
        db.commit()
        adversarial_receipt = {
            **verify(db, document2),
            "identities": identities,
            "staleRejectedAtomically": True,
        }
        (directory / "adversarial-receipt.json").write_text(
            json.dumps(adversarial_receipt, indent=2) + "\n"
        )
    print(
        json.dumps(
            {
                "output": str(directory),
                "inventory": document["counts"],
                "appendedRevisions": receipt["application"]["appendedRevisions"],
                "replayAppendedRevisions": receipt["replay"]["appendedRevisions"],
                "adversarialConflicts": document2["counts"]["conflict"],
                "unchangedTables": receipt["unchangedTables"],
            }
        )
    )


if __name__ == "__main__":
    main()
