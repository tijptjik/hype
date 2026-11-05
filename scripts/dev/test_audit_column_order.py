#!/usr/bin/env python3
"""Exercise physical column ordering through real, transactional SQLite migrations."""
import json
import sqlite3
import subprocess
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NAME = '0169_audit_column_order.sql'
MIGRATION = (ROOT / 'migrations' / NAME).read_text()


def quote(name):
    """Quote a SQLite identifier used by the disposable fixture."""
    return '"' + name.replace('"', '""') + '"'


def fixture():
    """Replay the independently versioned baseline and every predecessor migration."""
    with tempfile.TemporaryDirectory(prefix='hype-column-order-') as directory:
        root = Path(directory)
        (root / 'scripts').symlink_to(ROOT / 'scripts', target_is_directory=True)
        (root / 'migrations').mkdir()
        for path in sorted((ROOT / 'migrations').glob('*.sql')):
            if path.name < NAME:
                (root / 'migrations' / path.name).symlink_to(path)
        # Use the normal Bun bootstrap for historical migrations; exercise this migration
        # with sqlite3_exec rather than Bun's multi-statement prepared-statement behavior.
        script = f'''
          import {{ Database }} from 'bun:sqlite';
          import {{ bootstrapLocalDatabase }} from './scripts/breadline/lib/local-bootstrap';
          const root = {json.dumps(directory)};
          const db = new Database(root + '/fixture.sqlite');
          bootstrapLocalDatabase(db, root);
          db.close();
        '''
        subprocess.run(['bun', '-e', script], cwd=ROOT, check=True, capture_output=True)
        db = sqlite3.connect(':memory:')
        with closing(sqlite3.connect(root / 'fixture.sqlite')) as source:
            source.backup(db)
    db.execute('PRAGMA foreign_keys=ON')
    return db


def rows(db):
    """Capture all application/derived rows and rowids, excluding internal sequence rowids."""
    result = {}
    for table, ddl in db.execute("SELECT name,sql FROM sqlite_schema WHERE type='table' ORDER BY name"):
        columns = sorted(r[1] for r in db.execute(f'PRAGMA table_info({quote(table)})'))
        fields = ([] if table == 'sqlite_sequence' or 'WITHOUT ROWID' in ddl.upper() else ['rowid'])
        fields += [quote(c) for c in columns]
        fields = ','.join(fields)
        result[table] = db.execute(f'SELECT {fields} FROM {quote(table)} ORDER BY {fields}').fetchall()
    return result


def apply(db):
    """Use the transaction boundary supplied by the D1 migration runner and roll back failures."""
    try:
        db.executescript('BEGIN IMMEDIATE;\n' + MIGRATION + '\nCOMMIT;')
    except Exception:
        db.rollback()
        raise


class AuditColumnOrderMigration(unittest.TestCase):
    def test_preserves_rows_constraints_search_history_and_sequences(self):
        """Exercise cascade, SET NULL, immutable evidence, FTS rowids and physical ordering."""
        db = fixture()
        self.addCleanup(db.close)
        db.executescript("""
          CREATE UNIQUE INDEX IF NOT EXISTS user_email_unique ON user(email);
          CREATE UNIQUE INDEX IF NOT EXISTS hub_code_unique ON hub(code);
          CREATE UNIQUE INDEX IF NOT EXISTS hub_domain_unique ON hub(domain);
          INSERT INTO user(id,name,username,email,createdAt,updatedAt)
            VALUES('column-user','Column user','column-user','column@example.test',123,456);
          INSERT INTO userActivity VALUES('column-user',7,'retained-login');
          INSERT INTO account(id,userId,accountId,providerId,password,createdAt,updatedAt)
            VALUES('column-account','column-user','subject','credential','retained-hash',123,456);
          INSERT INTO session(id,userId,token,expiresAt,createdAt,updatedAt)
            VALUES('column-session','column-user','retained-token',999,123,456);
          INSERT INTO passkey(id,publicKey,userId,credentialID,counter,deviceType,backedUp,createdAt,aaguid)
            VALUES('column-passkey','public-key','column-user','credential-id',3,'singleDevice',0,123,'aaguid');
          INSERT INTO hub(id,code,domain) VALUES('column-hub','column-hub','column.example.test');
          INSERT INTO image(id,contributorId,publicId) VALUES('column-image','column-user','retained-image');
          INSERT INTO organisation(id,code,hubId,imageId,publisherId)
            VALUES('column-org','column-org','column-hub','column-image','column-user');
          INSERT INTO project(id,organisationId,code,publisherId)
            VALUES('column-project','column-org','column-project','column-user');
          INSERT INTO layer(id,organisationId,projectId,publisherId)
            VALUES('column-layer','column-org','column-project','column-user');
          INSERT INTO feature(id,organisationId,projectId,layerId,contributorId,geometry)
            VALUES('column-feature','column-org','column-project','column-layer','column-user','{"type":"Point","coordinates":[114,22]}');
          INSERT INTO featureI18n(featureId,locale,title) VALUES('column-feature','en','Retained search text');
          INSERT INTO userFeature(userId,featureId,isVisited) VALUES('column-user','column-feature',1);
          INSERT INTO location(id,ownerOrganisationId,state,kind)
            VALUES('column-location','column-org','manual','establishment');
          INSERT INTO featureLocationHistory(id,featureId,version,action,locationId,factsRevisionId,locationRevisionId,acceptedOverrides)
            VALUES(42,'column-feature','retained-version','baseline','column-location','facts','position','{}');
          UPDATE sqlite_sequence SET seq=1000 WHERE name='featureLocationHistory';
          INSERT INTO messagingAccount(id,organisationId,platform,bridgeAccountId,registeredBy,createdAt,updatedAt)
            VALUES('column-messaging','column-org','telegram','bridge-column','column-user',123,456);
          INSERT INTO messagingConversation(id,accountId,chatId,recipientUserId)
            VALUES('column-conversation','column-messaging','retained-chat','column-user');
          INSERT INTO userMessagingIdentity(userId,platform,nativeId,verifiedAt,verifiedBy,updatedAt)
            VALUES('column-user','telegram','native-column',123,'column-user',456);
        """)
        before = rows(db)
        secondary = db.execute("SELECT type,name,sql FROM sqlite_schema WHERE type IN ('trigger','index','view') ORDER BY type,name").fetchall()
        definitions = {
            name: sorted([r[1:] for r in db.execute(f'PRAGMA table_info({quote(name)})')])
            for (name,) in db.execute("SELECT name FROM sqlite_schema WHERE type='table'")
        }
        apply(db)
        self.assertEqual(rows(db), before)
        self.assertEqual(db.execute("SELECT type,name,sql FROM sqlite_schema WHERE type IN ('trigger','index','view') ORDER BY type,name").fetchall(), secondary)
        for table, columns in definitions.items():
            actual = db.execute(f'PRAGMA table_info({quote(table)})').fetchall()
            self.assertEqual(sorted([r[1:] for r in actual]), columns, table)
            names = [r[1] for r in actual]
            audit = [n for n in ['createdAt', 'updatedAt', 'modifiedAt'] if n in names]
            if audit:
                self.assertEqual(names[-len(audit):], audit, table)
        self.assertEqual([r[1] for r in db.execute('PRAGMA table_info(user)')], [
            'id', 'name', 'username', 'displayUsername', 'image', 'attribution',
            'email', 'emailVerified', 'telephone', 'preferredMessagingPlatform',
            'isAnonymous', 'isArchived', 'locale', 'preferences', 'experimental',
            'createdAt', 'updatedAt',
        ])
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
        self.assertEqual(db.execute('PRAGMA integrity_check').fetchall(), [('ok',)])
        self.assertEqual(db.execute('PRAGMA foreign_keys').fetchone(), (1,))
        self.assertTrue(db.execute("SELECT rowid FROM featureSearchFts WHERE featureSearchFts MATCH '726574'").fetchall())
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute('DELETE FROM featureLocationHistory WHERE id=42')
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO user(id,email,createdAt,updatedAt) VALUES('duplicate','column@example.test',1,1)")
        self.assertEqual(db.execute("SELECT seq FROM sqlite_sequence WHERE name='featureLocationHistory'").fetchone(), (1000,))

    def test_rejects_unknown_dependency_without_changes(self):
        """An unstaged future child must abort before a parent can cascade into it."""
        db = fixture()
        self.addCleanup(db.close)
        db.executescript('CREATE TABLE futureUserChild(userId TEXT REFERENCES user(id) ON DELETE CASCADE);')
        before = rows(db)
        schema = db.execute('SELECT type,name,sql FROM sqlite_schema ORDER BY type,name').fetchall()
        with self.assertRaises(sqlite3.IntegrityError):
            apply(db)
        self.assertEqual(rows(db), before)
        self.assertEqual(db.execute('SELECT type,name,sql FROM sqlite_schema ORDER BY type,name').fetchall(), schema)
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_rejects_default_drift_without_changing_user_behavior(self):
        """Column reordering must not silently replace an environment's existing default."""
        db = fixture()
        self.addCleanup(db.close)
        db.executescript("""
          ALTER TABLE user ADD COLUMN driftPreferences TEXT NOT NULL DEFAULT '{}';
          UPDATE user SET driftPreferences=preferences;
          ALTER TABLE user DROP COLUMN preferences;
          ALTER TABLE user RENAME COLUMN driftPreferences TO preferences;
        """)
        before = rows(db)
        schema = db.execute('SELECT type,name,sql FROM sqlite_schema ORDER BY type,name').fetchall()
        with self.assertRaises(sqlite3.IntegrityError):
            apply(db)
        self.assertEqual(rows(db), before)
        self.assertEqual(db.execute('SELECT type,name,sql FROM sqlite_schema ORDER BY type,name').fetchall(), schema)


if __name__ == '__main__':
    unittest.main()
