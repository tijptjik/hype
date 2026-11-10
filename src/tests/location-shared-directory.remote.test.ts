// @vitest-environment node
// TESTS
import { beforeEach, expect, it, vi } from 'vitest'
import { withRemoteMeta } from './remote-function-mock'
const mocks = vi.hoisted(() => ({
  superAdmin: false,
  prepare: vi.fn(),
  batch: vi.fn(),
  propagate: vi.fn(),
}))
vi.mock('#lib/api/server/guarded.js', () => {
  const remote = (
    schema: { parse: (value: unknown) => unknown },
    handler: (value: unknown, ctx: unknown) => unknown,
  ) =>
    withRemoteMeta(
      async (value: unknown) =>
        handler(schema.parse(value), {
          db: {},
          user: { id: 'actor', isAnonymous: false, superAdmin: mocks.superAdmin },
        }),
      'command',
    )
  return { guardedCommand: remote, guardedQuery: remote }
})
vi.mock('#lib/db/services/locationShared.js', () => ({
  prepareSharedLocationCorrection: mocks.prepare,
  readSharedLocationCorrection: vi.fn(),
}))
vi.mock('#lib/db/services/locationStaffPropagation.js', () => ({
  prepareStaffLocationPropagation: mocks.propagate,
}))
vi.mock('#lib/db/services/revisionBatch.js', () => ({
  executeRevisionBatch: mocks.batch,
  prepareRevisionCheck: vi.fn(),
}))
import { saveSharedLocationDirectoryCorrection } from '#lib/api/locationShared.remote.js'
const input = {
  locationId: 'location',
  sourceRevisionId: 'source',
  expectedRevision: null,
  patch: { names: { mode: 'override' as const, value: { en: 'Corrected name' } } },
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.superAdmin = false
  mocks.prepare.mockResolvedValue({ id: 'shared', guard: {}, queries: [] })
  mocks.batch.mockResolvedValue([])
  mocks.propagate.mockResolvedValue({
    guard: {},
    statements: [],
    featureIds: ['feature'],
  })
})
it('rejects non-SuperAdmin before any shared directory write', async () => {
  await expect(saveSharedLocationDirectoryCorrection(input)).rejects.toMatchObject({
    status: 403,
  })
  expect(mocks.prepare).not.toHaveBeenCalled()
})
it('attributes SuperAdmin edits and preserves displayed revision fences', async () => {
  mocks.superAdmin = true
  expect(await saveSharedLocationDirectoryCorrection(input)).toEqual({
    revisionId: 'shared',
  })
  expect(mocks.prepare).toHaveBeenCalledWith(
    {},
    expect.objectContaining({
      ...input,
      actorId: 'actor',
      rights: { canEdit: true, superAdmin: true },
    }),
  )
})

it('propagates only the explicitly authorized fields before completing Save', async () => {
  mocks.superAdmin = true
  await saveSharedLocationDirectoryCorrection(input)
  expect(mocks.propagate).toHaveBeenCalledWith(
    {},
    expect.objectContaining({
      locationId: 'location',
      sourceRevisionId: 'source',
      sharedRevisionId: 'shared',
      actorId: 'actor',
      fields: ['names'],
    }),
  )
})
