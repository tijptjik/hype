import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { normalizeGranularity, repairGranularities } from './repair'
import { repairRows, type Query, type Row } from './database'

function fixture() {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE placeRevision(id TEXT PRIMARY KEY, payload TEXT, facts TEXT, contentHash TEXT, createdAt TEXT);
    CREATE TRIGGER immutable_revision BEFORE UPDATE ON placeRevision BEGIN SELECT RAISE(ABORT,'immutable'); END;
    CREATE TABLE featurePlaceHistory(id TEXT PRIMARY KEY, overrides TEXT);
    CREATE TRIGGER immutable_history BEFORE UPDATE ON featurePlaceHistory BEGIN SELECT RAISE(ABORT,'immutable'); END;
    CREATE TABLE placeIdentityReview(id TEXT PRIMARY KEY, baseline TEXT);`)
  const payload = { kind: 'local-address-edit' }
  const facts = {
    location: {
      address: {
        authored: {
          granularity: 'room_part',
          i18n: { en: { formattedAddress: 'room_part is literal text' } },
        },
      },
    },
  }
  const hash = createHash('sha256')
    .update(JSON.stringify({ facts, payload }))
    .digest('hex')
  db.query('INSERT INTO placeRevision VALUES(?,?,?,?,?)').run(
    'r',
    JSON.stringify(payload),
    JSON.stringify(facts),
    hash,
    'original',
  )
  db.query('INSERT INTO featurePlaceHistory VALUES(?,?)').run(
    'h',
    JSON.stringify({
      location: { value: { address: { authored: { granularity: 'room' } } } },
    }),
  )
  db.query('INSERT INTO placeIdentityReview VALUES(?,?)').run(
    'i',
    JSON.stringify({ contentHash: hash }),
  )
  const query: Query = async statements =>
    db.transaction(() =>
      statements.map(s => db.query<Row, never[]>(s.sql).all(...((s.params ?? []) as never[]))),
    )()
  return { db, query, hash }
}

describe('granularity data repair', () => {
  test('only scope values change; room type and display text remain intact', () => {
    expect(
      normalizeGranularity({
        granularity: 'room',
        unitType: 'R',
        text: 'room',
        child: { granularity: 'room_part' },
      }),
    ).toEqual({
      granularity: 'unit',
      unitType: 'R',
      text: 'room',
      child: { granularity: 'unit_portion' },
    })
  })
  test('repairs immutable history, hashes and references atomically and replays unchanged', async () => {
    const { db, query, hash } = fixture()
    expect(await repairGranularities(query, false)).toEqual({
      placeRevision: 1,
      featurePlaceHistory: 1,
      placeIdentityReview: 1,
    })
    expect(
      (db.query('SELECT contentHash FROM placeRevision').get() as any).contentHash,
    ).toBe(hash)
    await repairGranularities(query, true)
    expect(await repairGranularities(query, false)).toEqual({})
    const row = db.query('SELECT * FROM placeRevision').get() as any
    expect(row.createdAt).toBe('original')
    expect(JSON.parse(row.facts).location.address.authored.granularity).toBe(
      'unit_portion',
    )
    expect(
      JSON.parse(row.facts).location.address.authored.i18n.en.formattedAddress,
    ).toBe('room_part is literal text')
    expect(
      JSON.parse(
        (db.query('SELECT baseline FROM placeIdentityReview').get() as any).baseline,
      ).contentHash,
    ).toBe(row.contentHash)
    expect(() => db.exec("UPDATE placeRevision SET createdAt='bad'")).toThrow(
      'immutable',
    )
    db.close()
  })
  test('late constraint failure restores earlier writes and triggers', async () => {
    const { db, query } = fixture()
    const row = db.query('SELECT * FROM placeRevision').get() as any
    db.exec(
      'CREATE TABLE constrained(id INTEGER PRIMARY KEY,n INTEGER CHECK(n>0)); INSERT INTO constrained VALUES(1,1)',
    )
    await expect(
      repairRows(query, [
        { table: 'placeRevision', row, changes: { createdAt: 'changed' } },
        { table: 'constrained', row: { id: 1, n: 1 }, changes: { n: -1 } },
      ]),
    ).rejects.toThrow()
    expect(
      (db.query('SELECT createdAt FROM placeRevision').get() as any).createdAt,
    ).toBe('original')
    expect(() => db.exec("UPDATE placeRevision SET createdAt='bad'")).toThrow(
      'immutable',
    )
    db.close()
  })
  test('stale input rolls back and keeps immutable guards', async () => {
    const { db, query } = fixture()
    const row = db.query('SELECT * FROM placeRevision').get() as any
    await expect(
      repairRows(query, [
        {
          table: 'placeRevision',
          row: { ...row, createdAt: 'stale' },
          changes: { createdAt: 'bad' },
        },
      ]),
    ).rejects.toThrow()
    expect(
      db
        .query("SELECT name FROM sqlite_schema WHERE name='_address_granularity_guard'")
        .get(),
    ).toBeNull()
    expect(() => db.exec("UPDATE placeRevision SET createdAt='bad'")).toThrow(
      'immutable',
    )
    db.close()
  })
})
