// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
// VITEST
import { afterEach, describe, expect, it } from 'vitest'

const stores: DatabaseSync[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})

/**
 * Applies the query migrations to a minimal schema with production foreign keys.
 * @param beforeMigration Source records to backfill, including permitted legacy orphans.
 * @param legacySearch Whether to simulate the previously applied relational gram index.
 * @returns Isolated SQLite database with both query migrations applied.
 */
function setup(beforeMigration = '', legacySearch = false): DatabaseSync {
  const sqlite = new DatabaseSync(':memory:')
  stores.push(sqlite)
  sqlite.exec(`PRAGMA foreign_keys = OFF;
    CREATE TABLE feature(id TEXT PRIMARY KEY, isDraft INTEGER, isPublished INTEGER, isArchived INTEGER, layerId TEXT, organisationId TEXT, projectId TEXT, isVisitable INTEGER, isIntangible INTEGER);
    CREATE TABLE featureI18n(featureId TEXT REFERENCES feature(id) ON DELETE CASCADE ON UPDATE CASCADE, locale TEXT, title TEXT, description TEXT, displayAddress TEXT, addressProperties TEXT, PRIMARY KEY(featureId,locale));
    CREATE TABLE featureProperty(featureId TEXT, propertyId TEXT, propertyValueId TEXT, value TEXT);
    CREATE TABLE userFeature(userId TEXT, featureId TEXT, isWishlisted INTEGER, isVisited INTEGER);
    ${beforeMigration}
    PRAGMA foreign_keys = ON;`)
  sqlite.exec(readFileSync('migrations/0079_feature_query_indexes.sql', 'utf8'))
  if (legacySearch) {
    sqlite.exec(`CREATE TABLE featureSearchGram(gram TEXT, featureId TEXT, locale TEXT, PRIMARY KEY(gram,featureId,locale)) WITHOUT ROWID;
      INSERT INTO featureSearchGram VALUES('old', 'existing', 'en');
      CREATE TRIGGER feature_search_i18n_insert AFTER INSERT ON featureI18n BEGIN
        INSERT OR IGNORE INTO featureSearchGram VALUES('old', NEW.featureId, NEW.locale);
      END;
      CREATE TRIGGER feature_search_i18n_update AFTER UPDATE ON featureI18n BEGIN
        DELETE FROM featureSearchGram WHERE featureId = OLD.featureId;
      END;
      CREATE TRIGGER feature_search_i18n_delete AFTER DELETE ON featureI18n BEGIN
        DELETE FROM featureSearchGram WHERE featureId = OLD.featureId;
      END;`)
  }
  // Backfill must populate derived data without touching any source translations.
  sqlite.exec(`CREATE TRIGGER reject_backfill_source_write BEFORE UPDATE ON featureI18n BEGIN
    SELECT RAISE(ABORT, 'backfill must not update source translations');
  END;`)
  sqlite.exec(readFileSync('migrations/0081_feature_search_fts.sql', 'utf8'))
  sqlite.exec('DROP TRIGGER reject_backfill_source_write')
  return sqlite
}

/**
 * Looks up one literal gram through the actual FTS virtual index.
 * @param sqlite Migrated fixture database.
 * @param gram Literal one-, two- or three-codepoint substring.
 * @returns Ordered document identities matched by its encoded token.
 */
function matches(sqlite: DatabaseSync, gram: string): Array<Record<string, unknown>> {
  const token = Buffer.from(gram.replace(/[A-Z]/g, value => value.toLowerCase()))
    .toString('hex')
    .toUpperCase()
  return sqlite
    .prepare(`SELECT document.featureId, document.locale
      FROM featureSearchFts
      JOIN featureSearchDocument AS document ON document.id = featureSearchFts.rowid
      WHERE featureSearchFts MATCH ? ORDER BY document.featureId, document.locale`)
    .all(token)
}

/**
 * Captures the FTS storage rows so metadata-only writes cannot silently reindex text.
 * @param sqlite Migrated fixture database.
 * @returns FTS segment and document metadata snapshots.
 */
function ftsStorage(sqlite: DatabaseSync): Array<Array<Record<string, unknown>>> {
  return [
    sqlite.prepare('SELECT * FROM featureSearchFts_data ORDER BY id').all(),
    sqlite.prepare('SELECT * FROM featureSearchFts_docsize ORDER BY id').all(),
  ]
}

describe('feature search FTS migration', () => {
  it('upgrades legacy grams and backfills valid translations without source updates', () => {
    const sqlite = setup(
      `INSERT INTO feature(id) VALUES('existing');
       INSERT INTO featureI18n VALUES('existing','en','Existing 茶餐廳',NULL,NULL,'{"neighbourhood":"Central"}');
       INSERT INTO featureI18n VALUES('existing','zh-hant','舊茶館',NULL,NULL,'{}');
       INSERT INTO featureI18n VALUES('orphan','en','Orphan title',NULL,NULL,'{}');`,
      true,
    )
    expect(matches(sqlite, '茶')).toEqual([
      { featureId: 'existing', locale: 'en' },
      { featureId: 'existing', locale: 'zh-hant' },
    ])
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM featureSearchDocument').get()
        ?.count,
    ).toBe(2)
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM featureSearchFts').get()?.count,
    ).toBe(2)
    expect(
      sqlite
        .prepare("SELECT count(*) AS count FROM featureI18n WHERE featureId = 'orphan'")
        .get()?.count,
    ).toBe(1)
    expect(
      sqlite
        .prepare(
          "SELECT count(*) AS count FROM featureSearchDocument WHERE featureId = 'orphan'",
        )
        .get()?.count,
    ).toBe(0)
    expect(
      sqlite
        .prepare("SELECT name FROM sqlite_schema WHERE name = 'featureSearchGram'")
        .get(),
    ).toBeUndefined()
    expect(sqlite.prepare('SELECT * FROM featureNeighbourhood').all()).toEqual([
      { featureId: 'existing', neighbourhood: 'Central' },
    ])
    sqlite.exec(
      "INSERT INTO feature(id) VALUES('new'); INSERT INTO featureI18n VALUES('new','en','New title',NULL,NULL,'{}')",
    )
    expect(matches(sqlite, 'New')).toEqual([{ featureId: 'new', locale: 'en' }])
  })

  it('stores one searchable FTS document per translation regardless of text length', () => {
    const sqlite = setup()
    sqlite.exec("INSERT INTO feature(id) VALUES('long')")
    const title = Array.from({ length: 200 }, (_, index) => `茶餐廳 ${index} 🍵`).join(
      ' ',
    )
    sqlite
      .prepare('INSERT INTO featureI18n VALUES(?,?,?,?,?,?)')
      .run('long', 'en', title, null, null, '{}')
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM featureSearchDocument').get()
        ?.count,
    ).toBe(1)
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM featureSearchFts').get()?.count,
    ).toBe(1)
    for (const gram of ['茶', '茶餐', '茶餐廳', '🍵', '199']) {
      expect(matches(sqlite, gram)).toEqual([{ featureId: 'long', locale: 'en' }])
    }
  })

  it('updates searchable fields and removes documents atomically with translation changes', () => {
    const sqlite = setup()
    sqlite.exec(`INSERT INTO feature(id) VALUES('source');
      INSERT INTO featureI18n VALUES('source','en','Old tea',NULL,NULL,'{}');
      UPDATE featureI18n SET title = 'New cafe', description = '夜宵', displayAddress = 'Queen Road' WHERE featureId = 'source';`)
    expect(matches(sqlite, 'Old')).toEqual([])
    for (const gram of ['New', '夜宵', 'Que']) {
      expect(matches(sqlite, gram)).toEqual([{ featureId: 'source', locale: 'en' }])
    }
    sqlite.exec('UPDATE featureI18n SET description = NULL, displayAddress = NULL')
    expect(matches(sqlite, '夜宵')).toEqual([])
    expect(matches(sqlite, 'Que')).toEqual([])
    sqlite.exec("BEGIN; UPDATE featureI18n SET title = 'Rolled back'; ROLLBACK;")
    expect(matches(sqlite, 'New')).toEqual([{ featureId: 'source', locale: 'en' }])
    expect(matches(sqlite, 'Rol')).toEqual([])
    sqlite.exec("DELETE FROM featureI18n WHERE featureId = 'source'")
    expect(matches(sqlite, 'New')).toEqual([])
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM featureSearchFts').get()?.count,
    ).toBe(0)
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM featureSearchDocument').get()
        ?.count,
    ).toBe(0)
  })

  it('skips reindexing no-op text writes and neighbourhood or unrelated address edits', () => {
    const sqlite = setup()
    sqlite.exec(`INSERT INTO feature(id) VALUES('source');
      INSERT INTO featureI18n VALUES('source','en','茶餐廳',NULL,NULL,'{"neighbourhood":"Central"}');`)
    const original = ftsStorage(sqlite)
    const before = Number(
      sqlite.prepare('SELECT total_changes() AS count').get()?.count,
    )
    sqlite.exec(
      'UPDATE featureI18n SET title = title, description = description, displayAddress = displayAddress, addressProperties = addressProperties',
    )
    const after = Number(sqlite.prepare('SELECT total_changes() AS count').get()?.count)
    expect(after - before).toBe(1)
    expect(ftsStorage(sqlite)).toEqual(original)
    sqlite.exec(
      `UPDATE featureI18n SET addressProperties = '{"neighbourhood":"Central","street":"New road"}'`,
    )
    expect(ftsStorage(sqlite)).toEqual(original)
    sqlite.exec(
      `UPDATE featureI18n SET addressProperties = '{"neighbourhood":"Wan Chai"}'`,
    )
    expect(ftsStorage(sqlite)).toEqual(original)
    expect(
      sqlite.prepare('SELECT neighbourhood FROM featureNeighbourhood').get()
        ?.neighbourhood,
    ).toBe('Wan Chai')
    sqlite.exec(`UPDATE featureI18n SET addressProperties = '{}'`)
    expect(ftsStorage(sqlite)).toEqual(original)
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM featureNeighbourhood').get()?.count,
    ).toBe(0)
  })

  it('preserves stable document IDs through feature and locale cascades and VACUUM', () => {
    const sqlite = setup()
    sqlite.exec(`INSERT INTO feature(id) VALUES('source');
      INSERT INTO featureI18n VALUES('source','en','Original tea',NULL,NULL,'{"neighbourhood":"Central"}');`)
    const id = sqlite.prepare('SELECT id FROM featureSearchDocument').get()?.id
    const original = ftsStorage(sqlite)
    sqlite.exec("UPDATE feature SET id = 'renamed' WHERE id = 'source'")
    expect(matches(sqlite, 'tea')).toEqual([{ featureId: 'renamed', locale: 'en' }])
    expect(ftsStorage(sqlite)).toEqual(original)
    expect(
      sqlite.prepare('SELECT featureId FROM featureNeighbourhood').get()?.featureId,
    ).toBe('renamed')
    sqlite.exec("UPDATE featureI18n SET locale = 'zh-hant' WHERE featureId = 'renamed'")
    expect(matches(sqlite, 'tea')).toEqual([
      { featureId: 'renamed', locale: 'zh-hant' },
    ])
    expect(ftsStorage(sqlite)).toEqual(original)
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM featureNeighbourhood').get()?.count,
    ).toBe(0)
    sqlite.exec('VACUUM')
    expect(sqlite.prepare('SELECT id FROM featureSearchDocument').get()?.id).toBe(id)
    expect(matches(sqlite, 'tea')).toEqual([
      { featureId: 'renamed', locale: 'zh-hant' },
    ])
    sqlite.exec(
      "UPDATE featureI18n SET locale = 'en', title = 'Changed' WHERE featureId = 'renamed'",
    )
    expect(sqlite.prepare('SELECT id FROM featureSearchDocument').get()?.id).toBe(id)
    expect(matches(sqlite, 'tea')).toEqual([])
    expect(matches(sqlite, 'Cha')).toEqual([{ featureId: 'renamed', locale: 'en' }])
    sqlite.exec("DELETE FROM feature WHERE id = 'renamed'")
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM featureSearchFts').get()?.count,
    ).toBe(0)
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM featureSearchDocument').get()
        ?.count,
    ).toBe(0)
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('replaces source translations without retaining the old indexed text', () => {
    const sqlite = setup()
    sqlite.exec(`INSERT INTO feature(id) VALUES('source');
      INSERT INTO featureI18n VALUES('source','en','Original tea',NULL,NULL,'{}');
      INSERT OR REPLACE INTO featureI18n VALUES('source','en','Replacement cafe',NULL,NULL,'{}');`)
    expect(matches(sqlite, 'tea')).toEqual([])
    expect(matches(sqlite, 'caf')).toEqual([{ featureId: 'source', locale: 'en' }])
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM featureSearchDocument').get()
        ?.count,
    ).toBe(1)
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM featureSearchFts').get()?.count,
    ).toBe(1)
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
})
