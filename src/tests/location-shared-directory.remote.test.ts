// @vitest-environment node
// TESTS
import { beforeEach, expect, it, vi } from 'vitest'
import { withRemoteMeta } from './remote-function-mock'
const mocks = vi.hoisted(() => ({
  superAdmin: false,
  probe: vi.fn(),
  draftSave: vi.fn(),
  prepare: vi.fn(),
  batch: vi.fn(),
  propagate: vi.fn(),
  authorize: vi.fn(),
}))
vi.mock('#lib/db/services/locationIdentityReview.js', () => ({
  probeLocationIdentityScope: mocks.probe,
}))
vi.mock('#lib/db/services/locationCanonicalDraft.js', () => ({
  updateCanonicalLocationDraft: mocks.draftSave,
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
vi.mock('#lib/api/services/locationOwnership', () => ({
  requireLocationOrganisationManager: mocks.authorize,
}))
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
  mocks.probe.mockResolvedValue({
    state: 'linked',
    ssId: 'upstream',
    ownerOrganisationId: null,
  })
  mocks.superAdmin = false
  mocks.prepare.mockResolvedValue({
    id: 'shared',
    guard: {},
    queries: [],
    fields: ['names'],
  })
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

it('allows an Organisation manager to contribute a name and checks persisted authority', async () => {
  await saveSharedLocationDirectoryCorrection({ ...input, organisationId: 'org' })
  expect(mocks.authorize).toHaveBeenCalledWith(expect.anything(), 'org')
  expect(mocks.prepare).toHaveBeenCalledWith(
    {},
    expect.objectContaining({ rights: { canEdit: true, superAdmin: false } }),
  )
})
it('rejects an unauthorized Organisation before preparing community writes', async () => {
  mocks.authorize.mockRejectedValue(new Error('INSUFFICIENT_ROLE'))
  await expect(
    saveSharedLocationDirectoryCorrection({ ...input, organisationId: 'other' }),
  ).rejects.toThrow('INSUFFICIENT_ROLE')
  expect(mocks.prepare).not.toHaveBeenCalled()
})

it('rejects draft writes by Organisation managers and requires a fresh draft token', async () => {
  mocks.probe.mockResolvedValue({
    state: 'unresolved',
    ssId: null,
    ownerOrganisationId: null,
  })
  await expect(
    saveSharedLocationDirectoryCorrection({
      ...input,
      organisationId: 'org',
      expectedDraftVersion: 'hash',
    }),
  ).rejects.toMatchObject({ status: 403 })
  mocks.superAdmin = true
  await expect(saveSharedLocationDirectoryCorrection(input)).rejects.toMatchObject({
    status: 409,
  })
  expect(mocks.prepare).not.toHaveBeenCalled()
})

it('saves draft facts without retaining shared or Feature history', async () => {
  mocks.superAdmin = true
  mocks.probe.mockResolvedValue({
    state: 'unresolved',
    ssId: null,
    ownerOrganisationId: null,
  })
  mocks.draftSave.mockResolvedValue('next-hash')
  expect(
    await saveSharedLocationDirectoryCorrection({
      ...input,
      expectedDraftVersion: 'hash',
    }),
  ).toEqual({ revisionId: 'source', draftVersion: 'next-hash' })
  expect(mocks.draftSave).toHaveBeenCalledWith(
    {},
    expect.objectContaining({ expectedDraftVersion: 'hash' }),
  )
  expect(mocks.batch).not.toHaveBeenCalled()
  expect(mocks.propagate).not.toHaveBeenCalled()
})
