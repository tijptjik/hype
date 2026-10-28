// @vitest-environment node
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { getTableColumns, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '#lib/db/schema/index.js'
import {
  probeOrganisationForUpdate,
  updateOrganisationByIdWithConcurrency,
} from '#lib/db/services/organisation.js'
import {
  probeProjectForUpdate,
  updateProjectByIdWithConcurrency,
} from '#lib/db/services/project.js'
import {
  applyContentLocaleSettingsPatch,
  ContentLocaleSettingsPatchSchema,
} from '#lib/content-locales/settings.js'
import { resolveContentLocales } from '#lib/content-locales/resolve.js'
import type { Database, Id } from '#lib/types.js'

let sqlite: DatabaseSync
let db: Database
const originalFlags = { show3dAddressOptions: false, futureFlag: true }

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  // Recreate pre-migration column shapes, then exercise the real additive migration.
  for (const [name, table] of [
    ['organisation', schema.organisation],
    ['project', schema.project],
  ] as const) {
    const columns = Object.values(getTableColumns(table))
      .filter(column => column.name !== 'settings')
      .map(column => `"${column.name}" ${column.getSQLType()}`)
    sqlite.exec(`CREATE TABLE "${name}" (${columns.join(', ')})`)
  }
  sqlite.exec(`INSERT INTO organisation (id, code, hubId, modifiedAt, capabilities) VALUES ('o', 'org', 'h', 'before', '{}');
    INSERT INTO project (id, code, organisationId, modifiedAt, capabilities) VALUES ('p', 'project', 'o', 'before', '{}')`)
  sqlite.prepare('UPDATE project SET flags = ?').run(JSON.stringify(originalFlags))
  sqlite.exec(readFileSync('migrations/0158_content_locale_settings.sql', 'utf8'))
  db = drizzle(
    {
      prepare: (sql: string) => ({
        bind: (...params: never[]) => ({
          raw: async () => {
            const statement = sqlite.prepare(sql)
            statement.setReturnArrays(true)
            return statement.all(...params)
          },
          run: async () => {
            sqlite.prepare(sql).run(...params)
            return { success: true, meta: {} }
          },
        }),
      }),
    } as unknown as D1Database,
    { schema },
  ) as Database
})
afterEach(() => sqlite.close())

describe('content locale settings migration and persistence', () => {
  it('defaults existing rows to inheritance, leaves flags intact, and rejects non-object JSON storage', async () => {
    const project = await probeProjectForUpdate(db, 'p' as Id)
    const organisation = await probeOrganisationForUpdate(db, 'o' as Id)
    expect(project?.settings).toEqual({})
    expect(project?.flags).toEqual(originalFlags)
    expect(organisation?.settings).toEqual({})
    expect(
      resolveContentLocales({
        projectSettings: project?.settings,
        organisationSettings: organisation?.settings,
      }).origin,
    ).toBe('user-default')
    for (const value of ['null', '[]', '{broken']) {
      expect(() =>
        sqlite.prepare('UPDATE project SET settings = ?').run(value),
      ).toThrow()
    }
  })
  it('round-trips canonical ordered overrides and reset while guarding stale writes', async () => {
    sqlite.exec(`UPDATE organisation SET settings = '{"future":{"keep":true}}';
      UPDATE project SET settings = '{"future":[1,2]}'`)
    const organisation = (await probeOrganisationForUpdate(db, 'o' as Id))!
    const orgSaved = await updateOrganisationByIdWithConcurrency(db, {
      id: 'o' as Id,
      updatedAt: 'before',
      data: {
        code: 'org',
        url: null,
        settings: applyContentLocaleSettingsPatch(
          organisation.settings,
          ContentLocaleSettingsPatchSchema.parse({ contentLocales: ['ja', 'en'] }),
        ),
      },
    })
    expect(orgSaved).not.toBeNull()
    expect((await probeOrganisationForUpdate(db, 'o' as Id))?.settings).toEqual({
      contentLocales: ['ja', 'en'],
      future: { keep: true },
    })
    const project = (await probeProjectForUpdate(db, 'p' as Id))!
    const core = {
      organisationId: 'o',
      code: 'project',
      flags: originalFlags,
      capabilities: {
        manageBakeries: false,
        manageVolunteers: false,
        manageDropOffs: false,
      },
      cardStyleCode: null,
      markerStyleCode: null,
      useAllInOrgContext: false,
    }
    const saved = await updateProjectByIdWithConcurrency(db, {
      id: 'p' as Id,
      updatedAt: 'before',
      data: {
        ...core,
        settings: applyContentLocaleSettingsPatch(
          project.settings,
          ContentLocaleSettingsPatchSchema.parse({
            contentLocales: ['zhHant', 'pt-br', 'ja'],
          }),
        ),
      },
    })
    expect(saved).not.toBeNull()
    const loaded = (await probeProjectForUpdate(db, 'p' as Id))!
    expect(loaded.settings).toEqual({
      contentLocales: ['zh-Hant', 'pt-BR', 'ja'],
      future: [1, 2],
    })
    expect(loaded.flags).toEqual(originalFlags)
    expect(
      await updateProjectByIdWithConcurrency(db, {
        id: 'p' as Id,
        updatedAt: 'before',
        data: { ...core, settings: {} },
      }),
    ).toBeNull()
    const reset = await updateProjectByIdWithConcurrency(db, {
      id: 'p' as Id,
      updatedAt: saved!.modifiedAt,
      data: {
        ...core,
        settings: applyContentLocaleSettingsPatch(loaded.settings, {
          contentLocales: null,
        }),
      },
    })
    expect(reset).not.toBeNull()
    const afterReset = (await probeProjectForUpdate(db, 'p' as Id))!
    expect(afterReset.settings).toEqual({ future: [1, 2] })
    expect(
      resolveContentLocales({
        projectSettings: afterReset.settings,
        organisationSettings: (await probeOrganisationForUpdate(db, 'o' as Id))
          ?.settings,
      }),
    ).toEqual({ locales: ['ja', 'en'], origin: 'organisation' })
    // An older client edits another field with no settings payload.
    await updateProjectByIdWithConcurrency(db, {
      id: 'p' as Id,
      updatedAt: reset!.modifiedAt,
      data: { ...core, code: 'renamed' },
    })
    const [final] = await db
      .select({ settings: schema.project.settings, flags: schema.project.flags })
      .from(schema.project)
      .where(eq(schema.project.id, 'p'))
    expect(final).toEqual({ settings: { future: [1, 2] }, flags: originalFlags })
  })
})
