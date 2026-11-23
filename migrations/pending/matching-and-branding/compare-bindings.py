"""Retain the target-specific Breadline binding concordance before lifecycle enrollment."""

import argparse
import collections
import json
import os
from pathlib import Path

from scope import read_db


def binding(db, feature):
    row = db.execute(
        "SELECT * FROM featureLocation WHERE featureId=?", (feature,)
    ).fetchone()
    if row is None:
        return None, None
    revision = db.execute(
        "SELECT * FROM locationRevision WHERE id=? AND locationId=?",
        (row["factsRevisionId"], row["locationId"]),
    ).fetchone()
    return dict(row), dict(revision) if revision else None


def differing(a, b):
    return sorted(
        k for k in set(a or {}) | set(b or {}) if (a or {}).get(k) != (b or {}).get(k)
    )


def compare(baseline, target, output):
    before, destination = read_db(baseline), read_db(target)
    rows = []
    for crosswalk in before.execute(
        "SELECT * FROM breadlineImportFeature ORDER BY sourceTable,sourceId"
    ):
        table, source_id, feature = (
            crosswalk["sourceTable"],
            crosswalk["sourceId"],
            crosswalk["featureId"],
        )
        current = destination.execute(
            "SELECT * FROM breadlineImportFeature WHERE sourceTable=? AND sourceId=?",
            (table, source_id),
        ).fetchone()
        same_source = bool(
            current
            and current["featureId"] == feature
            and current["sourceHash"] == crosswalk["sourceHash"]
        )
        dev, dev_revision = binding(before, feature)
        prod, prod_revision = binding(destination, feature)
        rows.append(
            dict(
                sourceTable=table,
                sourceId=source_id,
                featureId=feature,
                sameSource=same_source,
                devLocation=(dev or {}).get("locationId"),
                targetLocation=(prod or {}).get("locationId"),
                devBinding=(dev or {}).get("version"),
                targetBinding=(prod or {}).get("version"),
                devRevision=(dev_revision or {}).get("id"),
                targetRevision=(prod_revision or {}).get("id"),
                devContentHash=(dev_revision or {}).get("contentHash"),
                targetContentHash=(prod_revision or {}).get("contentHash"),
                bindingDifferences=differing(dev, prod),
                revisionDifferences=differing(dev_revision, prod_revision),
            )
        )
    report = {
        "baseline": str(baseline),
        "target": str(target),
        "rows": rows,
        "sourceMatches": sum(r["sameSource"] for r in rows),
        "bindingDifferences": dict(
            collections.Counter(c for r in rows for c in r["bindingDifferences"])
        ),
        "revisionDifferences": dict(
            collections.Counter(c for r in rows for c in r["revisionDifferences"])
        ),
    }
    with output.open("x") as file:
        json.dump(report, file, indent=2)
    print(
        "Binding comparison",
        len(rows),
        "records;",
        report["sourceMatches"],
        "matching source fingerprints",
    )


if __name__ == "__main__":
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ["baseline", "target", "output"]:
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    compare(args.baseline, args.target, args.output)
