// @vitest-environment node
// TESTS
import { describe, expect, it, vi } from 'vitest'
// SERVICES
import { updateOrganisationByIdWithConcurrency } from '#lib/db/services/organisation.js'
import { cascadeOrganisationCapabilitiesToProjects } from '#lib/db/services/project.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
// TYPES
import type { Database } from '#lib/types.js'

const full = { manageBakeries: true, manageVolunteers: true, manageDropOffs: true }
const none = {
  viewAnalytics: false,
  manageBakeries: false,
  manageVolunteers: false,
  manageDropOffs: false,
}
const patch = {
  id: 'o',
  updatedAt: 'before',
  data: { code: 'org', url: null, capabilities: { manageBakeries: {} } },
}

/** Real SQLite execution of scoped capability restrictions using D1 batch semantics. */
function fixture() {
  const { sqlite, db } = publicationSqlite({})
  sqlite.exec(`CREATE TABLE organisation(id TEXT PRIMARY KEY, code TEXT, url TEXT, capabilities TEXT, modifiedAt TEXT);
    CREATE TABLE project(id TEXT PRIMARY KEY, organisationId TEXT, capabilities TEXT, modifiedAt TEXT);
    CREATE TABLE projectRole(projectId TEXT, userId TEXT, capabilities TEXT);
    INSERT INTO organisation VALUES ('o','org',NULL,'{}','before');`)
  for (const [id, org, caps] of [
    ['p', 'o', full],
    ['disabled', 'o', { ...full, manageBakeries: false }],
    ['outside', 'other', full],
  ] as const) {
    sqlite
      .prepare('INSERT INTO project VALUES (?,?,?,?)')
      .run(id, org, JSON.stringify(caps), 'before')
    sqlite
      .prepare('INSERT INTO projectRole VALUES (?,?,?)')
      .run(id, 'u', JSON.stringify(full))
  }
  return { sqlite, db: db as unknown as Database }
}

/** Reads every written column to detect partial changes and timestamp churn. */
function snapshot(sqlite: ReturnType<typeof fixture>['sqlite']) {
  return ['organisation', 'project', 'projectRole'].map(table =>
    sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
  )
}

/** Reads persisted JSON rather than trusting the service's return value. */
function capabilities(
  sqlite: ReturnType<typeof fixture>['sqlite'],
  table: 'project' | 'projectRole',
  id: string,
) {
  const row = sqlite
    .prepare(
      `SELECT capabilities FROM ${table} WHERE ${table === 'project' ? 'id' : 'projectId'}=?`,
    )
    .get(id)!
  return JSON.parse(row.capabilities as string)
}

describe('atomic organisation capability restrictions', () => {
  it('revokes disabled capabilities at both levels without granting disabled project permissions', async () => {
    const { sqlite, db } = fixture()
    try {
      expect(await updateOrganisationByIdWithConcurrency(db, patch)).toMatchObject({
        id: 'o',
      })
      for (const table of ['project', 'projectRole'] as const) {
        expect(capabilities(sqlite, table, 'p')).toEqual({
          ...none,
          manageBakeries: true,
        })
        expect(capabilities(sqlite, table, 'disabled')).toEqual(none)
        expect(capabilities(sqlite, table, 'outside')).toEqual(full)
      }
    } finally {
      sqlite.close()
    }
  })

  it.each(['project', 'projectRole', 'organisation'])(
    'rolls back every restriction when %s fails',
    async table => {
      const { sqlite, db } = fixture()
      try {
        sqlite.exec(
          `CREATE TRIGGER fail_write BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'injected capability failure'); END`,
        )
        const before = snapshot(sqlite)
        await expect(updateOrganisationByIdWithConcurrency(db, patch)).rejects.toThrow(
          'injected capability failure',
        )
        expect(snapshot(sqlite)).toEqual(before)
      } finally {
        sqlite.close()
      }
    },
  )

  it('does not change projects or roles for a stale organisation edit', async () => {
    const { sqlite, db } = fixture()
    try {
      const before = snapshot(sqlite)
      expect(
        await updateOrganisationByIdWithConcurrency(db, {
          ...patch,
          updatedAt: 'stale',
        }),
      ).toBeNull()
      expect(snapshot(sqlite)).toEqual(before)
    } finally {
      sqlite.close()
    }
  })

  it('uses live values and retains concurrent revocation instead of overwriting it from a snapshot', async () => {
    const { sqlite, db } = fixture()
    try {
      db.batch = new Proxy(db.batch, {
        apply(target, receiver, args) {
          sqlite
            .prepare("UPDATE projectRole SET capabilities=? WHERE projectId='p'")
            .run(JSON.stringify(none))
          return Reflect.apply(target, receiver, args)
        },
      })
      await updateOrganisationByIdWithConcurrency(db, patch)
      expect(capabilities(sqlite, 'projectRole', 'p')).toEqual(none)
    } finally {
      sqlite.close()
    }
  })

  it('does not churn project timestamps when restrictions are already applied', async () => {
    const { sqlite, db } = fixture()
    try {
      await updateOrganisationByIdWithConcurrency(db, patch)
      sqlite.exec("UPDATE project SET modifiedAt='stable'")
      const before = snapshot(sqlite)
      await cascadeOrganisationCapabilitiesToProjects(db, {
        organisationId: 'o',
        organisationCapabilities: patch.data.capabilities,
      })
      expect(snapshot(sqlite)).toEqual(before)
    } finally {
      sqlite.close()
    }
  })

  it('clears all capabilities for null definitions and treats numeric JSON values as disabled', async () => {
    const { sqlite, db } = fixture()
    try {
      sqlite.exec(`UPDATE project SET capabilities='{"manageBakeries":1}' WHERE id='p'`)
      await updateOrganisationByIdWithConcurrency(db, patch)
      expect(capabilities(sqlite, 'project', 'p')).toEqual(none)
      await cascadeOrganisationCapabilitiesToProjects(db, {
        organisationId: 'o',
        organisationCapabilities: null,
      })
      expect(capabilities(sqlite, 'projectRole', 'p')).toEqual(none)
    } finally {
      sqlite.close()
    }
  })

  it('keeps statement count and parameter use bounded across a large organisation', async () => {
    const { sqlite, db } = fixture()
    try {
      for (let index = 0; index < 300; index++) {
        sqlite
          .prepare('INSERT INTO project VALUES (?,?,?,?)')
          .run(`p-${index}`, 'o', JSON.stringify(full), 'before')
        sqlite
          .prepare('INSERT INTO projectRole VALUES (?,?,?)')
          .run(`p-${index}`, 'u', JSON.stringify(full))
      }
      const batch = vi.spyOn(db, 'batch')
      await updateOrganisationByIdWithConcurrency(db, patch)
      expect(batch).toHaveBeenCalledTimes(1)
      expect(batch.mock.calls[0][0]).toHaveLength(3)
      for (const statement of batch.mock.calls[0][0]) {
        expect(
          (statement as unknown as { toSQL(): { params: unknown[] } }).toSQL().params
            .length,
        ).toBeLessThanOrEqual(100)
      }
      expect(capabilities(sqlite, 'projectRole', 'p-299')).toEqual({
        ...none,
        manageBakeries: true,
      })
    } finally {
      sqlite.close()
    }
  })
})
