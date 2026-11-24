// @vitest-environment node
// TESTS
import { afterEach, describe, expect, it, vi } from 'vitest'
// NODE
import { readFileSync } from 'node:fs'
// DRIZZLE
import { createRecorderRecord } from '#lib/db/services/fieldResearchFeature.js'
import { researchConfigurationSchema } from '#lib/fieldResearch/configuration.js'
import { setResearchSessionsArchived } from '#lib/db/services/fieldResearchArchive.js'
// SCHEMA
import { fieldResearchSession } from '#lib/db/schema/fieldResearch.js'
// FIXTURES
import { lifecycleFixture } from './fixtures/featureLifecycle'

import type { Database } from '#lib/types.js'
import { withRemoteMeta } from './remote-function-mock'
const endpointContext = vi.hoisted(() => ({
  db: {} as Database,
  user: { id: 'researcher', superAdmin: true },
  userRoles: [],
}))
vi.mock('#lib/api/server/guarded.js', () => {
  const wrap =
    (type: 'query' | 'command') =>
    (
      schema: { parse: (raw: unknown) => unknown },
      handler: (input: unknown, context: unknown) => unknown,
    ) =>
      withRemoteMeta(
        (raw: unknown) => handler(schema.parse(raw), endpointContext),
        type,
      )
  return { guardedQuery: wrap('query'), guardedCommand: wrap('command') }
})
// The lifecycle fixture includes the real choice definition and option, without project catalogue relations.
vi.mock('#lib/db/services/property.js', () => ({
  listResolvedProjectProperties: async () => [
    {
      id: 'choice',
      type: 'classifier',
      cardinality: 'one',
      values: [{ id: 'option', value: 'Shop' }],
    },
  ],
}))

const stores: ReturnType<typeof lifecycleFixture>[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.sqlite.close()
})

/** Build a realistic retained session alongside the accepted Feature revision schema.
 * @returns Isolated D1 adapter enforcing the production variable ceiling.
 */
async function fixture() {
  const f = lifecycleFixture(false, false, 100)
  stores.push(f)
  f.sqlite.exec('DROP TABLE featureOrigin')
  f.sqlite.exec(readFileSync('migrations/0242_field_research.sql', 'utf8'))
  f.sqlite.exec(
    readFileSync('migrations/0244_field_research_stack_details.sql', 'utf8'),
  )
  f.sqlite.exec(readFileSync('migrations/0246_field_research_archive.sql', 'utf8'))
  f.sqlite.exec(
    readFileSync('migrations/0261_field_research_configuration.sql', 'utf8'),
  )
  f.sqlite.exec(
    `INSERT INTO user(id) VALUES ('researcher'); CREATE TABLE featureIntentPolicy(scopeType TEXT,scopeId TEXT,definition TEXT,namingRules TEXT,version INTEGER);`,
  )
  f.sqlite.exec(readFileSync('migrations/0265_field_research_record.sql', 'utf8'))
  f.sqlite.exec(readFileSync('migrations/0266_field_research_features.sql', 'utf8'))
  f.sqlite.exec('CREATE TABLE IF NOT EXISTS location(id TEXT PRIMARY KEY)')
  f.sqlite.exec(
    readFileSync('migrations/0267_field_research_record_placement.sql', 'utf8'),
  )
  await f.db.insert(fieldResearchSession).values({
    id: 'session',
    name: 'Internal outing',
    organisationId: 'org',
    projectId: 'project',
    createdBy: 'researcher',
    createdAt: 'now',
    updatedAt: 'now',
    status: 'uploading',
  })
  return f
}

describe('research session archive', () => {
  it('archives and restores large selections without changing progress or captures', async () => {
    const f = await fixture()
    f.sqlite.exec(
      `WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<120) INSERT INTO fieldResearchSession(id,name,organisationId,projectId,createdBy,createdAt,updatedAt,status) SELECT 'bulk-'||x,'Outing','org','project','researcher','now','now','organising' FROM n`,
    )
    const rows = await f.db.select().from(fieldResearchSession)
    const actor = {
      db: f.db,
      user: { id: 'researcher', superAdmin: true },
      userRoles: [],
    }
    expect(await setResearchSessionsArchived(actor, rows, true)).toBe(true)
    const archived = await f.db.select().from(fieldResearchSession)
    expect(archived).toHaveLength(121)
    expect(
      archived.every(
        row =>
          row.isArchived &&
          row.archivedBy === 'researcher' &&
          row.archivedAt &&
          row.revision === 1,
      ),
    ).toBe(true)
    expect(archived.find(row => row.id === 'session')?.status).toBe('uploading')
    expect(await setResearchSessionsArchived(actor, archived, false)).toBe(true)
    const restored = await f.db.select().from(fieldResearchSession)
    expect(
      restored.every(
        row =>
          !row.isArchived &&
          row.archivedAt === null &&
          row.archivedBy === null &&
          row.revision === 2,
      ),
    ).toBe(true)
  })

  it('rejects stale, missing and unauthorized selections without partial updates', async () => {
    const f = await fixture()
    const actor = {
      db: f.db,
      user: { id: 'researcher', superAdmin: true },
      userRoles: [],
    }
    expect(
      await setResearchSessionsArchived(
        actor,
        [
          { id: 'session', revision: 0 },
          { id: 'missing', revision: 0 },
        ],
        true,
      ),
    ).toBe(false)
    expect(
      await setResearchSessionsArchived(actor, [{ id: 'session', revision: 1 }], true),
    ).toBe(false)
    expect(
      await setResearchSessionsArchived(
        { ...actor, user: { id: 'researcher', superAdmin: false } },
        [{ id: 'session', revision: 0 }],
        true,
      ),
    ).toBe(false)
    const [row] = await f.db.select().from(fieldResearchSession)
    expect(row.isArchived).toBe(false)
    expect(row.revision).toBe(0)
  })
})

describe('mobile provisional Feature creation', () => {
  it('applies session and layer defaults to one unpublished Feature per device request', async () => {
    const { sqlite, db } = await fixture()
    const ctx = { db, user: { id: 'researcher', superAdmin: true }, userRoles: [] }
    const { code, ...config } = researchConfigurationSchema.parse({
      code: 'TEST',
      properties: {},
    })
    sqlite
      .prepare(
        "UPDATE fieldResearchSession SET configuration=?,code=?,layerId='layer',configurationVersion=1",
      )
      .run(JSON.stringify(config), code)
    sqlite.exec(
      `INSERT INTO fieldResearchSessionLayer VALUES('session','layer',1,'{"defaults":{"isIntangible":true}}')`,
    )
    await createRecorderRecord(ctx, 'session', 'capture')
    await createRecorderRecord(ctx, 'session', 'capture')
    const first = sqlite
      .prepare(
        `SELECT f.*,i.title FROM fieldResearchRecord r JOIN feature f ON f.id=r.featureId JOIN featureI18n i ON i.featureId=f.id JOIN featureOrigin o ON o.featureId=f.id AND o.originId=r.sessionId WHERE r.id='capture'`,
      )
      .get()
    expect(first).toMatchObject({
      title: 'TEST-001',
      isDraft: 1,
      isPendingReview: 1,
      isVisitable: 0,
      isIntangible: 1,
      isPublished: 0,
      featureType: 'object',
      layerId: 'layer',
    })
    expect(first?.currentRevisionId).toBeTruthy()
    expect(JSON.parse(String(first?.geometry))).toEqual({
      type: 'GeometryCollection',
      geometries: [],
    })
    sqlite.exec(
      "CREATE TRIGGER fail_receipt BEFORE INSERT ON fieldResearchRecord BEGIN SELECT RAISE(ABORT,'interrupted'); END",
    )
    await expect(createRecorderRecord(ctx, 'session', 'next')).rejects.toThrow()
    expect(
      sqlite
        .prepare("SELECT count(*) n FROM featureOrigin WHERE originId='session'")
        .get()?.n,
    ).toBe(1)
    sqlite.exec('DROP TRIGGER fail_receipt')
    await createRecorderRecord(ctx, 'session', 'next')
    expect(
      sqlite.prepare('SELECT recordSequence FROM fieldResearchSession').get()
        ?.recordSequence,
    ).toBe(2)
    sqlite.exec('UPDATE fieldResearchSession SET configurationVersion=0')
    await expect(createRecorderRecord(ctx, 'session', 'old')).rejects.toMatchObject({
      status: 409,
    })
    await expect(
      createRecorderRecord(
        { ...ctx, user: { id: 'other', superAdmin: false } },
        'session',
        'capture',
      ),
    ).rejects.toMatchObject({ status: 403 })
    sqlite.exec("UPDATE fieldResearchSession SET status='completed'")
    await expect(createRecorderRecord(ctx, 'session', 'closed')).rejects.toMatchObject({
      status: 403,
    })
    expect(await createRecorderRecord(ctx, 'session', 'capture')).toBe('capture')
  })
})

it('gates unreadable historical configuration before decoding and previews defaults', async () => {
  const f = await fixture()
  endpointContext.db = f.db
  const api = await import('#lib/api/fieldResearch.remote.js')
  f.sqlite.exec("UPDATE fieldResearchSession SET configuration='{broken',code='OLD'")
  expect(await api.getResearchConfiguration({ sessionId: 'session' })).toMatchObject({
    version: 0,
    settings: null,
  })
  const plan = await api.previewResearchMigration({
    sessionId: 'session',
    revision: 0,
    from: 0,
    to: 1,
  })
  expect(plan.removed).toContain('session.configuration')
  expect(plan.settings.code).toBe('OLD')
  expect(plan.settings.defaults.isDraft).toBe(true)
  f.sqlite.exec('UPDATE fieldResearchSession SET configurationVersion=2')
  expect(await api.getResearchConfiguration({ sessionId: 'session' })).toMatchObject({
    version: 2,
    settings: null,
  })
  await expect(
    api.previewResearchMigration({ sessionId: 'session', revision: 0, from: 2, to: 1 }),
  ).rejects.toMatchObject({ status: 409 })
})

it('retains the original configuration and applies only a reviewed migration', async () => {
  const f = await fixture()
  endpointContext.db = f.db
  const api = await import('#lib/api/fieldResearch.remote.js')
  const raw = JSON.stringify({
    obsoleteFlag: true,
    defaults: { isDraft: false },
    properties: {
      choice: { isVisible: true, isRecordable: true, defaultValue: 'option' },
    },
  })
  f.sqlite
    .prepare(
      "UPDATE fieldResearchSession SET code='SESSION',configuration=?,layerId='layer'",
    )
    .run(raw)
  f.sqlite.exec(
    "INSERT INTO fieldResearchSessionLayer(sessionId,layerId,isDefault) VALUES('session','layer',1)",
  )
  const input = { sessionId: 'session', revision: 0, from: 0, to: 1 as const }
  expect(await api.getResearchConfiguration(input)).toMatchObject({
    version: 0,
    settings: null,
  })
  const plan = await api.previewResearchMigration(input)
  expect(plan.removed).toContain('session.obsoleteFlag')
  expect(plan.defaulted).toContain('session.defaults.isPendingReview')
  await expect(
    api.saveResearchConfiguration({
      ...input,
      schemaVersion: 1,
      settings: plan.settings,
      layers: plan.layers,
    }),
  ).rejects.toMatchObject({ status: 409 })
  await expect(
    api.migrateResearchConfiguration({ ...input, token: 'a'.repeat(64) }),
  ).rejects.toMatchObject({ status: 409 })
  await api.migrateResearchConfiguration({ ...input, token: plan.token })
  await expect(
    api.migrateResearchConfiguration({ ...input, token: plan.token }),
  ).rejects.toMatchObject({ status: 409 })
  expect(
    f.sqlite
      .prepare(
        'SELECT configuration,schemaVersion FROM fieldResearchConfigurationHistory',
      )
      .get(),
  ).toMatchObject({ configuration: raw, schemaVersion: 0 })
  expect(
    await api.getResearchConfiguration({ sessionId: 'session', revision: 1 }),
  ).toMatchObject({
    version: 1,
    settings: { code: 'SESSION', defaults: { isDraft: false } },
  })
  await createRecorderRecord(
    { db: f.db, user: { id: 'researcher', superAdmin: true }, userRoles: [] },
    'session',
    'first',
  )
  const property = f.sqlite
    .prepare(
      "SELECT fp.propertyValueId FROM featureProperty fp JOIN fieldResearchRecord r ON fp.featureId=r.featureId WHERE r.id='first' AND fp.propertyId='choice'",
    )
    .get()
  expect(property?.propertyValueId).toBe('option')
})
