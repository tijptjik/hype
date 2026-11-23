// @vitest-environment node
// NODE
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
// TESTS
import { describe, expect, it } from 'vitest'

/** Create an enrolled Feature with the lifecycle guard and a computed title. @returns Isolated database. */
function fixture(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE feature(id TEXT PRIMARY KEY,currentRevisionId TEXT);
    CREATE TABLE featureRevisionWriteScope(featureId TEXT,token TEXT);
    CREATE TABLE featureI18n(featureId TEXT,locale TEXT,baseName TEXT,nameOverride TEXT,
      title TEXT,titleGen INTEGER,description TEXT,descriptionGen INTEGER,
      displayAddress TEXT,displayAddressGen INTEGER,addressProperties TEXT,
      isAutomaticOnly INTEGER,autoTranslated TEXT,translationProvenance TEXT);
    CREATE VIEW featureComputedName AS SELECT featureId,locale,baseName AS title FROM featureI18n;
    CREATE TRIGGER feature_revision_guard_featureI18n_update BEFORE UPDATE ON featureI18n
      BEGIN SELECT RAISE(ABORT,'old guard'); END;
    INSERT INTO feature VALUES('f','revision-1');
    INSERT INTO featureI18n(featureId,locale,baseName,title) VALUES('f','en','Bakery','Old title');
  `)
  db.exec(
    readFileSync(
      'migrations/pending/feature-lifecycle/derived-title-guard.sql',
      'utf8',
    ),
  )
  return db
}

describe('Location identity derived title refresh', () => {
  it('allows only the computed title without an authored revision scope', () => {
    const db = fixture()
    try {
      db.exec("UPDATE featureI18n SET title='Bakery'")
      expect(db.prepare('SELECT title FROM featureI18n').get()?.title).toBe('Bakery')
      expect(() => db.exec("UPDATE featureI18n SET title='Unreviewed title'")).toThrow(
        'attributed revision',
      )
      expect(
        db.prepare('SELECT currentRevisionId FROM feature').get()?.currentRevisionId,
      ).toBe('revision-1')
    } finally {
      db.close()
    }
  })

  it.each([
    'baseName',
    'nameOverride',
    'description',
    'displayAddress',
    'autoTranslated',
    'translationProvenance',
  ])('retains attribution protection for %s alongside a computed title', column => {
    const db = fixture()
    try {
      expect(() =>
        db.exec(`UPDATE featureI18n SET title='Bakery',${column}='changed'`),
      ).toThrow('attributed revision')
      db.exec("INSERT INTO featureRevisionWriteScope VALUES('f','reviewed')")
      expect(() => db.exec(`UPDATE featureI18n SET ${column}='changed'`)).not.toThrow()
    } finally {
      db.close()
    }
  })
})
