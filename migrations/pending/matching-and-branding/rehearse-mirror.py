"""Exercise the repository's production-to-local canonical restore on a rehearsed package."""

import argparse
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import donor_phones

from scope import read_db

spec = importlib.util.spec_from_file_location(
    "curation", Path(__file__).with_name("package.py")
)
curation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(curation)


def literal(value):
    if isinstance(value, bytes):
        return "X'" + value.hex() + "'"
    if isinstance(value, str):
        if "\0" in value:
            return "CAST(X'" + value.encode().hex() + "' AS TEXT)"
        return "'" + value.replace("'", "''") + "'"
    return "NULL" if value is None else repr(value)


def rehearse(package, source, output):
    output.mkdir(parents=True, exist_ok=False)
    db = read_db(source)
    schema = [
        dict(r)
        for r in db.execute("""SELECT type,name,sql FROM sqlite_schema
        WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY type,name""")
    ]
    (output / "schema.json").write_text(
        json.dumps([dict(success=True, results=schema)])
    )
    with (output / "canonical.sql").open("w") as export:
        for obj in schema:
            table = obj["name"]
            if obj["type"] != "table" or table.startswith("featureSearchFts"):
                continue
            export.write(obj["sql"] + ";\n")
            # Generated columns are reconstructed from the table definition.
            cols = [r["name"] for r in db.execute(f'PRAGMA table_info("{table}")')]
            names = ",".join('"' + c + '"' for c in cols)
            cursor = db.execute(f'SELECT {names} FROM "{table}"')
            while rows := cursor.fetchmany(250):
                values = ",".join(
                    "(" + ",".join(map(literal, row)) + ")" for row in rows
                )
                export.write(f'INSERT INTO "{table}"({names}) VALUES' + values + ";\n")
    subprocess.run(
        [
            "bun",
            "scripts/dev/restore-d1-export.ts",
            output / "canonical.sql",
            output / "schema.json",
            output / "restored.sqlite",
        ],
        check=True,
    )
    restored = read_db(output / "restored.sqlite")
    manifest = json.loads((package / "curation.json").read_text())
    changes, _ = curation.compare(package, manifest, restored)
    if changes:
        raise ValueError(f"{len(changes)} curation operations after mirror restore")
    for k, rows in curation.inventory(restored).items():
        if not {tuple(r) for r in manifest["expected"][k]}.issubset(set(rows)):
            raise ValueError(f"Lost {k} during mirror")
    receipt = dict(
        source=curation.sha(source),
        restored=curation.sha(output / "restored.sqlite"),
        replayOperations=0,
        integrity="ok",
        foreignKeys=0,
        donorPhones=donor_phones.verify(
            restored,
            donor_phones.read_overlay(
                package, donor_phones.independent_enrollment(restored)
            ),
        ),
    )
    (output / "verification.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt))


if __name__ == "__main__":
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ["package", "source", "output"]:
        parser.add_argument(arg, type=Path)
    args = parser.parse_args()
    rehearse(args.package, args.source, args.output)
