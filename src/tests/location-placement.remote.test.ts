// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { withRemoteMeta, mockedRemoteModule } from './remote-function-mock'
const mocks = vi.hoisted(() => ({
  probe: vi.fn(),
  authorize: vi.fn(),
  read: vi.fn(),
  decide: vi.fn(),
  schedule: vi.fn(),
}))
vi.mock('#lib/api/server/guarded.js', () => {
  const wrap = (
    schema: { parse: (v: unknown) => unknown },
    handler: (v: unknown, ctx: unknown) => Promise<unknown>,
  ) =>
    withRemoteMeta(
      async (v: unknown) =>
        handler(schema.parse(v), {
          db: {},
          user: { id: 'reviewer' },
          userRoles: [],
          event: { locals: { platform: {} } },
        }),
      'command',
    )
  return { guardedCommand: wrap, guardedQuery: wrap }
})
vi.mock('#lib/db/services/feature.js', () => ({ probeFeatureQuery: mocks.probe }))
vi.mock('#lib/api/services/authz/index.js', () => ({
  authorizeFeatureUpdateForSubmission: mocks.authorize,
}))
vi.mock('#lib/db/services/locationAdoptionReview.js', () => ({
  readLocationAdoptionReview: mocks.read,
  listLocationAdoptionReviews: vi.fn(),
  proposeFeatureLocationAdoption: vi.fn(),
  proposeLatestLocalLocationAdoption: vi.fn(),
  rejectLocationAdoptionGroup: vi.fn(),
}))
vi.mock('#lib/db/services/locationPlacement.js', () => ({
  decideLocationPlacement: mocks.decide,
  proposeLocationPlacement: vi.fn(),
}))
vi.mock('#lib/db/services/locationAdoptionApply.js', () => ({
  applyLocationAdoptionGroup: vi.fn(),
}))
vi.mock('#lib/api/services/feature-mtr.js', () => ({
  scheduleFeatureMtr: mocks.schedule,
}))
import * as module from '#lib/api/locationReview.remote.js'
const remote = mockedRemoteModule(module)
const input = {
  featureId: 'f',
  proposalId: 'proposal',
  expectedRevision: 'binding',
  expectedFeatureModifiedAt: 'date',
  reason: 'Reviewed move',
  decision: { action: 'move' as const },
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.probe.mockResolvedValue({ id: 'f', projectId: 'persisted-project' })
  mocks.authorize.mockReturnValue({ allowed: true })
  mocks.read.mockResolvedValue({})
  mocks.decide.mockResolvedValue({ status: 'applied', geometryChanged: true })
})
it('derives author and scope on the server and schedules routing only after a committed move', async () => {
  await remote.decideFeaturePlacement(input)
  expect(mocks.decide).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ projectId: 'persisted-project', actorId: 'reviewer' }),
  )
  expect(mocks.schedule).toHaveBeenCalledWith(expect.anything(), 'f')
})
it('rejects unauthorized callers before reading evidence or moving anything', async () => {
  mocks.authorize.mockReturnValue({ allowed: false, code: 'FIELD_FORBIDDEN' })
  await expect(remote.decideFeaturePlacement(input)).rejects.toMatchObject({
    status: 403,
  })
  expect(mocks.read).not.toHaveBeenCalled()
  expect(mocks.decide).not.toHaveBeenCalled()
})
it('rejects injected scope and returns stale conflicts without scheduling routing', async () => {
  await expect(
    remote.decideFeaturePlacement({ ...input, projectId: 'foreign' } as never),
  ).rejects.toThrow()
  expect(mocks.probe).not.toHaveBeenCalled()
  mocks.decide.mockResolvedValue({ status: 'conflict' })
  await expect(remote.decideFeaturePlacement(input)).rejects.toMatchObject({
    status: 409,
  })
  expect(mocks.schedule).not.toHaveBeenCalled()
})
it('does not expose inaccessible placement proposals', async () => {
  mocks.read.mockResolvedValue(null)
  await expect(remote.decideFeaturePlacement(input)).rejects.toMatchObject({
    status: 404,
  })
  expect(mocks.decide).not.toHaveBeenCalled()
})
