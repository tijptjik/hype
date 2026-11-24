"""Reattach frozen donor curation to the independently enrolled production ancestry."""

import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path

from scope import read_db

REFERENCE = "production-baseline.json.gz"
ABSENT = object()


def packed(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def one(db, sql, *values):
    rows = db.execute(sql, values).fetchmany(2)
    if len(rows) != 1:
        raise ValueError("Expected one production ancestry row for " + repr(values))
    return dict(rows[0])


def root_revision(db, fid):
    row = one(
        db,
        "SELECT * FROM featureRevision WHERE featureId=? AND sequence=1",
        fid,
    )
    if (
        json.loads(row["legacyEvidence"] or "{}").get("kind")
        != "current-projection-capture"
    ):
        raise ValueError("Expected the enrolled current-projection baseline for " + fid)
    return row


def capture(target, path):
    """Freeze the inspected production-derived before-images without backfilling private account data."""
    db = read_db(target)
    rows = {}
    for link in db.execute("SELECT * FROM breadlineImportFeature ORDER BY featureId"):
        fid = link["featureId"]
        feature = one(db, "SELECT * FROM feature WHERE id=?", fid)
        binding = one(db, "SELECT * FROM featureLocation WHERE featureId=?", fid)
        root = root_revision(db, fid)
        if (
            feature["currentRevisionId"] != root["id"]
            or binding["version"] != "initial"
            or binding["actorId"] is not None
        ):
            raise ValueError("Expected a freshly enrolled production donor " + fid)
        history = one(
            db,
            "SELECT * FROM featureLocationHistory WHERE featureId=? AND action='baseline' AND version='initial'",
            fid,
        )
        del history["id"], history["createdAt"]
        rows[fid] = dict(
            source=[
                link[k] for k in ("sourceTable", "sourceId", "featureId", "sourceHash")
            ],
            feature=feature,
            binding=binding,
            history=history,
            location=one(
                db, "SELECT * FROM location WHERE id=?", binding["locationId"]
            ),
            sourceRevision=one(
                db,
                "SELECT * FROM locationRevision WHERE id=? AND locationId=?",
                binding["factsRevisionId"],
                binding["locationId"],
            ),
            content=root["content"],
            recordState=root["recordState"],
        )
    with path.open("xb") as file:
        file.write(gzip.compress(packed(rows).encode(), mtime=0))
    db.close()


def merge(before, target, desired, field):
    """Apply only the authored difference. Reject two different edits to the same leaf."""
    if before == desired or target == desired:
        return target
    if before == target:
        return desired
    if all(isinstance(v, dict) for v in (before, target, desired)):
        merged = {}
        for k in sorted(before.keys() | target.keys() | desired.keys()):
            value = merge(
                before.get(k, ABSENT),
                target.get(k, ABSENT),
                desired.get(k, ABSENT),
                field + "." + k,
            )
            if value is not ABSENT:
                merged[k] = value
        return merged
    raise ValueError("Independent production and curation edits to " + field)


def merge_json(before, target, desired, field):
    if before == desired or target == desired:
        return target
    if target == before:
        return desired
    result = merge(
        *(json.loads(v) if v is not None else None for v in (before, target, desired)),
        field,
    )
    return None if result is None else packed(result)


class ProductionAncestry:
    """Use the known pre-curation production import and preserve the target's own enrolled IDs."""

    def __init__(self, directory, manifest, db, stream):
        path = directory / REFERENCE
        pins = json.loads(Path(__file__).with_name("release.json").read_text())["files"]
        data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() != pins[REFERENCE]:
            raise ValueError(
                "Production ancestry file differs from the reviewed release"
            )
        self.rows = json.loads(gzip.decompress(data))
        expected = sorted(manifest["expected"]["crosswalk"])
        observed = sorted(
            [
                list(r)
                for r in db.execute(
                    "SELECT sourceTable,sourceId,featureId,sourceHash FROM breadlineImportFeature"
                )
            ]
        )
        if (
            observed != expected
            or sorted(r["source"] for r in self.rows.values()) != expected
        ):
            raise ValueError(
                "Production source crosswalk differs from the frozen curation"
            )
        self.by_place = {}
        self.by_revision = {}
        self.dev_roots = {}
        self.dev_binding = {}
        self.roots = {}
        for fid, ref in self.rows.items():
            root = root_revision(db, fid)
            if any(
                json.loads(root[k]) != json.loads(ref[k])
                for k in ("content", "recordState")
            ):
                raise ValueError("Production enrollment content differs for " + fid)
            self.roots[fid] = root
            ref["feature"]["currentRevisionId"] = root["id"]
            hist = one(
                db,
                "SELECT * FROM featureLocationHistory WHERE featureId=? AND action='baseline' AND version='initial'",
                fid,
            )
            del hist["id"], hist["createdAt"]
            if hist != ref["history"]:
                raise ValueError(
                    "Production baseline binding history differs for " + fid
                )
            loc = ref["location"]
            self.by_place[loc["id"]] = ref
            # Migration-generated clocks can change between otherwise identical rehearsals.
            loc["createdAt"] = one(
                db, "SELECT createdAt FROM location WHERE id=?", loc["id"]
            )["createdAt"]
            rev = ref["sourceRevision"]
            self.by_revision[rev["id"]] = ref
            actual = one(
                db,
                "SELECT * FROM locationRevision WHERE id=? AND locationId=?",
                rev["id"],
                rev["locationId"],
            )
            rev["createdAt"] = actual["createdAt"]
            if actual != rev:
                raise ValueError("Production immutable source facts differ for " + fid)
        known_shared = set()
        for item in stream(directory, manifest):
            if isinstance(item, dict):
                table = item["table"]
                continue
            before, after = item
            if table == "locationSharedRevision":
                known_shared.add((before or after)["id"])
            if not before:
                continue
            if table == "featureRevision" and before["sequence"] == 1:
                self.dev_roots[before["featureId"]] = before
            if table == "featureLocation":
                self.dev_binding[before["featureId"]] = before
        if (
            self.rows.keys() != self.dev_roots.keys()
            or self.rows.keys() != self.dev_binding.keys()
        ):
            raise ValueError("Incomplete donor ancestry")
        for fid, ref in self.rows.items():
            original = self.dev_binding[fid]
            if {
                k: v for k, v in original.items() if k not in ("version", "actorId")
            } != {
                k: v
                for k, v in ref["binding"].items()
                if k not in ("version", "actorId")
            }:
                raise ValueError("Production binding basis differs for " + fid)
        for r in db.execute("SELECT id,locationId FROM locationSharedRevision"):
            if r["locationId"] in self.by_place and r["id"] not in known_shared:
                raise ValueError(
                    "Independent shared Location correction for " + r["locationId"]
                )

    def content_version(self, fid, raw):
        content = json.loads(raw)
        place = content["placement"].get("location")
        if place and place["associationVersion"] == self.dev_binding[fid]["version"]:
            place["associationVersion"] = "initial"
        return packed(content)

    def adapt(self, table, before, after):
        """Return the reviewed target before/after pair, or skip preserved source-only ancestry."""
        if table == "location" and before:
            # SQLite exposes generated matchingType in SELECT *, but derives it on installation.
            source = self.by_place[before["id"]]["location"]
            target = {column: source[column] for column in before}
            return target, merge(before, target, after, "location")
        if table == "locationRevision" and before:
            if before != after:
                raise ValueError("The release edits an immutable source revision")
            target = self.by_revision[before["id"]]["sourceRevision"]
            return target, target
        if table == "locationSharedRevision" and before:
            if before != after:
                raise ValueError("The release rewrites an earlier shared correction")
            return None, after
        if table == "revisionChangeSet" and before:
            if before != after:
                raise ValueError("The release rewrites an earlier changeset")
            return None
        if table == "featureRevision":
            if before:
                if before != after:
                    raise ValueError("The release rewrites an earlier Feature revision")
                return None
            fid = after["featureId"]
            parent, root = self.dev_roots[fid], self.roots[fid]
            updated = after.copy()
            if updated["previousRevisionId"] == parent["id"]:
                updated["previousRevisionId"] = root["id"]
            updated["content"] = merge_json(
                self.content_version(fid, parent["content"]),
                root["content"],
                self.content_version(fid, after["content"]),
                "featureRevision.content",
            )
            updated["recordState"] = merge_json(
                parent["recordState"],
                root["recordState"],
                after["recordState"],
                "featureRevision.recordState",
            )
            return None, updated
        if table == "featureLocationHistory":
            if before:
                if (
                    before != after
                    or before["action"] != "link"
                    or before["version"]
                    != self.dev_binding[before["featureId"]]["version"]
                ):
                    raise ValueError("Unexpected development baseline link")
                return None
            if (
                after["previousRevision"]
                == self.dev_binding[after["featureId"]]["version"]
            ):
                after = {**after, "previousRevision": "initial"}
        if table == "featureLocation" and before:
            target = self.rows[before["featureId"]]["binding"]
            # A new association version carries its own recorded author.
            return target, after if before != after else target
        if table == "feature" and before:
            target = self.rows[before["id"]]["feature"]
            original = {**before, "currentRevisionId": target["currentRevisionId"]}
            new = after.copy()
            if new["currentRevisionId"] == before["currentRevisionId"]:
                new["currentRevisionId"] = target["currentRevisionId"]
            new["addressMeta"] = merge_json(
                before["addressMeta"],
                target["addressMeta"],
                after["addressMeta"],
                "feature.addressMeta",
            )
            original["addressMeta"] = target["addressMeta"]
            if before["geometry"] != after["geometry"]:
                # The native move triggers invalidate division and MTR caches belonging to the old coordinates.
                for column in (
                    "countryId",
                    "areaId",
                    "districtId",
                    "townId",
                    "ruralAreaId",
                    "macrohoodId",
                    "neighbourhoodId",
                    "villageId",
                    "microhoodId",
                    "hamletId",
                    "islandId",
                    "divisionResolution",
                    "mtrStation",
                    "mtrExit",
                    "mtrDistance",
                    "mtrResolution",
                ):
                    if after[column] is not None:
                        raise ValueError(
                            "Moved donor has an unexpected cached " + column
                        )
                    original[column] = target[column]
            return target, merge(original, target, new, "feature")
        return before, after


def verify_retained_source(db, target):
    """Compare original target rows byte for byte after the curation transaction."""
    db.execute(
        "ATTACH DATABASE ? AS original", (target.resolve().as_uri() + "?mode=ro",)
    )
    subjects = "(SELECT featureId FROM original.breadlineImportFeature)"
    original_history = (
        "FROM original.featureLocationHistory WHERE featureId IN " + subjects
    )
    if not db.execute(
        "SELECT 1 "
        + original_history
        + " AND action='baseline' AND version='initial' LIMIT 1"
    ).fetchone():
        return None
    feature_revisions = "FROM original.featureRevision WHERE featureId IN " + subjects
    filters = {
        "breadlineImportFeature": "1",
        "featureLocationHistory": "featureId IN " + subjects,
        "featureRevision": "featureId IN " + subjects,
        "revisionChangeSet": "id IN (SELECT changeSetId " + feature_revisions + ")",
        "locationRevision": "id IN (SELECT factsRevisionId " + original_history + ")",
    }
    counts = {}
    for table, predicate in filters.items():
        original = f'SELECT * FROM original."{table}" WHERE {predicate}'
        if db.execute(
            f'SELECT 1 FROM ({original} EXCEPT SELECT * FROM main."{table}") LIMIT 1'
        ).fetchone():
            raise ValueError("Release altered existing production ancestry in " + table)
        counts[table] = db.execute(f"SELECT count(*) FROM ({original})").fetchone()[0]
    return counts


if __name__ == "__main__":
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", type=Path)
    parser.add_argument("new_reference", type=Path)
    args = parser.parse_args()
    capture(args.target, args.new_reference)
