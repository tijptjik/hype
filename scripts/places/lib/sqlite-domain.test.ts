import { afterEach, expect, test } from 'bun:test'
import { Database as Sqlite } from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { openSqliteDomain } from './sqlite-domain'

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})
/** Create an isolated constrained database. @returns Local adapter and cleanup operation. */
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'place-domain-adapter-'))
  directories.push(directory)
  const path = join(directory, 'db.sqlite')
  const sqlite = new Sqlite(path)
  sqlite.exec('CREATE TABLE item(id INTEGER PRIMARY KEY, value TEXT NOT NULL)')
  sqlite.close()
  return openSqliteDomain(path)
}

test('rolls back an early successful write when a later batch statement fails', async () => {
  const { db, sqlite, close } = fixture()
  try {
    await expect(
      db.batch([
        db.run(sql`INSERT INTO item VALUES(1,'first')`),
        db.run(sql`INSERT INTO item VALUES(2,NULL)`),
      ]),
    ).rejects.toThrow()
    expect(sqlite.query('SELECT * FROM item').all()).toEqual([])
    await db.batch([db.run(sql`INSERT INTO item VALUES(1,'retry')`)])
    expect(sqlite.query('SELECT * FROM item').all()).toEqual([
      { id: 1, value: 'retry' },
    ])
  } finally {
    close()
  }
})

test('preserves bound text literally through write and read projections', async () => {
  const { db, close } = fixture()
  try {
    const value = "shop's ? name; DROP TABLE item; --"
    await db.run(sql`INSERT INTO item VALUES(1,${value})`)
    expect(await db.get(sql`SELECT value FROM item WHERE id=${1}`)).toEqual({ value })
  } finally {
    close()
  }
})
