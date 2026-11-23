"""Freeze the exact catalogue and station release objects referenced by curated D1 history."""

import argparse
import hashlib
import json
import os
import re
from pathlib import Path

from scope import initialize_scope, read_db

LOGO = re.compile(r"/api/identity-catalogue/logos/([0-9a-f-]{36})")
MAP_HASH = re.compile(r"[0-9a-f]{64}")


def map_versions(db):
    result = set()
    for table, col in [
        ("premisesMapPublication", "hash"),
        ("premisesMapDraftRevision", "hash"),
        ("premisesMapCorrection", "sourceSnapshotHash"),
    ]:
        result.update(
            tuple(r)
            for r in db.execute(
                f"SELECT mapId,{col} FROM {table} WHERE mapId IN selected_maps"
            )
        )
    for row in db.execute(
        "SELECT id,draftHash,publishedHash FROM premisesMap WHERE id IN selected_maps"
    ):
        result.update((row[0], h) for h in row[1:] if h)
    return result


def freeze(database, r2, output):
    db = read_db(database)
    initialize_scope(db)
    ids = set()
    static = set()
    for (content,) in db.execute(
        "SELECT content FROM identityCatalogueRevision WHERE catalogueId IN selected_catalogue"
    ):
        ids.update(LOGO.findall(content))
        static.update(re.findall(r'"/(brands/[^"]+)"', content))
    maps = map_versions(db)
    expected = {f"premises-maps/{m}/releases/{h}.json" for m, h in maps}
    for (logo,) in db.execute(
        "SELECT logo FROM operator WHERE id IN selected_operators"
    ):
        if logo and logo.startswith("/"):
            static.add(logo.lstrip("/"))
    metadata = {}
    objects = {}
    for index in sorted((r2 / "miniflare-R2BucketObject").glob("*.sqlite")):
        bucket = read_db(index)
        if not bucket.execute(
            "SELECT 1 FROM sqlite_schema WHERE name='_mf_objects'"
        ).fetchone():
            continue
        for row in bucket.execute(
            "SELECT key,blob_id,etag,size,http_metadata FROM _mf_objects WHERE key GLOB 'identity-catalogue/*' OR key GLOB 'premises-maps/*'"
        ):
            key = row["key"]
            logo = re.fullmatch(r"identity-catalogue/([0-9a-f-]{36})\.(svg|png)", key)
            if logo and logo[1] not in ids:
                continue
            blob = row["blob_id"]
            if not blob or not re.fullmatch("[0-9a-f]+", blob):
                continue  # A required, unsupported object fails the coverage check below.
            bucket_name = "hype-assets-dev" if logo else "hype-assets-raw-dev"
            path = r2 / bucket_name / "blobs" / blob
            if not path.exists():
                continue  # Another local bucket can contain a copy of the same key.
            if key in objects and objects[key][0] != path:
                raise ValueError(f"Ambiguous local object {key}")
            objects[key] = (path, dict(row))
            if logo:
                expected.add(key)
        bucket.close()
    pending = list(expected)
    while pending:
        key = pending.pop()
        if key in metadata or key not in objects:
            continue
        path, row = objects[key]
        logo = key.startswith("identity-catalogue/")
        data = path.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        if len(data) != row["size"] or hashlib.md5(data).hexdigest() != row["etag"]:
            raise ValueError(f"Invalid retained bytes {key}")
        if not logo and Path(key).stem != digest:
            raise ValueError(f"Invalid release hash {key}")
        bucket_name = "hype-assets-prod" if logo else "hype-assets-raw-prod"
        dest = output / "objects" / bucket_name / key
        dest.parent.mkdir(exist_ok=True, parents=True)
        if dest.exists() and hashlib.sha256(dest.read_bytes()).hexdigest() != digest:
            raise ValueError(f"Different retained bytes at {dest}")
        if not dest.exists():
            dest.write_bytes(data)
        metadata[key] = dict(
            bucket=bucket_name,
            key=key,
            bytes=len(data),
            sha256=digest,
            httpMetadata=json.loads(row["http_metadata"]),
        )
        if not logo:
            parent = json.loads(data)["data"].get("sourceSnapshotHash")
            if parent and not MAP_HASH.fullmatch(parent):
                raise ValueError(f"Invalid parent snapshot hash in {key}")
            if parent:
                dependency = str(Path(key).with_name(parent + ".json"))
                if dependency not in expected:
                    expected.add(dependency)
                    pending.append(dependency)
    missing = expected - metadata.keys()
    for identity in ids:
        if not any(
            f"identity-catalogue/{identity}.{ext}" in metadata for ext in ["png", "svg"]
        ):
            missing.add("identity-catalogue/" + identity)
    if missing:
        raise ValueError(f"Missing {len(missing)} objects: {sorted(missing)[:20]}")
    static_hashes = {
        key: hashlib.sha256((Path("static") / key).read_bytes()).hexdigest()
        for key in sorted(static)
    }
    manifest = dict(
        objects=[metadata[k] for k in sorted(metadata)], static=static_hashes
    )
    (output / "media.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(
        "Frozen",
        len(ids),
        "logo IDs and",
        sum(k.startswith("premises-maps/") for k in expected),
        "station map releases;",
        len(static),
        "static assets",
    )


if __name__ == "__main__":
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--r2", type=Path, default=Path(".wrangler/state/v3/r2"))
    args = parser.parse_args()
    freeze(args.database, args.r2, args.output)
