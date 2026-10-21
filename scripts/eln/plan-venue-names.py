"""Refs #194: plan evidenced ELN Location names without writing any database.

Feature titles are literary works, while associated Location names identify the
venue. Research is in data/venue-names.json. Application belongs to the guarded
owner-baseline/Organisation-correction service; this script emits its input only.
"""

from __future__ import annotations

import argparse
import collections
import json
from pathlib import Path
import sqlite3

DATA = Path(__file__).parent / "data" / "venue-names.json"


def read_rows(db: sqlite3.Connection, query: str, parameters: tuple = ()) -> list[dict]:
    """Read dictionaries from the caller's explicitly selected read-only snapshot."""
    return [dict(row) for row in db.execute(query, parameters)]


def effective_names(facts: dict, overrides: dict) -> dict[str, str]:
    """Resolve inherit/clear/override names using the existing Location semantics."""
    result = dict(facts.get("names", {}))
    for locale, override in overrides.get("names", {}).items():
        if override.get("mode") == "clear":
            result.pop(locale, None)
        elif override.get("mode") == "override":
            result[locale] = override["value"]
    return {key: value for key, value in result.items() if value is not None}


def plan(db: sqlite3.Connection, research: dict) -> tuple[list[dict], dict]:
    """Inventory the full ELN scope, retaining conflicts and preserving other locales.

    Only an exact imported Feature-title name or already-correct venue name can
    be replaced automatically. Editorial names and conflicting Chinese names
    require review. A source-linked Location is fenced but remains an
    Organisation correction when applied by the existing service.
    """
    db.row_factory = sqlite3.Row
    scope = read_rows(db, """
        SELECT p.id, p.code projectCode, o.code organisationCode
        FROM project p JOIN organisation o ON o.id=p.organisationId WHERE p.id=?
    """, (research["projectId"],))
    if len(scope) != 1 or scope[0]["projectCode"] != research["projectCode"] or scope[0]["organisationCode"] != research["organisationCode"]:
        raise ValueError("ELN persisted project/Organisation identity differs")
    records = read_rows(db, """
        SELECT f.id featureId, f.layerId, f.organisationId,
          fi.title featureTitle, fi.displayAddress, fl.locationId,
          l.state, l.kind, l.ownerOrganisationId,
          lr.id expectedRevisionId, lr.sequence, lr.facts,
          ol.revision expectedOrganisationRevision, ol.overrides
        FROM feature f
        LEFT JOIN featureI18n fi ON fi.featureId=f.id AND fi.locale='en'
        LEFT JOIN featureLocation fl ON fl.featureId=f.id
        LEFT JOIN location l ON l.id=fl.locationId
        LEFT JOIN locationRevision lr ON lr.id=(
          SELECT r.id FROM locationRevision r WHERE r.locationId=l.id
          AND (l.state!='linked' OR r.origin='saanseoi') ORDER BY r.sequence DESC LIMIT 1
        )
        LEFT JOIN organisationLocation ol ON ol.locationId=l.id AND ol.organisationId=f.organisationId
        WHERE f.projectId=? ORDER BY f.layerId,f.id
    """, (research["projectId"],))
    by_feature = {row["featureId"]: row for row in records}
    by_research = {}
    for venue in research["venues"]:
        for feature_id in venue["featureIds"]:
            if feature_id in by_research:
                raise ValueError("A Feature belongs to more than one researched venue")
            by_research[feature_id] = venue
    missing = sorted(set(by_research) - set(by_feature))
    if missing:
        raise ValueError(f"Researched Feature identities missing: {missing}")
    proposals = []
    # Keep every Feature in the output; never silently discard a new or unmatched listing.
    for row in records:
        venue = by_research.get(row["featureId"])
        entry = {"manifestVersion": 1, "field": "names", **row}
        entry.pop("facts")
        entry.pop("overrides")
        entry["venueKey"] = venue["key"] if venue else None
        entry["evidence"] = [
            *(venue["evidence"] if venue else []),
            {"recordType": "feature", "recordId": row["featureId"],
             "field": "featureI18n.en.displayAddress", "quotedText": row["displayAddress"]},
        ]
        entry["notes"] = venue["notes"] if venue else "New listing has no researched venue mapping"
        entry["traditionalChineseDecision"] = venue["traditionalChineseDecision"] if venue else "unresolved"
        if not venue or not row["facts"] or row["state"] == "redirect":
            entry.update(decision="unresolved", expectedBefore=None, proposedAfter=None)
            proposals.append(entry)
            continue
        facts = json.loads(row["facts"])
        overrides = json.loads(row["overrides"] or "{}")
        before = effective_names(facts, overrides)
        after = {**before, **venue["names"]}
        entry.update(expectedBefore=before, proposedAfter=after)
        # Refuse to overwrite an unrelated editorial correction, even in this same venue.
        conflicts = [locale for locale, value in venue["names"].items()
                     if before.get(locale) not in (None, "", value)
                     and not (locale == "en" and before[locale] == row["featureTitle"])]
        expected_record = venue.get("expectedRecords", {}).get(row["featureId"])
        changed_record = expected_record is not None and any(
            row[key] != expected_record[key] for key in ("locationId", "displayAddress")
        )
        entry["decision"] = "conflict" if conflicts or changed_record else "no-change" if before == after else "supported"
        if changed_record:
            entry["notes"] += "; Venue association/address changed since research"
        if conflicts:
            entry["notes"] += "; Existing editorial name differs in " + ", ".join(conflicts)
        proposals.append(entry)
    # Multiple Features may point to one Location, but never apply conflicting names twice.
    destinations = collections.defaultdict(list)
    for proposal in proposals:
        if proposal["locationId"]:
            destinations[(proposal["organisationId"], proposal["locationId"])].append(proposal)
    for entries in destinations.values():
        proposed = {json.dumps(entry["proposedAfter"], sort_keys=True) for entry in entries}
        if len(proposed) > 1:
            for entry in entries:
                entry["decision"] = "conflict"
                entry["notes"] += "; Shared Location has inconsistent venue proposals"
    summary = {
        "features": len(records),
        "uniqueLocations": len({row["locationId"] for row in records if row["locationId"]}),
        "venueGroups": len(research["venues"]),
        "byEdition": dict(collections.Counter(row["layerId"] for row in records)),
        "byDecision": dict(collections.Counter(row["decision"] for row in proposals)),
        "traditionalChinese": dict(collections.Counter(row["traditionalChineseDecision"] for row in proposals)),
        "supportedChineseVenueGroups": sum(venue["traditionalChineseDecision"] == "supported" for venue in research["venues"]),
    }
    return proposals, summary


def main() -> None:
    """Read an explicit local database and write a reviewable, replayable manifest."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--research", type=Path, default=DATA)
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args()
    # mode=ro prevents accidental writes even when the destination is the local live DB.
    db = sqlite3.connect(arguments.database.resolve().as_uri() + "?mode=ro", uri=True)
    try:
        proposals, summary = plan(db, json.loads(arguments.research.read_text()))
    finally:
        db.close()
    arguments.output.mkdir(parents=True, exist_ok=True)
    (arguments.output / "names-proposals.jsonl").write_text("".join(
        json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in proposals
    ))
    (arguments.output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary))


if __name__ == "__main__":
    main()
