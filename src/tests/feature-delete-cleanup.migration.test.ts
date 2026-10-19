// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
// VITEST
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'migrations/0101_feature_translation_delete_cleanup.sql',
  'utf8',
)

describe('feature translation deletion cleanup', () => {
  for (const foreignKey of [false, true]) {
    it(`cleans hard deletes atomically while retaining archived features (foreign key: ${foreignKey})`, () => {
      const db = new DatabaseSync(':memory:')
      try {
        db.exec(`
          PRAGMA foreign_keys=OFF;
          CREATE TABLE feature(id TEXT PRIMARY KEY, isArchived INTEGER DEFAULT 0);
          CREATE TABLE featureI18n(featureId TEXT ${foreignKey ? 'REFERENCES feature(id) ON DELETE CASCADE' : ''}, locale TEXT, title TEXT, PRIMARY KEY(featureId,locale));
          CREATE TABLE searchDocument(featureId TEXT, locale TEXT,
            FOREIGN KEY(featureId,locale) REFERENCES featureI18n(featureId,locale) ON DELETE CASCADE);
          INSERT INTO feature VALUES ('keep',0), ('delete',0), ('ALusUDEafJEM',0);
          INSERT INTO featureI18n VALUES ('keep','en','Keep'), ('delete','en','Delete'),
            ('ALusUDEafJEM','en','Restored parent'), ('-sBxRrdSnyU4','en','Reviewed orphan'),
            ('unreviewed','en','Unreviewed orphan');
          INSERT INTO searchDocument VALUES ('delete','en'), ('-sBxRrdSnyU4','en');
          PRAGMA foreign_keys=ON;
        `)
        db.exec(migration)
        expect(
          db.prepare('SELECT featureId FROM featureI18n ORDER BY featureId').all(),
        ).toEqual([
          { featureId: 'ALusUDEafJEM' },
          { featureId: 'delete' },
          { featureId: 'keep' },
          { featureId: 'unreviewed' },
        ])
        db.exec("UPDATE feature SET isArchived=1 WHERE id='keep'")
        expect(
          db.prepare("SELECT title FROM featureI18n WHERE featureId='keep'").get(),
        ).toEqual({ title: 'Keep' })
        db.exec("BEGIN; DELETE FROM feature WHERE id='delete'; ROLLBACK;")
        expect(
          db.prepare("SELECT title FROM featureI18n WHERE featureId='delete'").get(),
        ).toEqual({ title: 'Delete' })
        db.exec("DELETE FROM feature WHERE id='delete'")
        expect(
          db.prepare("SELECT * FROM featureI18n WHERE featureId='delete'").all(),
        ).toEqual([])
        expect(db.prepare('SELECT * FROM searchDocument').all()).toEqual([])
      } finally {
        db.close()
      }
    })
  }
})
