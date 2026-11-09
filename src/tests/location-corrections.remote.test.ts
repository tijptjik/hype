// @vitest-environment node
// TESTS
import { beforeEach, expect, it, vi } from 'vitest'
import { withRemoteMeta } from './remote-function-mock'
// DRIZZLE
import { sql } from 'drizzle-orm'

const mocks = vi.hoisted(() => ({
  probe: vi.fn(),
  owner: vi.fn(),
  edit: vi.fn(),
  manage: vi.fn(),
  requireManager: vi.fn(),
  sharedRights: vi.fn(),
  apply: vi.fn(),
  propose: vi.fn(),
  decide: vi.fn(),
  context: vi.fn(),
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
          user: { id: 'session-actor' },
          userRoles: [],
        }),
      'command',
    )
  return { guardedQuery: remote, guardedCommand: remote }
})
vi.mock('#lib/db/services/feature.js', () => ({ probeFeatureForUpdate: mocks.probe }))
vi.mock('#lib/db/services/organisation.js', () => ({
  probeOrganisationQuery: mocks.owner,
}))
vi.mock('#lib/db/services/featureCommandScope.js', () => ({
  buildFeatureCommandScopeGuard: () => sql`1`,
}))
vi.mock('#lib/api/services/authz', () => ({
  authorizeFeatureUpdateForSubmission: mocks.edit,
  authorizeOrganisationUpdateForSubmission: mocks.manage,
}))
vi.mock('#lib/api/services/locationOwnership', () => ({
  requireLocationOrganisationManager: mocks.requireManager,
  sharedLocationEditRights: mocks.sharedRights,
}))
vi.mock('#lib/db/services/locationCorrectionReview.js', () => ({
  applyLocationCorrection: mocks.apply,
  proposeLocationCorrection: mocks.propose,
  decideLocationCorrection: mocks.decide,
  readLocationCorrectionContext: mocks.context,
}))
import {
  submitLocationCorrection,
  reviewLocationCorrection,
} from '#lib/api/locationCorrections.remote.js'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.sharedRights.mockResolvedValue({ canEdit: false, superAdmin: false })
  mocks.probe.mockResolvedValue({
    id: 'feature',
    organisationId: 'persisted-org',
    projectId: 'project',
    layerId: 'layer',
    resourceHubId: null,
  })
  mocks.owner.mockResolvedValue({ id: 'persisted-org' })
  mocks.edit.mockReturnValue({ allowed: true })
  mocks.manage.mockReturnValue({ allowed: false })
  mocks.propose.mockResolvedValue('proposal')
  mocks.decide.mockResolvedValue(true)
})
const submission = {
  featureId: 'feature',
  expectedAssociationVersion: 'association',
  expectedOrganisationRevision: null,
  patch: { names: { en: { mode: 'override' as const, value: 'Corrected name' } } },
  reason: 'Name correction',
}
const review = {
  featureId: 'feature',
  proposalId: 'proposal',
  outcome: 'accepted' as const,
  reason: 'Verified separately',
}

it('submits under persisted ancestry and session attribution without approving the correction', async () => {
  expect(await submitLocationCorrection(submission)).toEqual({
    id: 'proposal',
    status: 'submitted',
  })
  expect(mocks.propose).toHaveBeenCalledWith(
    {},
    expect.objectContaining({
      organisationId: 'persisted-org',
      actorId: 'session-actor',
    }),
  )
  expect(mocks.decide).not.toHaveBeenCalled()
  expect(mocks.requireManager).not.toHaveBeenCalled()
})
it('denies shared facts outside field-edit authority before persistence', async () => {
  mocks.edit.mockImplementation(({ submittedData }) => ({
    allowed: !submittedData.properties,
  }))
  await expect(
    submitLocationCorrection({
      ...submission,
      patch: { phoneNumber: { mode: 'override', value: ['+85221234567'] } },
    }),
  ).rejects.toMatchObject({ status: 403 })
  expect(mocks.propose).not.toHaveBeenCalled()
})
it('requires scoped reviewer authority and passes separate Organisation rights to the field router', async () => {
  await expect(reviewLocationCorrection(review)).rejects.toMatchObject({ status: 403 })
  expect(mocks.decide).not.toHaveBeenCalled()
  mocks.sharedRights.mockResolvedValue({ canEdit: true, superAdmin: false })
  expect(await reviewLocationCorrection(review)).toEqual({ outcome: 'accepted' })
  expect(mocks.decide).toHaveBeenCalledWith(
    {},
    expect.objectContaining({
      canEditOrganisation: false,
      sharedRights: { canEdit: true, superAdmin: false },
      actorId: 'session-actor',
    }),
  )
})
it('reports a stale correction without a false success acknowledgement', async () => {
  mocks.manage.mockReturnValue({ allowed: true })
  mocks.decide.mockResolvedValue(false)
  await expect(reviewLocationCorrection(review)).rejects.toMatchObject({ status: 409 })
})

it('saves an authorised Organisation manager correction immediately', async () => {
  mocks.manage.mockReturnValue({ allowed: true })
  mocks.apply.mockResolvedValue('accepted-revision')
  expect(await submitLocationCorrection(submission)).toEqual({
    status: 'accepted',
    revisionId: 'accepted-revision',
  })
  expect(mocks.requireManager).toHaveBeenCalledWith(expect.anything(), 'persisted-org')
  expect(mocks.apply).toHaveBeenCalledWith(
    {},
    expect.objectContaining({
      organisationId: 'persisted-org',
      actorId: 'session-actor',
    }),
  )
  expect(mocks.propose).not.toHaveBeenCalled()
  expect(mocks.decide).not.toHaveBeenCalled()
})
it('does not queue a proposal when a direct shared save is stale or loses authority', async () => {
  mocks.manage.mockReturnValue({ allowed: true })
  mocks.apply.mockResolvedValue(null)
  await expect(submitLocationCorrection(submission)).rejects.toMatchObject({
    status: 409,
  })
  mocks.requireManager.mockRejectedValueOnce(new Error('Permission revoked'))
  await expect(submitLocationCorrection(submission)).rejects.toThrow(
    'Permission revoked',
  )
  expect(mocks.apply).toHaveBeenCalledTimes(1)
  expect(mocks.propose).not.toHaveBeenCalled()
})

it('saves project-authorized phones as shared corrections without Organisation approval', async () => {
  mocks.sharedRights.mockResolvedValue({ canEdit: true, superAdmin: false })
  mocks.apply.mockResolvedValue('shared-revision')
  expect(
    await submitLocationCorrection({
      ...submission,
      patch: { phoneNumber: { mode: 'override', value: ['+85221234567'] } },
    }),
  ).toEqual({ status: 'accepted', revisionId: 'shared-revision' })
  expect(mocks.requireManager).not.toHaveBeenCalled()
  expect(mocks.propose).not.toHaveBeenCalled()
})
