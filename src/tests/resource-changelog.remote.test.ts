// @vitest-environment node
// TESTS
import { beforeEach, expect, it, vi } from 'vitest'
const {
  organisation,
  project,
  layer,
  history,
  access,
  names,
  readCheck,
  saveCheck,
  rootGuard,
} = vi.hoisted(() => ({
  organisation: vi.fn(),
  project: vi.fn(),
  layer: vi.fn(),
  history: vi.fn(),
  access: vi.fn(),
  names: vi.fn(),
  readCheck: vi.fn(),
  saveCheck: vi.fn(),
  rootGuard: vi.fn(),
}))
vi.mock('#lib/api/server/guarded.js', () => ({
  guardedCommand: (
    schema: { parse(value: unknown): unknown },
    handler: (input: unknown, ctx: unknown) => unknown,
  ) =>
    Object.assign((input: unknown, ctx: unknown) => handler(schema.parse(input), ctx), {
      __: { type: 'command' },
    }),
  guardedQuery: (
    schema: { parse(value: unknown): unknown },
    handler: (input: unknown, ctx: unknown) => unknown,
  ) =>
    Object.assign((input: unknown, ctx: unknown) => handler(schema.parse(input), ctx), {
      __: { type: 'query' },
    }),
}))
vi.mock('#lib/db/services/organisation.js', () => ({
  probeOrganisationQuery: organisation,
}))
vi.mock('#lib/db/services/project.js', () => ({ probeProjectQuery: project }))
vi.mock('#lib/db/services/layer.js', () => ({ probeLayerForUpdate: layer }))
vi.mock('#lib/db/services/resourceChangelog.js', () => ({
  listResourceChangelog: history,
  buildChangelogRootGuard: rootGuard,
}))
vi.mock('#lib/db/services/userResourceCheckpoint.js', () => ({
  readUserResourceCheckpoint: readCheck,
  saveUserResourceCheckpoint: saveCheck,
}))
vi.mock('#lib/properties/audience.server.js', () => ({
  getInternalPropertyAccess: access,
}))
// API
import {
  getResourceChangelog,
  markResourceChangelogChecked,
} from '#lib/api/resourceChangelog.remote.js'
// TYPES
import type { ChangelogCandidate } from '#lib/db/services/resourceChangelog.js'

const read = getResourceChangelog as unknown as (
  input: unknown,
  ctx: unknown,
) => Promise<unknown>
const mark = markResourceChangelogChecked as unknown as (
  input: unknown,
  ctx: unknown,
) => Promise<unknown>
const persistedGuard = { serverBuiltGuard: true }
const actor = {
  user: { id: 'editor', isAnonymous: false },
  userRoles: [{ type: 'organisation', organisationId: 'o', role: 'owner' }],
}
beforeEach(() => {
  vi.clearAllMocks()
  rootGuard.mockReturnValue(persistedGuard)
  readCheck.mockResolvedValue(null)
  saveCheck.mockResolvedValue('2026-11-06T06:00:00.000Z')
  organisation.mockResolvedValue({ id: 'o', hubId: 'h' })
  project.mockResolvedValue({ id: 'p', organisationId: 'o', hubId: 'h' })
  layer.mockResolvedValue({ id: 'l', organisationId: 'o', projectId: 'p', hubId: 'h' })
  history.mockResolvedValue({ entries: [], nextCursor: null, unavailable: [] })
  access.mockResolvedValue({ internal: new Set(['private']), allowed: new Set() })
  names.mockResolvedValue([
    { locale: 'en', name: 'English' },
    { locale: 'zh-hant', name: '中文' },
  ])
})

it.each(['organisation', 'project', 'layer'])(
  'denies ordinary users and unrelated owners for %s',
  async resource => {
    for (const userRoles of [
      [],
      [{ type: 'organisation', organisationId: 'other', role: 'owner' }],
    ]) {
      await expect(
        read(
          { resource, ref: 'route', locale: 'en' },
          { db: { all: names }, user: actor.user, userRoles },
        ),
      ).rejects.toMatchObject({ status: 403 })
    }
    expect(history).not.toHaveBeenCalled()
  },
)

it.each(['organisation', 'project', 'layer'])(
  'authorizes persisted %s ancestry and localizes the owner',
  async resource => {
    const result = await read(
      { resource, ref: 'route', locale: 'zhHant', meta: { isAdminRequest: true } },
      { db: { all: names }, ...actor },
    )
    expect(result).toMatchObject({ owner: { name: '中文' } })
    const input = history.mock.calls[0][1]
    expect(input.scope).toEqual({
      resource,
      id: resource === 'organisation' ? 'o' : resource === 'project' ? 'p' : 'l',
      organisationId: 'o',
      hubId: 'h',
      ...(resource === 'organisation' ? {} : { projectId: 'p' }),
    })
    expect(input.internalIds).toEqual(new Set(['private']))
    const candidate = {
      resourceType: 'feature',
      resourceId: 'f',
      ownerType: 'feature',
      ownerId: 'f',
      category: 'publication',
      organisationId: 'o',
      projectId: 'p',
      layerId: 'l',
      hubId: 'h',
      isArchived: 0,
    } as ChangelogCandidate
    expect(input.authorize(candidate)).toBe(true)
    expect(input.authorize({ ...candidate, organisationId: 'other' })).toBe(false)
  },
)

it('rejects caller-supplied ancestry and task sources', () => {
  expect(() => read({ resource: 'task', ref: 't', locale: 'en' }, {})).toThrow()
  expect(() =>
    read({ resource: 'layer', ref: 'l', locale: 'en', organisationId: 'o' }, {}),
  ).toThrow()
  expect(history).not.toHaveBeenCalled()
})

it.each(['organisation', 'project', 'layer'])(
  "stores the current user's progress only after %s authorization",
  async resource => {
    const checkedThrough = '2026-11-06T05:00:00.000Z'
    await expect(
      mark(
        { resource, ref: 'route', checkedThrough },
        { db: {}, user: actor.user, userRoles: [] },
      ),
    ).rejects.toMatchObject({ status: 403 })
    expect(saveCheck).not.toHaveBeenCalled()
    await mark({ resource, ref: 'route', checkedThrough }, { db: {}, ...actor })
    expect(saveCheck).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        userId: 'editor',
        checkedThrough,
        resourceType: resource,
        resourceId:
          resource === 'organisation' ? 'o' : resource === 'project' ? 'p' : 'l',
        checkpointKind: 'changelog',
        guard: persistedGuard,
      }),
    )
  },
)

it('returns the previous checkpoint while keeping reads free of progress writes', async () => {
  readCheck.mockResolvedValue('2026-11-05T06:00:00.000Z')
  const result = await read(
    { resource: 'layer', ref: 'route', locale: 'en' },
    { db: { all: names }, ...actor },
  )
  expect(result).toMatchObject({
    checkpoint: {
      lastCheckedAt: '2026-11-05T06:00:00.000Z',
      checkedThrough: expect.any(String),
    },
  })
  expect(rootGuard).toHaveBeenCalledWith({
    resource: 'layer',
    id: 'l',
    projectId: 'p',
    organisationId: 'o',
    hubId: 'h',
  })
  expect(readCheck).toHaveBeenCalledWith(expect.anything(), {
    userId: 'editor',
    resourceType: 'layer',
    resourceId: 'l',
    checkpointKind: 'changelog',
    guard: persistedGuard,
  })
  expect(saveCheck).not.toHaveBeenCalled()
})

it('rejects another user identity, client ancestry, and invalid cutoffs on progress writes', () => {
  const input = {
    resource: 'layer',
    ref: 'route',
    checkedThrough: '2026-11-06T05:00:00.000Z',
  }
  expect(() => mark({ ...input, userId: 'other' }, {})).toThrow()
  expect(() => mark({ ...input, checkpointKind: 'other' }, {})).toThrow()
  expect(() =>
    read(
      { resource: 'layer', ref: 'route', locale: 'en', checkpointKind: 'other' },
      {},
    ),
  ).toThrow()
  expect(() => mark({ ...input, organisationId: 'other' }, {})).toThrow()
  expect(() => mark({ ...input, checkedThrough: 'invalid' }, {})).toThrow()
  expect(saveCheck).not.toHaveBeenCalled()
})

it('does not save progress after the resource moves out of the authorized ancestry', async () => {
  saveCheck.mockResolvedValue(null)
  await expect(
    mark(
      { resource: 'layer', ref: 'route', checkedThrough: '2026-11-06T05:00:00.000Z' },
      { db: {}, ...actor },
    ),
  ).rejects.toMatchObject({ status: 409 })
})
