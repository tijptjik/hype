// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
// DRIZZLE
import { getTableColumns } from 'drizzle-orm'
// TESTS
import { describe, expect, it } from 'vitest'
// DB
import { project, layer, feature, task } from '#lib/db/schema/index.js'
import { updateProjectByIdWithConcurrency } from '#lib/db/services/project.js'
import { DEFAULT_PROJECT_LOCATION_POLICY } from '#lib/locations/model.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
// TYPES
import type { Database } from '#lib/types.js'

type Move = Parameters<typeof updateProjectByIdWithConcurrency>[1]
const move: Move = {
  id: 'p',
  updatedAt: 'original',
  data: {
    organisationId: 'new',
    code: 'updated',
    capabilities: {
      manageBakeries: false,
      manageVolunteers: false,
      manageDropOffs: false,
    },
    flags: {},
    cardStyleCode: null,
    markerStyleCode: null,
    useAllInOrgContext: false,
  },
}

/** Creates isolated schema-shaped rows for guarded ancestry writes. */
function fixture() {
  const { sqlite, db } = publicationSqlite({})
  for (const [name, table] of [
    ['project', project],
    ['layer', layer],
    ['feature', feature],
    ['task', task],
  ] as const) {
    const columns = Object.values(getTableColumns(table)).map(
      column => `"${column.name}" ${column.getSQLType()}`,
    )
    sqlite.exec(`CREATE TABLE "${name}" (${columns.join(',')})`)
    if (name === 'project') {
      sqlite.exec(
        "INSERT INTO project(id,organisationId,modifiedAt,locationPolicyRevision) VALUES ('p','old','original',0),('other','outside','original',0)",
      )
    } else {
      sqlite.exec(
        `INSERT INTO ${name}(id,projectId,organisationId,modifiedAt) VALUES ('child','p','old','original'),('outside','other','outside','original')`,
      )
    }
  }
  return { sqlite, db: db as unknown as Database }
}

/** Includes all columns so rollback also proves preservation of timestamps and core edits. */
function snapshot(sqlite: ReturnType<typeof fixture>['sqlite']) {
  return ['project', 'layer', 'feature', 'task'].map(table =>
    sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all(),
  )
}

describe('atomic project organisation moves', () => {
  it('does not move descendants when the policy revision changes after its read', async () => {
    const { sqlite, db } = fixture()
    try {
      db.batch = new Proxy(db.batch, {
        apply(target, receiver, args) {
          sqlite.exec("UPDATE project SET locationPolicyRevision=1 WHERE id='p'")
          return Reflect.apply(target, receiver, args)
        },
      })
      expect(
        await updateProjectByIdWithConcurrency(db, {
          ...move,
          locationUpdatePolicy: {
            policy: DEFAULT_PROJECT_LOCATION_POLICY,
            expectedRevision: 0,
          },
        }),
      ).toBeNull()
      for (const table of ['project', 'layer', 'feature', 'task']) {
        expect(
          sqlite
            .prepare(`SELECT organisationId,modifiedAt FROM ${table} WHERE id=?`)
            .get(table === 'project' ? 'p' : 'child'),
        ).toEqual({ organisationId: 'old', modifiedAt: 'original' })
      }
    } finally {
      sqlite.close()
    }
  })

  it('moves every descendant while preserving unrelated projects', async () => {
    const { sqlite, db } = fixture()
    try {
      expect(await updateProjectByIdWithConcurrency(db, move)).toMatchObject({
        id: 'p',
      })
      for (const table of ['project', 'layer', 'feature', 'task']) {
        const id = table === 'project' ? 'p' : 'child'
        expect(
          sqlite.prepare(`SELECT organisationId FROM ${table} WHERE id=?`).get(id),
        ).toEqual({ organisationId: 'new' })
        expect(
          sqlite
            .prepare(`SELECT organisationId FROM ${table} WHERE id=?`)
            .get(table === 'project' ? 'other' : 'outside'),
        ).toEqual({ organisationId: 'outside' })
      }
    } finally {
      sqlite.close()
    }
  })

  it.each(['layer', 'feature', 'task', 'project'])(
    'rolls back all rows if the %s write fails',
    async table => {
      const { sqlite, db } = fixture()
      try {
        sqlite.exec(
          `CREATE TRIGGER fail_move BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'injected move failure'); END`,
        )
        const before = snapshot(sqlite)
        await expect(updateProjectByIdWithConcurrency(db, move)).rejects.toThrow(
          'injected move failure',
        )
        expect(snapshot(sqlite)).toEqual(before)
      } finally {
        sqlite.close()
      }
    },
  )

  it('does not move descendants when the parent revision changes after its read', async () => {
    const { sqlite, db } = fixture()
    try {
      db.batch = new Proxy(db.batch, {
        apply(target, receiver, args) {
          sqlite.exec("UPDATE project SET modifiedAt='concurrent' WHERE id='p'")
          return Reflect.apply(target, receiver, args)
        },
      })
      expect(await updateProjectByIdWithConcurrency(db, move)).toBeNull()
      expect(
        sqlite
          .prepare("SELECT organisationId,modifiedAt FROM project WHERE id='p'")
          .get(),
      ).toEqual({ organisationId: 'old', modifiedAt: 'concurrent' })
      for (const table of ['layer', 'feature', 'task']) {
        expect(
          sqlite
            .prepare(`SELECT organisationId,modifiedAt FROM ${table} WHERE id='child'`)
            .get(),
        ).toEqual({ organisationId: 'old', modifiedAt: 'original' })
      }
    } finally {
      sqlite.close()
    }
  })

  it('preserves the existing private Location correction guard and rolls back preceding descendants', async () => {
    const { sqlite, db } = fixture()
    try {
      sqlite.exec(`CREATE TABLE featureLocation(featureId TEXT, locationId TEXT, factsOrganisationRevision TEXT, locationOrganisationRevision TEXT);
        INSERT INTO featureLocation VALUES ('child','location','private-revision',NULL)`)
      sqlite.exec(
        readFileSync('migrations/0141_organisation_location_scope_guards.sql', 'utf8'),
      )
      const before = snapshot(sqlite)
      await expect(updateProjectByIdWithConcurrency(db, move)).rejects.toThrow(
        'scope mismatch',
      )
      expect(snapshot(sqlite)).toEqual(before)
    } finally {
      sqlite.close()
    }
  })

  it('preserves historical-layer parent locks without committing the project move', async () => {
    const { sqlite, db } = fixture()
    try {
      sqlite.exec('ALTER TABLE layer ADD COLUMN historicalSourceLayerId TEXT')
      sqlite.exec(
        "INSERT INTO layer(id,projectId,organisationId,historicalSourceLayerId) VALUES ('history','p','old','child')",
      )
      const migration = readFileSync('src/tests/fixtures/historical-layers.sql', 'utf8')
      sqlite.exec(
        migration.slice(
          migration.indexOf('CREATE TRIGGER historical_layer_lock'),
          migration.indexOf('CREATE TRIGGER historical_layer_delete'),
        ),
      )
      const before = snapshot(sqlite)
      await expect(updateProjectByIdWithConcurrency(db, move)).rejects.toThrow(
        /HISTORICAL_.*_LOCKED/,
      )
      expect(snapshot(sqlite)).toEqual(before)
    } finally {
      sqlite.close()
    }
  })
})
