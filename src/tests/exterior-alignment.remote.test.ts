// @vitest-environment node
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { withRemoteMeta } from './remote-function-mock'

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  current: vi.fn(),
  ctx: {
    user: { id: 'reviewer', superAdmin: true },
    event: { locals: { platform: {} } },
    db: { get: vi.fn() },
  },
}))
vi.mock('#lib/api/server/guarded', () => {
  const wrap = (schema: any, fn: any) =>
    withRemoteMeta((input: unknown) => fn(schema.parse(input), mocks.ctx), 'command')
  return { guardedCommand: wrap, guardedQuery: wrap }
})
vi.mock('#lib/locations/exterior/authorize.server.js', () => ({
  authorizeExteriorLocation: mocks.authorize,
}))
vi.mock('#lib/locations/exterior/textureComparison.server.js', () => ({
  textureComparisonFile: mocks.current,
}))
import {
  getExteriorAlignment,
  saveExteriorAlignment,
} from '#lib/api/exteriorAlignment.remote.js'
const assetId = 'e8c82269-17f2-4864-bba2-6aba5ba0ed72'
const identity = { locationId: 'building', assetId, geometryId: assetId }
const alignment = {
  frontViewId: 'view-2',
  lines: [
    {
      id: 'base',
      elevation: 1,
      locked: true,
      designation: { type: 'ground' as const, number: 1, name: '大堂' },
    },
    { id: 'top', elevation: 8, locked: false },
  ],
}
let db: DatabaseSync
beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec(
    "CREATE TABLE location(id TEXT PRIMARY KEY); INSERT INTO location VALUES('building'); CREATE TABLE locationExteriorModel(locationId TEXT,assetId TEXT);",
  )
  db.exec(readFileSync('migrations/0269_location_exterior_alignment.sql', 'utf8'))
  db.prepare('INSERT INTO locationExteriorModel VALUES(?,?)').run(
    identity.locationId,
    assetId,
  )
  mocks.ctx.user.superAdmin = true
  mocks.ctx.db.get.mockImplementation(q => {
    const { sql, params } = new SQLiteSyncDialect().sqlToQuery(q)
    return db.prepare(sql).get(...(params as never[]))
  })
})
afterEach(() => db.close())
it('appends attributed versions and rejects competing saves and a replaced model', async () => {
  expect(await getExteriorAlignment(identity)).toBeNull()
  const first = { ...identity, alignment, expectedRevision: 0 }
  expect(await saveExteriorAlignment(first)).toEqual({ revision: 1 })
  await expect(saveExteriorAlignment(first)).rejects.toMatchObject({ status: 409 })
  expect(await getExteriorAlignment(identity)).toEqual({ ...alignment, revision: 1 })
  expect(await saveExteriorAlignment({ ...first, expectedRevision: 1 })).toEqual({
    revision: 2,
  })
  expect(db.prepare('SELECT actorId FROM locationExteriorAlignment').all()).toEqual([
    { actorId: 'reviewer' },
    { actorId: 'reviewer' },
  ])
  db.exec("UPDATE locationExteriorModel SET assetId='replacement'")
  await expect(
    saveExteriorAlignment({ ...first, expectedRevision: 2 }),
  ).rejects.toMatchObject({ status: 409 })
  expect(await getExteriorAlignment(identity)).toBeNull()
})
it('checks editing authority, active comparison and strictly ordered boundaries', async () => {
  mocks.ctx.user.superAdmin = false
  const input = { ...identity, alignment, expectedRevision: 0 }
  await expect(saveExteriorAlignment(input)).rejects.toMatchObject({ status: 403 })
  mocks.ctx.user.superAdmin = true
  mocks.current.mockResolvedValue(null)
  await expect(
    saveExteriorAlignment({
      ...input,
      geometryId: 'comparison-' + 'a'.repeat(64) + '.glb',
    }),
  ).rejects.toMatchObject({ status: 409 })
  await expect(async () =>
    saveExteriorAlignment({
      ...input,
      alignment: { ...alignment, lines: [...alignment.lines].reverse() },
    }),
  ).rejects.toThrow()
  expect(await getExteriorAlignment(identity)).toBeNull()
})
