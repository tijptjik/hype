"""Freeze the donor phone amendments and verify effective phones and establishment bindings."""

import argparse
import collections
import gzip
import hashlib
import json
import os
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from scope import layout, read_db

FILE = "donor-phones.json.gz"
PROPERTY = "gPropPhNum01"
ACTOR = "qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM"


def packed(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def row(db, table, **keys):
    where = " AND ".join(f'"{col}"=?' for col in keys)
    found = db.execute(
        f'SELECT * FROM "{table}" WHERE {where}', tuple(keys.values())
    ).fetchall()
    if len(found) != 1:
        raise ValueError(f"Expected one {table} row for {list(keys.values())}")
    return dict(found[0])


def phones(facts):
    return facts.get("common", facts).get("phoneNumber") or []


def effective(source, corrections):
    entry = corrections.get("phoneNumber") or {}
    choice = {} if entry.get("supersededBy") else entry.get("choice", {})
    return (
        choice.get("value", [])
        if choice.get("mode") in ("override", "clear")
        else phones(source)
    )


def token(source_hash, kind, subject):
    return str(
        uuid5(
            NAMESPACE_URL,
            f"hype.hk/breadline/donor-phones/{source_hash}/{kind}/{subject}",
        )
    )


def freeze(dev_path, prod_path, export_path, output):
    dev, prod = read_db(dev_path), read_db(prod_path)
    source = json.loads(export_path.read_bytes())
    source_hash = hashlib.sha256(export_path.read_bytes()).hexdigest()
    by_id = {r["id"]: r for r in source["rows"]}
    if len(by_id) != len(source["rows"]):
        raise ValueError("Duplicate Breadline donor ID")
    subjects = list(
        dev.execute(
            "SELECT sourceId,featureId FROM breadlineImportFeature WHERE sourceTable='donors' ORDER BY sourceId"
        )
    )
    if set(by_id) != {r["sourceId"] for r in subjects}:
        raise ValueError("Breadline export and donor crosswalk differ")
    result = {
        "sourceSha256": source_hash,
        "capturedAt": source["capturedAt"],
        "variants": {},
    }
    for name, baseline in (("development", dev), ("production", prod)):
        edits = collections.defaultdict(list)
        expected = {}
        summary = collections.Counter()

        def amend(table, before, after):
            _, keys = layout(dev, table)
            edits[table].append([[after[k] for k in keys], before, after])

        for subject in subjects:
            sid, fid = subject
            imported = by_id[sid]
            if (
                imported["raw"]
                and str(imported["raw"]).strip()
                and not imported["canonical"]
            ):
                raise ValueError(f"Unparsed Breadline phone for donor {sid}")
            feature = row(dev, "feature", id=fid)
            binding = row(dev, "featureLocation", featureId=fid)
            lid = binding["locationId"]
            loc = row(dev, "location", id=lid)
            prop = row(dev, "featureProperty", featureId=fid, propertyId=PROPERTY)
            old_phones = json.loads(prop["value"] or "[]")
            want = [imported["canonical"]] if imported["canonical"] else old_phones
            latest = dev.execute(
                "SELECT id FROM locationRevision WHERE locationId=? ORDER BY version DESC LIMIT 1",
                (lid,),
            ).fetchone()[0]

            def source_revision(rid):
                db = (
                    baseline
                    if baseline.execute(
                        "SELECT 1 FROM locationRevision WHERE id=? AND locationId=?",
                        (rid, lid),
                    ).fetchone()
                    else dev
                )
                return row(db, "locationRevision", id=rid, locationId=lid)

            current = source_revision(latest)
            facts = json.loads(current["facts"])
            if (
                facts.get("kind") != "establishment"
                or loc["state"] not in ("linked", "unresolved")
                or bool(loc["ssId"]) != (loc["state"] == "linked")
            ):
                raise ValueError(f"Unexpected donor establishment for {sid}")
            head = dev.execute(
                "SELECT * FROM locationSharedHead WHERE locationId=?", (lid,)
            ).fetchone()
            corrections = json.loads(head["corrections"]) if head else {}
            shared = effective(facts, corrections)
            policy = json.loads(binding["acceptancePolicy"] or "{}")
            overrides = json.loads(binding["acceptedOverrides"])
            bound_facts = json.loads(
                source_revision(binding["factsRevisionId"])["facts"]
            )
            pins = policy.get("factsSharedFields", [])
            old_pin = next(
                (x["revision"] for x in pins if x["field"] == "phoneNumber"),
                policy.get("factsSharedRevision"),
            )

            def pinned_facts(pin):
                return effective(
                    bound_facts,
                    json.loads(
                        row(dev, "locationSharedRevision", id=pin, locationId=lid)[
                            "corrections"
                        ]
                    )
                    if pin
                    else {},
                )

            verdict = "no-source-phone"
            initial_shared = shared
            if imported["canonical"]:
                if not shared:
                    # The verified snapshot has one donor per Location requiring a contribution.
                    if (
                        dev.execute(
                            "SELECT count(*) FROM featureLocation WHERE locationId=?",
                            (lid,),
                        ).fetchone()[0]
                        != 1
                    ):
                        raise ValueError(
                            "Shared donor Location requires contribution reconciliation"
                        )
                    if dev.execute(
                        "SELECT 1 FROM locationCurationLockRevision WHERE locationId=?",
                        (lid,),
                    ).fetchone():
                        raise ValueError(
                            "Review locked Location fields before phone import"
                        )
                    new_pin = token(source_hash, "shared", lid)
                    attributes = (
                        json.loads(current["rawSource"] or "{}")
                        .get("resource", {})
                        .get("attributes")
                    )
                    source_fields = facts.get("common", facts)
                    original = {"present": False}
                    if "phoneNumber" in source_fields and (
                        attributes is None or attributes.get("phones") is not None
                    ):
                        original = {
                            "present": True,
                            "value": source_fields["phoneNumber"],
                        }
                    corrections = {
                        **corrections,
                        "phoneNumber": {
                            "actorId": ACTOR,
                            "editedAt": source["capturedAt"],
                            "sourceRevisionId": latest,
                            "original": original,
                            "choice": {"mode": "override", "value": want},
                        },
                    }
                    amend(
                        "locationSharedRevision",
                        None,
                        dict(
                            id=new_pin,
                            locationId=lid,
                            previousRevisionId=head["id"] if head else None,
                            sourceRevisionId=latest,
                            corrections=packed(corrections),
                            actorId=ACTOR,
                            provenance=packed(
                                dict(
                                    kind="breadline-donor-phone",
                                    sourceId=sid,
                                    sourceSha256=source_hash,
                                )
                            ),
                            createdAt=source["capturedAt"],
                        ),
                    )
                    shared = want
                    verdict = "fill-location"
                elif shared == want:
                    new_pin = head["id"] if head else None
                    verdict = "exact-location"
                else:
                    verdict = "retain-feature-override"
                if shared == want:
                    if verdict == "fill-location" or pinned_facts(old_pin) != want:
                        if effective(bound_facts, corrections) != want:
                            raise ValueError(
                                f"Current and accepted Location phones require separate adoption for {sid}"
                            )
                        policy["factsSharedFields"] = [
                            x for x in pins if x["field"] != "phoneNumber"
                        ] + [{"field": "phoneNumber", "revision": new_pin}]
                    overrides.pop("phoneNumber", None)
                else:
                    overrides["phoneNumber"] = {"mode": "override", "value": want}
                freshness = overrides.get("freshness")
                if freshness and "phoneNumber" in freshness:
                    del freshness["phoneNumber"]
                    if not freshness:
                        del overrides["freshness"]
            summary[verdict] += 1
            expected[fid] = dict(
                sourceId=sid,
                locationId=lid,
                ssId=loc["ssId"],
                sourcePhone=imported["canonical"],
                featurePhones=want,
                locationPhones=shared,
                priorLocationPhones=initial_shared,
                action=verdict,
            )
            if (
                overrides == json.loads(binding["acceptedOverrides"])
                and policy == json.loads(binding["acceptancePolicy"] or "{}")
                and old_phones == want
            ):
                continue
            version, rev_id = (
                token(source_hash, "binding", fid),
                token(source_hash, "feature", fid),
            )
            changeset = token(source_hash, "changeset", "donors")
            new_binding = {
                **binding,
                "version": version,
                "actorId": ACTOR,
                "acceptedOverrides": packed(overrides),
                "acceptancePolicy": packed(policy),
            }
            amend("featureLocation", binding, new_binding)
            history = {
                k: new_binding[k]
                for k in (
                    "featureId",
                    "version",
                    "actorId",
                    "locationId",
                    "factsRevisionId",
                    "locationRevisionId",
                    "acceptedOverrides",
                    "factsOrganisationRevision",
                    "locationOrganisationRevision",
                    "occupancyRevisionId",
                    "addressRevisionId",
                    "membershipRevisionIds",
                    "placementOverrides",
                )
            }
            history.update(
                action="update",
                previousRevision=binding["version"],
                geometry=binding["acceptedGeometry"],
                policySnapshot=new_binding["acceptancePolicy"],
                adoptionProposalId=binding["acceptanceProposalId"],
                createdAt=source["capturedAt"],
            )
            amend("featureLocationHistory", None, history)
            old_revision = row(
                dev, "featureRevision", id=feature["currentRevisionId"], featureId=fid
            )
            content = json.loads(old_revision["content"])
            link = content["placement"]["location"]
            if (
                link["associationVersion"] != binding["version"]
                or old_revision["sequence"] != feature["revisionVersion"]
            ):
                raise ValueError(f"Feature ancestry differs for {sid}")
            link.update(
                associationVersion=version,
                acceptedOverrides=overrides,
                acceptancePolicy=policy,
            )
            selection = content["properties"][PROPERTY]["selection"]
            if json.loads(selection["value"] or "[]") != old_phones:
                raise ValueError(
                    f"Materialized phone differs from accepted history for {sid}"
                )
            if old_phones != want:
                amend("featureProperty", prop, {**prop, "value": packed(want)})
                selection["value"] = packed(want)
            if not edits["revisionChangeSet"]:
                amend(
                    "revisionChangeSet",
                    None,
                    dict(
                        id=changeset,
                        actorId=ACTOR,
                        origin="migration",
                        reason="Retain production Breadline donor phones and contribute missing establishment contacts",
                        createdAt=source["capturedAt"],
                        legacyEvidence=None,
                    ),
                )
            amend(
                "featureRevision",
                None,
                {
                    **old_revision,
                    "id": rev_id,
                    "previousRevisionId": old_revision["id"],
                    "sequence": old_revision["sequence"] + 1,
                    "changeSetId": changeset,
                    "content": packed(content),
                    "mergedFromRevisionId": None,
                    "legacyEvidence": None,
                    "baselineAttribution": None,
                },
            )
            amend(
                "feature",
                feature,
                {
                    **feature,
                    "modifiedAt": source["capturedAt"],
                    "currentRevisionId": rev_id,
                    "revisionVersion": feature["revisionVersion"] + 1,
                },
            )
        result["variants"][name] = dict(edits=edits, expected=expected, summary=summary)
    with output.open("xb") as file:
        file.write(gzip.compress(packed(result).encode(), mtime=0))
    for name, variant in result["variants"].items():
        print(name, dict(variant["summary"]))


def independent_enrollment(db):
    return bool(
        db.execute(
            """SELECT 1 FROM featureLocationHistory h JOIN breadlineImportFeature b
           ON b.featureId=h.featureId WHERE h.action='baseline' AND h.version='initial' LIMIT 1"""
        ).fetchone()
    )


def read_overlay(directory, production):
    path = directory / FILE
    digest = json.loads(Path(__file__).with_name("release.json").read_bytes())["files"][
        FILE
    ]
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != digest:
        raise ValueError("Donor phone input differs from the pinned release")
    return json.loads(gzip.decompress(data))["variants"][
        "production" if production else "development"
    ]


def with_phones(stream, overlay):
    """Apply the reviewed edits to the desired records before matching target before-images."""
    remaining = {}

    def additions():
        for before, after in remaining.values():
            if before is not None:
                raise ValueError("Missing donor phone amendment basis")
            yield [None, after]

    for item in stream:
        if isinstance(item, dict):
            yield from additions()
            table = item["table"]
            keys = item["keys"]
            remaining = {
                tuple(key): (before, after)
                for key, before, after in overlay["edits"].get(table, [])
            }
            yield item
            continue
        before, after = item
        desired = before if after == "=" else after
        key = tuple((desired or before)[k] for k in keys)
        if key in remaining:
            expected, updated = remaining.pop(key)
            if expected != desired:
                raise ValueError(
                    f"Donor phone amendment basis differs for {table} {key}"
                )
            yield [before, updated]
        else:
            yield item
    yield from additions()


def verify(db, overlay):
    """Compare source, current and accepted contact values and the exact established identities."""
    totals = collections.Counter()
    for fid, expected in overlay["expected"].items():
        loc = row(db, "location", id=expected["locationId"])
        link = row(db, "featureLocation", featureId=fid)
        if (
            link["locationId"] != loc["id"]
            or loc["ssId"] != expected["ssId"]
            or not db.execute(
                "SELECT 1 FROM breadlineImportFeature WHERE sourceTable='donors' AND sourceId=? AND featureId=?",
                (expected["sourceId"], fid),
            ).fetchone()
        ):
            raise ValueError("Donor identity or Location binding differs")
        latest = db.execute(
            "SELECT facts FROM locationRevisionContent WHERE locationId=? ORDER BY version DESC LIMIT 1",
            (loc["id"],),
        ).fetchone()
        head = db.execute(
            "SELECT corrections FROM locationSharedHead WHERE locationId=?",
            (loc["id"],),
        ).fetchone()
        if (
            json.loads(latest[0]).get("kind") != "establishment"
            or effective(json.loads(latest[0]), json.loads(head[0]) if head else {})
            != expected["locationPhones"]
        ):
            raise ValueError("Current establishment phone differs for " + fid)
        wanted = expected["featurePhones"]
        prop = row(db, "featureProperty", featureId=fid, propertyId=PROPERTY)
        feature = row(db, "feature", id=fid)
        content = json.loads(
            row(db, "featureRevision", id=feature["currentRevisionId"], featureId=fid)[
                "content"
            ]
        )
        if (
            json.loads(prop["value"] or "[]") != wanted
            or json.loads(content["properties"][PROPERTY]["selection"]["value"] or "[]")
            != wanted
        ):
            raise ValueError("Current Feature phone differs for " + fid)
        ov = json.loads(link["acceptedOverrides"])
        if content["placement"]["location"]["acceptedOverrides"] != ov:
            raise ValueError("Accepted phone choice differs from binding")
        if expected["sourcePhone"]:
            policy = json.loads(link["acceptancePolicy"] or "{}")
            pin = next(
                (
                    f["revision"]
                    for f in policy.get("factsSharedFields", [])
                    if f["field"] == "phoneNumber"
                ),
                policy.get("factsSharedRevision"),
            )
            facts = json.loads(
                row(
                    db,
                    "locationRevisionContent",
                    id=link["factsRevisionId"],
                    locationId=loc["id"],
                )["facts"]
            )
            inherited = effective(
                facts,
                json.loads(
                    row(db, "locationSharedRevision", id=pin, locationId=loc["id"])[
                        "corrections"
                    ]
                )
                if pin
                else {},
            )
            if expected["locationPhones"] == wanted:
                if "phoneNumber" in ov or inherited != wanted:
                    raise ValueError("Donor failed exact phone inheritance for " + fid)
            elif ov.get("phoneNumber") != {"mode": "override", "value": wanted}:
                raise ValueError("Missing donor-specific phone override for " + fid)
        totals[expected["action"]] += 1
    if dict(totals) != overlay["summary"]:
        raise ValueError("Donor phone cohort changed")
    return dict(totals)


if __name__ == "__main__":
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ("dev", "production", "export", "new_output"):
        parser.add_argument(arg, type=Path)
    args = parser.parse_args()
    freeze(args.dev, args.production, args.export, args.new_output)
