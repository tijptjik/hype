"""Refs #194: build a private, offline Location review tool from the seed snapshot."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import sqlite3
from urllib.parse import quote

ASSETS = Path(__file__).with_name("kind-review")


def read_rows(db: sqlite3.Connection, query: str, parameters: tuple = ()) -> list[dict]:
    """Read only the columns required for visual review; never export account/contact data."""
    return [dict(row) for row in db.execute(query, parameters)]


def point(geometry: str | dict | None) -> list[float] | None:
    """Return a validated geographic Point, or retain the missing-geometry condition."""
    try:
        value = json.loads(geometry) if isinstance(geometry, str) else geometry
        coords = value["coordinates"]
        if value["type"] == "Point" and len(coords) >= 2:
            lon, lat = coords[:2]
            if (
                all(
                    isinstance(v, (int, float)) and math.isfinite(v) for v in (lon, lat)
                )
                and -180 <= lon <= 180
                and -90 <= lat <= 90
            ):
                return [lon, lat]
    except (KeyError, TypeError, ValueError):
        pass
    return None


def distance(a: list[float], b: list[float]) -> float:
    """Measure distance in metres; proximity supplies no establishment/building identity evidence."""
    lon1, lat1, lon2, lat2 = map(math.radians, [*a, *b])
    haversine = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 6371008.8 * 2 * math.asin(min(1, math.sqrt(haversine)))


def photo_url(image: dict) -> str | None:
    """Build an existing public image delivery URL, preserving its stored environment/version."""
    public_id = quote(image["publicId"], safe="/")
    version = f"/v{image['version']}" if image["version"] is not None else ""
    transformation = (
        f"/image/upload/c_fill,h_256,w_256/g_auto/f_webp/q_auto{version}/{public_id}"
    )
    if image["cdn"] == "cloudflareR2":
        bases = {
            "production": "https://assets.hype.hk",
            "preview": "https://assets.preview.hype.hk",
            "local": "http://assets.hype.localhost",
            "development": "http://assets.hype.localhost",
        }
        return (
            bases.get(image["env"], "") + transformation
            if image["env"] in bases
            else None
        )
    if image["cdn"] == "cloudinary":
        return f"https://res.cloudinary.com/{quote(image['env'], safe='')}/image/upload/c_fit,w_512{version}/{public_id}"
    return None


def build_data(
    db: sqlite3.Connection, plan: dict, split: dict | None, app_origin: str
) -> dict:
    """Join assertions with saved evidence and historical exclusion receipts behind snapshot fences."""
    exclusions = (
        {row["featureId"]: row["reason"] for row in split.get("exclusions", [])}
        if split
        else {}
    )
    decisions = {row["locationId"]: row for row in plan["decisions"]}
    records = []
    # Nearby suggestions come only from already persisted local identities, never an external match claim.
    locations = []
    for row in read_rows(
        db,
        """SELECT l.id,l.kind,l.state,l.ssId,r.id revisionId,r.facts FROM location l
        JOIN locationRevision r ON r.locationId=l.id WHERE r.sequence=(SELECT max(sequence) FROM locationRevision WHERE locationId=l.id)""",
    ):
        facts = json.loads(row.pop("facts"))
        row["names"] = facts.get("common", facts).get("names", {})
        row["point"] = point(facts.get("common", facts).get("location", {}).get("geometry"))
        row["projects"] = [
            p["code"]
            for p in read_rows(
                db,
                """SELECT DISTINCT p.code FROM featureLocation fl
            JOIN feature f ON f.id=fl.featureId JOIN project p ON p.id=f.projectId WHERE fl.locationId=? ORDER BY p.code""",
                (row["id"],),
            )
        ]
        locations.append(row)
    for feature in plan["features"]:
        feature_id = feature["featureId"]
        current = read_rows(db, "SELECT * FROM feature WHERE id=?", (feature_id,))
        if not current:
            raise ValueError(f"Missing snapshot Feature: {feature_id}")
        current = current[0]
        association = read_rows(
            db, "SELECT * FROM featureLocation WHERE featureId=?", (feature_id,)
        )
        if (
            current["modifiedAt"] != feature["expectedModifiedAt"]
            or (association[0] if association else None) != feature["association"]
            or any(
                current[k] != feature[k]
                for k in (
                    "isDraft",
                    "isIntangible",
                    "isArchived",
                    "isPublished",
                    "layerId",
                    "projectId",
                    "organisationId",
                )
            )
        ):
            raise ValueError(
                f"Snapshot differs from seed plan: {feature_id}; regenerate using matching inputs"
            )
        translations = read_rows(
            db,
            "SELECT locale,title,displayAddress,description FROM featureI18n WHERE featureId=? ORDER BY locale",
            (feature_id,),
        )
        layer = read_rows(
            db,
            "SELECT name FROM layerI18n WHERE layerId=? AND locale='en'",
            (feature["layerId"],),
        )
        saved_point = point(current["geometry"])
        historical_reason = exclusions.get(feature_id)
        inferred_reason = (
            "draft"
            if current["isDraft"]
            else "intangible"
            if current["isIntangible"]
            else "non-point"
            if not saved_point
            else "needs-investigation"
        )
        if (
            not association
            and historical_reason
            and historical_reason != inferred_reason
        ):
            raise ValueError(
                f"Split receipt disagrees with saved eligibility: {feature_id}"
            )
        reason = (
            historical_reason or inferred_reason if not association else "associated"
        )
        if reason == "draft":
            explanation = "Skipped before source matching: the split importer excludes draft Features. A saved map point does not override that rule."
            next_step = "Review whether this is a real, complete record. If it should leave draft state, use the existing Feature workflow, then reassess its Location."
        elif reason == "intangible":
            explanation = "Skipped before source matching: this Feature is marked intangible, and the split importer excludes it from initial Location creation. This flag does not mean closed or demolished."
            next_step = "Review the meaning of the intangible flag for this Feature. A historic sign or business may still have a physical host; record that decision before changing the flag or association."
        elif reason == "non-point":
            explanation = "Skipped before source matching: initial Location creation requires a Point geometry."
            next_step = (
                "Review the geometry and physical identity before proposing a Location."
            )
        elif reason == "associated":
            explanation = "This Feature already has a Location association. The seed reviews that Location’s kind; an association alone does not establish an external source match."
            next_step = "Review the proposed kind against the venue identity and preserved evidence."
        else:
            explanation = "No Location association exists, but the saved draft/intangible/geometry checks do not explain it. No failed-match conclusion is supported."
            next_step = "Investigate the split/association history before proposing a new identity."
        nearby = []
        if not association and saved_point:
            for candidate in locations:
                if candidate["point"]:
                    metres = distance(saved_point, candidate["point"])
                    if metres <= 250:
                        nearby.append({**candidate, "distanceMetres": round(metres, 1)})
            nearby.sort(
                key=lambda candidate: (candidate["distanceMetres"], candidate["id"])
            )
        images = read_rows(
            db,
            """SELECT i.id,i.cdn,i.env,i.publicId,i.version FROM featureImage fi
            JOIN image i ON i.id=fi.imageId WHERE fi.featureId=? AND i.isArchived=0 ORDER BY fi.intent,i.id LIMIT 8""",
            (feature_id,),
        )
        assertion = decisions.get(feature["locationId"])
        if assertion:
            baseline = assertion.get("expectedBaseline")
            assertion = {
                key: assertion[key]
                for key in ("expectedBefore", "proposedAfter", "decision", "reason")
            } | {
                "expectedBaseline": {
                    "id": baseline["id"],
                    "sequence": baseline["sequence"],
                    "facts": json.dumps(
                        {"names": json.loads(baseline["facts"]).get("common", json.loads(baseline["facts"])).get("names", {})},
                        ensure_ascii=False,
                    ),
                }
                if baseline
                else None
            }
        record = {
            **feature,
            "association": {
                key: value
                for key, value in feature["association"].items()
                if key != "acceptedOverrides"
            }
            if feature["association"]
            else None,
            "translations": translations,
            "layerName": layer[0]["name"] if layer else feature["layerId"],
            "point": saved_point,
            "createdAt": current["createdAt"],
            "modifiedAt": current["modifiedAt"],
            "isVisitable": current["isVisitable"],
            "reason": reason,
            "explanation": explanation,
            "nextStep": next_step,
            "historicalExclusionVerified": historical_reason is not None
            and not association,
            "ruleReference": "src/lib/db/services/locationBaseline.ts:93"
            if reason == "draft"
            else "src/lib/db/services/locationBaseline.ts:94"
            if reason == "intangible"
            else None,
            "nearby": nearby[:6],
            "images": [
                {"id": image["id"], "url": photo_url(image)}
                for image in images
                if photo_url(image)
            ],
            "assertion": assertion,
            "adminUrl": app_origin.rstrip("/")
            + "/admin/features/"
            + quote(feature_id, safe=""),
        }
        records.append(record)
    missing = [record for record in records if record["locationId"] is None]
    return {
        "manifestVersion": 1,
        "planId": plan["planId"],
        "planCreatedAt": plan["createdAt"],
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "migrationHead": plan.get("migrationHead"),
        "counts": plan["counts"],
        "records": records,
        "blockers": {
            reason: sum(record["reason"] == reason for record in missing)
            for reason in sorted({record["reason"] for record in missing})
        },
        "verifiedHistoricalExclusions": sum(
            record["historicalExclusionVerified"] for record in missing
        ),
        "splitReceiptSha256": hashlib.sha256(
            json.dumps(split, sort_keys=True).encode()
        ).hexdigest()
        if split
        else None,
    }


def main() -> None:
    """Generate one self-contained HTML file; all database connections are read only."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True, type=Path)
    parser.add_argument("--plan", required=True, type=Path)
    parser.add_argument("--split-manifest", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--app-origin", default="http://hype.localhost")
    args = parser.parse_args()
    os.umask(0o077)
    if not args.app_origin.startswith(("http://", "https://")):
        raise ValueError("App origin must use HTTP(S)")
    database = args.database.resolve(strict=True)
    output = args.output.resolve()
    if output.exists() or output in (
        database,
        args.plan.resolve(),
        args.split_manifest.resolve() if args.split_manifest else None,
    ):
        raise ValueError("Output must be a new file separate from the inputs")
    plan = json.loads(args.plan.read_text())
    plan_hash = hashlib.sha256(
        json.dumps(
            {k: v for k, v in plan.items() if k != "planId"},
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
    ).hexdigest()
    if plan_hash != plan["planId"]:
        raise ValueError("Seed plan hash mismatch")
    split = json.loads(args.split_manifest.read_text()) if args.split_manifest else None
    with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as db:
        db.row_factory = sqlite3.Row
        db.execute("BEGIN")
        data = build_data(db, plan, split, args.app_origin)
    payload = (
        json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        .replace("<", "\\u003c")
        .replace("&", "\\u0026")
    )
    html = (
        (ASSETS / "index.html")
        .read_text()
        .replace("/* REVIEW_CSS */", (ASSETS / "review.css").read_text())
        .replace("/* REVIEW_JS */", (ASSETS / "review.js").read_text())
        .replace('"REVIEW_DATA_JSON"', payload)
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html)
    print(
        json.dumps(
            {
                "output": str(output),
                "records": len(data["records"]),
                "blockers": data["blockers"],
                "verifiedHistoricalExclusions": data["verifiedHistoricalExclusions"],
            }
        )
    )


if __name__ == "__main__":
    main()
