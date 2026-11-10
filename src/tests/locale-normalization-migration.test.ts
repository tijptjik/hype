// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
// TESTING
import { expect, it } from 'vitest'

const migration = readFileSync(
  'migrations/0229_normalize_admin_resource_locales.sql',
  'utf8',
)
const models = ['hub', 'organisation', 'project', 'layer'] as const

/** Build isolated enrolled resources with distinct translated values and immutable history.
 * @returns A disposable SQLite database matching the migration's resource contracts.
 */
function fixture(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec(
    `CREATE TABLE revisionChangeSet(id TEXT PRIMARY KEY,actorId TEXT,origin TEXT,reason TEXT,createdAt TEXT);`,
  )
  for (const model of models) {
    db.exec(`
      CREATE TABLE ${model}I18n(${model}Id TEXT,locale TEXT,name TEXT,PRIMARY KEY(${model}Id,locale));
      CREATE TABLE ${model}Revision(id TEXT PRIMARY KEY,${model}Id TEXT,previousRevisionId TEXT,changeSetId TEXT,content TEXT,schemaVersion INTEGER);
      CREATE TABLE ${model}RevisionHead(${model}Id TEXT PRIMARY KEY,currentRevisionId TEXT,generation INTEGER);
      CREATE TABLE ${model}RevisionWrite(${model}Id TEXT PRIMARY KEY,token TEXT,revisionId TEXT,baselineRevisionId TEXT);
      CREATE TRIGGER ${model}_immutable BEFORE UPDATE ON ${model}Revision BEGIN SELECT RAISE(ABORT,'immutable'); END;
      INSERT INTO ${model}I18n VALUES('a','zhHant','繁體'),('a','zhHans','简体'),('a','en','English');
      INSERT INTO ${model}RevisionHead VALUES('a','old',3);
    `)
    db.prepare(
      `INSERT INTO ${model}Revision VALUES('old','a',NULL,'original',?,1)`,
    ).run(
      JSON.stringify({
        record: { untouched: true },
        i18n: {
          zhHant: { name: '繁體' },
          zhHans: { name: '简体' },
          en: { name: 'English' },
        },
      }),
    )
  }
  return db
}

/** Match D1's atomic migration application, including rollback on any guard failure.
 * @param db Isolated test database. @returns Nothing after the migration commits.
 */
function apply(db: DatabaseSync): void {
  try {
    db.exec(`BEGIN;${migration}COMMIT;`)
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

it('normalizes live rows and current heads without rewriting history; replay is inert', () => {
  const db = fixture()
  try {
    const before = db.prepare('SELECT content FROM hubRevision').get()
    apply(db)
    for (const model of models) {
      expect(
        db.prepare(`SELECT locale FROM ${model}I18n ORDER BY locale`).all(),
      ).toEqual([{ locale: 'en' }, { locale: 'zh-hans' }, { locale: 'zh-hant' }])
      const head = db
        .prepare(
          `SELECT r.content,h.generation,r.previousRevisionId FROM ${model}RevisionHead h JOIN ${model}Revision r ON r.id=h.currentRevisionId`,
        )
        .get()
      if (!head) throw new Error(`Missing ${model} revision head`)
      expect(JSON.parse(head.content as string)).toEqual({
        record: { untouched: true },
        i18n: {
          'zh-hant': { name: '繁體' },
          'zh-hans': { name: '简体' },
          en: { name: 'English' },
        },
      })
      expect(head.generation).toBe(4)
      expect(head.previousRevisionId).toBe('old')
      expect(
        db.prepare(`SELECT count(*) AS n FROM ${model}RevisionWrite`).get(),
      ).toEqual({ n: 0 })
      expect(() =>
        db.exec(`INSERT INTO ${model}I18n VALUES('b','zhHant','bad')`),
      ).toThrow('normalize form locale')
      expect(() =>
        db.exec(`UPDATE ${model}I18n SET locale='zhHans' WHERE locale='en'`),
      ).toThrow('normalize form locale')
    }
    expect(db.prepare("SELECT content FROM hubRevision WHERE id='old'").get()).toEqual(
      before,
    )
    apply(db)
    expect(db.prepare('SELECT count(*) AS n FROM hubRevision').get()).toEqual({ n: 2 })
    expect(db.prepare('SELECT count(*) AS n FROM revisionChangeSet').get()).toEqual({
      n: 1,
    })
  } finally {
    db.close()
  }
})

it.each(['projection', 'snapshot'])(
  'aborts the entire migration on a %s alias collision',
  location => {
    const db = fixture()
    try {
      if (location === 'projection')
        db.exec("INSERT INTO layerI18n VALUES('a','zh-hant','different')")
      else {
        db.exec('DROP TRIGGER layer_immutable')
        db.exec(
          `UPDATE layerRevision SET content=json_set(content,'$.i18n."zh-hant"',json_object('name','different'))`,
        )
      }
      expect(() => apply(db)).toThrow('CHECK constraint failed')
      expect(
        db.prepare("SELECT name FROM hubI18n WHERE locale='zhHant'").get(),
      ).toEqual({ name: '繁體' })
      expect(db.prepare('SELECT count(*) AS n FROM hubRevisionWrite').get()).toEqual({
        n: 0,
      })
      expect(db.prepare('SELECT count(*) AS n FROM revisionChangeSet').get()).toEqual({
        n: 0,
      })
    } finally {
      db.close()
    }
  },
)
