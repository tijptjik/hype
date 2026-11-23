// BUN
import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, it } from 'bun:test'
// BREADLINE
import { installRunAttributionViews, readImportRuns } from './lib/run-attribution'
import { readUserSyncSource } from './lib/user-sync'

const databases: Database[] = []

/**
 * Create a minimal complete source export with assigned and unassigned collections.
 * @returns Disposable mirror with synthetic history and the pinned destination IDs.
 */
function fixture(): Database {
  const db = new Database(':memory:')
  databases.push(db)
  db.exec(`CREATE TABLE breadline__public__users(id INTEGER, volunteer_id INTEGER);
    INSERT INTO breadline__public__users VALUES(6279,6323),(2,20);
    CREATE TABLE breadline__public__volunteers(id INTEGER);
    INSERT INTO breadline__public__volunteers VALUES(6323),(20);
    CREATE TABLE breadline__public__runs(id TEXT,volunteer_id INTEGER,collected_amount INTEGER,claimed INTEGER,_breadline_row_hash TEXT);
    INSERT INTO breadline__public__runs VALUES
      ('positive',NULL,18,0,'positive-source-hash'),
      ('zero',NULL,0,0,'zero-source-hash'),
      ('unreported',NULL,NULL,0,'unreported-source-hash'),
      ('owned',20,29,1,'owned-source-hash');
    CREATE TABLE _breadline_sync_run(status TEXT,startedAt TEXT,sourceSnapshotAt TEXT,completedAt TEXT,tableCount INTEGER);
    INSERT INTO _breadline_sync_run VALUES('complete','2026-11-01T00:00:00Z','2026-11-01T00:00:01Z','2026-11-01T00:00:03Z',3);
    CREATE TABLE _breadline_sync_state(sourceSchema TEXT,sourceTable TEXT,mirrorTable TEXT,strategy TEXT,localRows INTEGER,sourceRows INTEGER,syncedAt TEXT);`)
  for (const table of ['users', 'volunteers', 'runs']) {
    const { n } = db
      .query(`SELECT count(*) AS n FROM breadline__public__${table}`)
      .get() as { n: number }
    db.run(
      "INSERT INTO _breadline_sync_state VALUES('public',?,?, 'snapshot-replace',?,?,'2026-11-01T00:00:02Z')",
      [table, `breadline__public__${table}`, n, n],
    )
  }
  return db
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})

describe('reviewed unassigned collection attribution', () => {
  it('allows a donor eligibility export without user identities', () => {
    const db = fixture()
    installRunAttributionViews(db)
    db.run('DROP TABLE breadline__public__users')
    expect(installRunAttributionViews(db)).toBe(0)
    expect(db.query('SELECT count(*) AS n FROM breadline__public__runs').get()).toEqual(
      { n: 4 },
    )
    expect(() => readImportRuns(db)).toThrow()
    expect(db.query("SELECT name FROM sqlite_master WHERE type='view'").all()).toEqual(
      [],
    )
  })
  it('includes zero, preserves existing owners and raw evidence, and repeats safely', () => {
    const db = fixture()
    const raw = db.query('SELECT * FROM breadline__public__runs ORDER BY id').all()
    expect(db.transaction(() => installRunAttributionViews(db))()).toBe(2)
    expect(db.transaction(() => installRunAttributionViews(db))()).toBe(2)
    expect(db.query('SELECT * FROM breadline__public__runs ORDER BY id').all()).toEqual(
      raw,
    )
    expect(
      db.query('SELECT id,volunteer_id FROM _breadline_import_runs ORDER BY id').all(),
    ).toEqual([
      { id: 'owned', volunteer_id: 20 },
      { id: 'positive', volunteer_id: 6323 },
      { id: 'unreported', volunteer_id: null },
      { id: 'zero', volunteer_id: 6323 },
    ])
    expect(
      db
        .query(
          'SELECT runId,sourceVolunteerId,sourceUserId FROM _breadline_run_attribution ORDER BY runId',
        )
        .all(),
    ).toEqual([
      { runId: 'positive', sourceVolunteerId: null, sourceUserId: 6279 },
      { runId: 'zero', sourceVolunteerId: null, sourceUserId: 6279 },
    ])
    // Source corrections take priority automatically, including during later incremental pulls.
    db.run("UPDATE breadline__public__runs SET volunteer_id=20 WHERE id='positive'")
    expect(
      db
        .query("SELECT volunteer_id FROM _breadline_import_runs WHERE id='positive'")
        .get(),
    ).toEqual({ volunteer_id: 20 })
    expect(
      db.query('SELECT count(*) AS n FROM _breadline_run_attribution').get(),
    ).toEqual({ n: 1 })
  })

  it('applies to older read-only imports without installed views and retains related history', () => {
    const db = fixture()
    const source = readUserSyncSource(db)
    const daisy = source.rows.find(row => row.user.id === 6279)
    expect(daisy?.related.runs.map(row => row.id).sort()).toEqual(['positive', 'zero'])
    expect(
      source.rows.find(row => row.user.id === 2)?.related.runs.map(row => row.id),
    ).toEqual(['owned'])
    expect(
      db
        .query("SELECT volunteer_id FROM breadline__public__runs WHERE id='positive'")
        .get(),
    ).toEqual({ volunteer_id: null })
  })

  it('refuses a missing or changed destination instead of matching another same-name user', () => {
    const db = fixture()
    db.run('UPDATE breadline__public__users SET volunteer_id=20 WHERE id=6279')
    expect(() => readImportRuns(db)).toThrow('owner is missing')
    expect(() => db.transaction(() => installRunAttributionViews(db))()).toThrow(
      'owner is missing',
    )
    expect(db.query("SELECT name FROM sqlite_master WHERE type='view'").all()).toEqual(
      [],
    )
    db.run('UPDATE breadline__public__users SET volunteer_id=6323 WHERE id=6279')
    db.run('DELETE FROM breadline__public__volunteers WHERE id=6323')
    expect(() => readImportRuns(db)).toThrow('owner is missing')
  })

  it('allows unrelated partial exports and sources without any eligible runs', () => {
    const empty = new Database(':memory:')
    databases.push(empty)
    expect(installRunAttributionViews(empty)).toBe(0)
    const db = fixture()
    db.run('DELETE FROM breadline__public__runs WHERE volunteer_id IS NULL')
    db.run('DELETE FROM breadline__public__users WHERE id=6279')
    expect(installRunAttributionViews(db)).toBe(0)
    expect(readImportRuns(db)).toHaveLength(1)
  })
})
