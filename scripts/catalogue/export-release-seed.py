#!/usr/bin/env python3
"""Export active catalogue heads to a reviewable, insert-only D1 data migration.

Archived identities and memberships pointing to them are excluded. No source database
writes occur. Apply the generated SQL through the transactional D1 migration runner.
"""
import argparse
import json
import sqlite3
from pathlib import Path


def literal(value):
    """Quote a trusted snapshot value as a SQLite string literal."""
    return "'" + str(value).replace("'", "''") + "'"


def export(database, output):
    """Read a consistent snapshot and emit a rerunnable, conflict-guarded seed."""
    with sqlite3.connect(f'file:{database.resolve()}?mode=ro', uri=True) as db:
        db.execute('BEGIN')
        rows = db.execute('''SELECT c.id,c.kind,c.version,r.content
          FROM identityCatalogue c JOIN identityCatalogueRevisionContent r
          ON r.catalogueId=c.id AND r.version=c.version ORDER BY c.kind,c.id''').fetchall()
        sources = db.execute('SELECT source,sourceId,catalogueId FROM identityCatalogueSource ORDER BY source,sourceId').fetchall()
    active = {row[0] for row in rows if not json.loads(row[3]).get('isArchived', False)}
    archived = {row[0] for row in rows} - active
    values = []
    omitted = []
    for identity, kind, version, raw in rows:
        if identity not in active:
            continue
        content = json.loads(raw)
        parent = content.get('groupId')
        if parent in archived:
            omitted.append(identity)
            content.pop('groupId')
        elif parent and parent not in active:
            raise ValueError(f'Missing parent for {identity}: {parent}')
        content.pop('isArchived', None)
        values.append(f"({literal(identity)},{literal(kind)},{version},{literal(json.dumps(content, ensure_ascii=False, separators=(',', ':')))})")
    if not values:
        raise ValueError('No active catalogue records')
    source_values = [f'({literal(source)},{literal(source_id)},{literal(identity)})'
                     for source, source_id, identity in sources if identity in active]
    sql = '''-- Refs #194. Active catalogue release snapshot; apply after 0245 via D1 migrations.
-- Archived identities are excluded. Existing identities/revisions are never overwritten.
-- All heads precede revisions so group membership triggers can resolve every parent.
-- Generated with scripts/catalogue/export-release-seed.py; review before release.
CREATE TABLE __catalogue_release_seed(id TEXT PRIMARY KEY,kind TEXT,version INTEGER,content TEXT);
INSERT INTO __catalogue_release_seed VALUES
''' + ',\n'.join(values) + ';\n'
    sql += '''CREATE TABLE __catalogue_release_sources(source TEXT,sourceId TEXT,catalogueId TEXT);
'''
    if source_values:
        sql += 'INSERT INTO __catalogue_release_sources VALUES\n' + ',\n'.join(source_values) + ';\n'
    sql += '''-- Snapshot the missing set before inserting anything; replay leaves existing heads untouched.
CREATE TABLE __catalogue_release_new AS SELECT s.* FROM __catalogue_release_seed s
WHERE NOT EXISTS(SELECT 1 FROM identityCatalogue c WHERE c.id=s.id);

-- Abort on identity/code/source conflicts instead of merging distinct identities.
CREATE TABLE __catalogue_release_guard(ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO __catalogue_release_guard SELECT
 NOT EXISTS(SELECT 1 FROM __catalogue_release_seed s JOIN identityCatalogue c ON c.id=s.id WHERE c.kind<>s.kind)
 AND NOT EXISTS(SELECT 1 FROM __catalogue_release_new s JOIN identityCatalogue c ON c.kind=s.kind
   JOIN identityCatalogueRevisionContent r ON r.catalogueId=c.id AND r.version=c.version
   WHERE json_extract(s.content,'$.code')=json_extract(r.content,'$.code'))
 AND NOT EXISTS(SELECT 1 FROM __catalogue_release_sources s JOIN __catalogue_release_new n ON n.id=s.catalogueId
   JOIN identityCatalogueSource p ON p.source=s.source AND p.sourceId=s.sourceId WHERE p.catalogueId<>s.catalogueId);

INSERT INTO identityCatalogue(id,kind,version) SELECT id,kind,version FROM __catalogue_release_new;
-- Write through the authoritative revision view to retain normalized translations and triggers.
INSERT INTO identityCatalogueRevisionContent(catalogueId,version,content,actorId,createdAt)
SELECT id,version,content,'system:migration:0247',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM __catalogue_release_new;
INSERT INTO identityCatalogueSource(source,sourceId,catalogueId)
SELECT s.source,s.sourceId,s.catalogueId FROM __catalogue_release_sources s
JOIN __catalogue_release_new n ON n.id=s.catalogueId;

DROP TABLE __catalogue_release_guard;
DROP TABLE __catalogue_release_new;
DROP TABLE __catalogue_release_sources;
DROP TABLE __catalogue_release_seed;
'''
    output.write_text(sql)
    print(f'Exported {len(active)} active records; excluded {len(archived)} archived records.')
    print('Omitted archived-parent links from: ' + ', '.join(omitted))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    export(args.database, args.output)
