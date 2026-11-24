"""Emit the retained recording's statements for the current Ghost Signs catalogue."""
import json
import sqlite3
from pathlib import Path

source = Path(__file__).with_name("migration.sql").read_text()
statements = []
pending = ""
mapped = 0
for line in source.splitlines(keepends=True):
    pending += line
    if not sqlite3.complete_statement(pending):
        continue
    statement = pending.strip()
    pending = ""
    if statement.startswith('INSERT INTO __revealing_arrow_guard VALUES (EXISTS(SELECT 1 FROM "propertyValue"'):
        statement = statement.replace("'vW0xY3zA6bC9'", "'5cfb6a877559'")
    if statement.startswith(('INSERT INTO "featureProperty"', 'INSERT INTO "featurePropertyI18n"')):
        if "'hJ4kL7mN9pQ2'" in statement:
            # Transfer the current assignment and its translations. Retained snapshots keep the old IDs.
            statement = statement.replace("'hJ4kL7mN9pQ2'", "'af38c4209f82'").replace(
                "'vW0xY3zA6bC9'", "'5cfb6a877559'"
            )
            mapped += 1
    statements.append(dict(sql=statement, params=[]))
if pending.strip() or mapped != 4:
    raise ValueError("Recording or classification scope changed")
print(json.dumps(statements))
