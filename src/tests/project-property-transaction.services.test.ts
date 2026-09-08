// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { getTableColumns, getTableName } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  listResolvedProjectProperties,
  syncProjectInheritedProperties,
} from '$lib/db/services/property'
import * as schema from '$lib/db/schema'
import type { Database } from '$lib/types'

let sqlite: DatabaseSync
let db: Database
let batches: number[]
let beforeBatch: (() => void) | undefined
beforeEach(() => {
  batches = []
  beforeBatch = undefined
  sqlite = new DatabaseSync(':memory:')
  // Include every real selected column so nested hydration runs through Drizzle SQL.
  for (const table of [
    schema.project,
    schema.projectProperty,
    schema.organisation,
    schema.organisationProperty,
    schema.hub,
    schema.hubProperty,
    schema.layer,
    schema.layerProperty,
    schema.property,
    schema.propertyI18n,
    schema.propertyValue,
    schema.propertyValueI18n,
  ]) {
    const columns = Object.values(getTableColumns(table)).map(
      column => `"${column.name}" ${column.getSQLType()}`,
    )
    sqlite.exec(`CREATE TABLE "${getTableName(table)}" (${columns.join(', ')})`)
  }
  sqlite.exec(`CREATE UNIQUE INDEX layer_property_unique ON layerProperty(layerId, propertyId);
    CREATE UNIQUE INDEX project_property_unique ON projectProperty(projectId, propertyId);
    INSERT INTO hub (id, code) VALUES ('core', 'core'), ('scoped', 'scoped'), ('outside', 'outside');
    INSERT INTO organisation (id, hubId) VALUES ('org', 'scoped');
    INSERT INTO project (id, organisationId) VALUES ('project', 'org'), ('other-project', NULL);
    INSERT INTO layer (id, projectId) VALUES ('layer', 'project'), ('second', 'project'), ('other-layer', 'other-project');
    INSERT INTO layerProperty VALUES ('layer', 'old', 1, 1), ('other-layer', 'other', 1, 0);
    INSERT INTO projectProperty VALUES ('project', 'old', 1, 0, 9), ('other-project', 'other', 1, 1, 0);
    INSERT INTO property (id, key, scope, organisationId, hubId, projectId, isDefaultEnabled) VALUES
      ('old', 'old', 'organisation', 'org', NULL, NULL, 0),
      ('new', 'new', 'hub', NULL, 'scoped', NULL, 0),
      ('local', 'local', 'project', NULL, NULL, 'project', 0),
      ('core-prop', 'core-prop', 'hub', NULL, 'core', NULL, 1),
      ('outside-prop', 'outside-prop', 'hub', NULL, 'outside', NULL, 1),
      ('linked-org', 'linked-org', 'organisation', 'other-org', NULL, NULL, 1),
      ('linked-hub', 'linked-hub', 'hub', NULL, 'outside', NULL, 1);
    UPDATE property SET type = 'classifier', component = 'SelectField', isTranslatable = 1,
      isUserContributable = 1, createdAt = '2026-09-08T00:00:00.000Z', modifiedAt = '2026-09-08T00:00:00.000Z';
    INSERT INTO organisationProperty (organisationId, propertyId, rank) VALUES ('org', 'linked-org', 0);
    INSERT INTO hubProperty (hubId, propertyId, rank) VALUES ('scoped', 'linked-hub', 0)`)
  db = drizzle(
    {
      prepare: (sql: string) => ({
        bind: (...params: never[]) => ({
          sql,
          params,
          run: async () => {
            sqlite.prepare(sql).run(...params)
            return { success: true, meta: {} }
          },
          raw: async () => {
            const statement = sqlite.prepare(sql)
            statement.setReturnArrays(true)
            return statement.all(...params)
          },
        }),
      }),
      batch: async (statements: { sql: string; params: never[] }[]) => {
        batches.push(statements.length)
        beforeBatch?.()
        sqlite.exec('BEGIN')
        try {
          const results = statements.map(({ sql, params }) => {
            if (params.length > 100) throw new Error('D1 parameter budget exceeded')
            return { results: sqlite.prepare(sql).all(...params) }
          })
          sqlite.exec('COMMIT')
          return results
        } catch (error) {
          sqlite.exec('ROLLBACK')
          throw error
        }
      },
    } as never,
    { schema },
  ) as Database
})
afterEach(() => sqlite.close())

/** Captures every layer's settings for rollback and cross-layer isolation checks. */
function snapshot() {
  return {
    assignments: sqlite
      .prepare('SELECT * FROM projectProperty ORDER BY projectId, propertyId')
      .all(),
    links: sqlite
      .prepare('SELECT * FROM layerProperty ORDER BY layerId, propertyId')
      .all(),
  }
}

describe('project property cascade transaction integrity', () => {
  it('matches the read resolver across local, inherited, linked and core catalogs', async () => {
    await syncProjectInheritedProperties(db, {
      projectId: 'project',
      properties: [
        { id: 'new', scope: 'hub', isEnabled: true, isDefaultEnabled: false, rank: 2 },
        { id: 'old', scope: 'organisation', rank: 1 },
        { id: 'core-prop', scope: 'hub', isEnabled: false, rank: 3 },
      ],
    })
    const resolved = await listResolvedProjectProperties(db, 'project')
    const enabled = resolved.filter(row => row.scope === 'project' || row.isEnabled)
    const second = snapshot().links.filter(row => row.layerId === 'second')
    expect(second).toEqual(
      enabled
        .map(row => ({
          layerId: 'second',
          propertyId: row.id,
          isVisible: Number(Boolean(row.isDefaultEnabled)),
          isUserContributable: Number(Boolean(row.isDefaultEnabled)),
        }))
        .sort((a, b) => a.propertyId.localeCompare(b.propertyId)),
    )
    expect(second.map(row => row.propertyId)).toEqual([
      'linked-hub',
      'linked-org',
      'local',
      'new',
      'old',
    ])
    expect(snapshot().links).toContainEqual({
      layerId: 'layer',
      propertyId: 'old',
      isVisible: 1,
      isUserContributable: 1,
    })
    expect(snapshot().assignments).toContainEqual({
      projectId: 'project',
      propertyId: 'old',
      isEnabled: 1,
      isDefaultEnabled: 0,
      rank: 0,
    })
    expect(batches).toEqual([6])
  })

  it('rolls back parent flags, order, removal and creation when a child insertion fails', async () => {
    sqlite.exec(`CREATE TRIGGER reject_second BEFORE INSERT ON layerProperty
      WHEN NEW.layerId = 'second'
      BEGIN SELECT RAISE(ABORT, 'injected child failure'); END`)
    const before = snapshot()
    await expect(
      syncProjectInheritedProperties(db, {
        projectId: 'project',
        properties: [{ id: 'new', scope: 'hub', isEnabled: true }],
      }),
    ).rejects.toThrow()
    expect(snapshot()).toEqual(before)
    expect(batches).toEqual([4])
  })

  it('rolls back earlier parent updates if a later assignment fails', async () => {
    sqlite.exec(`CREATE TRIGGER reject_new BEFORE INSERT ON projectProperty
      WHEN NEW.propertyId = 'new'
      BEGIN SELECT RAISE(ABORT, 'injected parent failure'); END`)
    const before = snapshot()
    await expect(
      syncProjectInheritedProperties(db, {
        projectId: 'project',
        properties: [
          { id: 'old', scope: 'organisation', isEnabled: false },
          { id: 'new', scope: 'hub', isEnabled: true },
        ],
      }),
    ).rejects.toThrow()
    expect(snapshot()).toEqual(before)
  })

  it('preserves omitted live flags and uses current layer membership at commit time', async () => {
    beforeBatch = () =>
      sqlite.exec(`UPDATE projectProperty SET isEnabled = 0, isDefaultEnabled = 1 WHERE projectId = 'project';
      UPDATE layer SET projectId = 'other-project' WHERE id = 'second';
      INSERT INTO layer (id, projectId) VALUES ('late', 'project')`)
    await syncProjectInheritedProperties(db, {
      projectId: 'project',
      properties: [{ id: 'old', scope: 'organisation' }],
    })
    expect(snapshot().assignments).toContainEqual({
      projectId: 'project',
      propertyId: 'old',
      isEnabled: 0,
      isDefaultEnabled: 1,
      rank: 0,
    })
    expect(snapshot().links.some(row => row.propertyId === 'old')).toBe(false)
    expect(snapshot().links.some(row => row.layerId === 'second')).toBe(false)
    expect(snapshot().links.some(row => row.layerId === 'late')).toBe(true)
  })

  it('restores inherited defaults on empty submission without changing other projects', async () => {
    const before = snapshot()
    await syncProjectInheritedProperties(db, { projectId: 'project', properties: [] })
    expect(snapshot().assignments).toEqual(
      before.assignments.filter(row => row.projectId === 'other-project'),
    )
    expect(snapshot().links.filter(row => row.layerId === 'other-layer')).toEqual(
      before.links.filter(row => row.layerId === 'other-layer'),
    )
    expect(
      snapshot()
        .links.filter(row => row.layerId === 'second')
        .map(row => row.propertyId),
    ).toEqual(['core-prop', 'linked-hub', 'linked-org', 'local'])
    expect(batches).toEqual([3])
  })

  it('keeps hundreds of parameter-bounded writes and the cascade in one transaction', async () => {
    const properties = Array.from({ length: 250 }, (_, i) => ({
      id: `bulk-${i}`,
      scope: 'project' as const,
    }))
    const insert = sqlite.prepare(
      "INSERT INTO property (id, key, scope, projectId, isDefaultEnabled) VALUES (?, ?, 'project', 'project', 0)",
    )
    for (const row of properties) insert.run(row.id, row.id)
    await syncProjectInheritedProperties(db, { projectId: 'project', properties })
    expect(snapshot().assignments).toHaveLength(251)
    expect(snapshot().links.filter(row => row.layerId === 'second')).toHaveLength(254)
    expect(batches).toEqual([253])
  })
})
