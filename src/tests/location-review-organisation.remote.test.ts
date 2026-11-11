// @vitest-environment node
// TESTS
import { beforeEach, expect, it, vi } from 'vitest'
import { withRemoteMeta } from './remote-function-mock'
const mocks = vi.hoisted(() => ({
  probe: vi.fn(),
  featureAuthority: vi.fn(),
  organisationAuthority: vi.fn(),
  accept: vi.fn(),
  keep: vi.fn(),
}))
vi.mock('#lib/api/server/guarded.js', () => {
  const remote = (
    schema: { parse(value: unknown): unknown },
    handler: (input: unknown, ctx: unknown) => unknown,
  ) =>
    withRemoteMeta(
      async (input: unknown) =>
        handler(schema.parse(input), {
          db: {},
          user: { id: 'reviewer' },
          userRoles: {},
          event: { locals: {} },
        }),
      'command',
    )
  return { guardedCommand: remote, guardedQuery: remote }
})
vi.mock('#lib/db/services/feature.js', () => ({ probeFeatureQuery: mocks.probe }))
vi.mock('#lib/api/services/authz/index.js', () => ({
  authorizeFeatureUpdateForSubmission: mocks.featureAuthority,
}))
vi.mock('#lib/api/services/locationOwnership.js', () => ({
  requireLocationOrganisationManager: mocks.organisationAuthority,
}))
vi.mock('#lib/db/services/locationAdoptionApply.js', () => ({
  applyLocationAdoptionGroup: mocks.accept,
}))
vi.mock('#lib/db/services/locationAdoptionReview.js', () => ({
  listLocationAdoptionReviews: vi.fn(),
  readLocationAdoptionReview: vi.fn(),
  proposeFeatureLocationAdoption: vi.fn(),
  proposeLatestLocalLocationAdoption: vi.fn(),
  rejectLocationAdoptionGroup: mocks.keep,
}))
vi.mock('#lib/db/services/locationPlacement.js', () => ({
  proposeLocationPlacement: vi.fn(),
  decideLocationPlacement: vi.fn(),
}))
vi.mock('#lib/api/services/feature-mtr.js', () => ({ scheduleFeatureMtr: vi.fn() }))
import {
  acceptFeatureLocationReview,
  rejectFeatureLocationReview,
} from '#lib/api/locationReview.remote.js'
const input = {
  featureId: 'feature',
  proposalId: 'proposal',
  fieldGroup: 'facts' as const,
  expectedRevision: 'association',
  expectedFeatureModifiedAt: 'now',
  reason: 'Reviewed',
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.probe.mockResolvedValue({
    projectId: 'persisted-project',
    organisationId: 'persisted-org',
  })
  mocks.featureAuthority.mockReturnValue({ allowed: true })
  mocks.accept.mockResolvedValue({
    status: 'applied',
    revision: 'new',
    feature: { id: 'feature', modifiedAt: 'later' },
    geometryChanged: false,
  })
  mocks.keep.mockResolvedValue({ action: 'rejected' })
})
it.each([acceptFeatureLocationReview, rejectFeatureLocationReview])(
  'requires Organisation authority before a decision affects sibling Projects',
  async command => {
    mocks.organisationAuthority.mockRejectedValue(new Error('INSUFFICIENT_ROLE'))
    await expect(command(input)).rejects.toThrow('INSUFFICIENT_ROLE')
    expect(mocks.accept).not.toHaveBeenCalled()
    expect(mocks.keep).not.toHaveBeenCalled()
  },
)
it('derives the Organisation and Project from persisted ancestry', async () => {
  await acceptFeatureLocationReview(input)
  expect(mocks.organisationAuthority).toHaveBeenCalledWith(
    expect.anything(),
    'persisted-org',
  )
  expect(mocks.accept).toHaveBeenCalledWith(
    {},
    expect.objectContaining({
      projectId: 'persisted-project',
      actorId: 'reviewer',
      mode: 'reviewed',
    }),
  )
})
