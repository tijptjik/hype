// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withRemoteMeta } from './remote-function-mock'
import { DEFAULT_PROJECT_PLACE_POLICY } from '#lib/places/model.js'

const mocks = vi.hoisted(() => ({
  createPlace: vi.fn(),
  probeProject: vi.fn(),
  probeFeature: vi.fn(),
  authorizeProject: vi.fn(),
  authorizeFeature: vi.fn(),
  readPolicy: vi.fn(),
  savePolicy: vi.fn(),
  readPlace: vi.fn(),
  context: { db: {}, user: { id: 'u' }, userRoles: [] },
}))
vi.mock('#lib/api/server/guarded.js', () => {
  const wrap =
    (kind: 'query' | 'command') =>
    (
      schema: { parse: (value: unknown) => unknown },
      handler: (value: unknown, ctx: unknown) => Promise<unknown>,
    ) =>
      withRemoteMeta(
        async (input: unknown) => handler(schema.parse(input), mocks.context),
        kind,
      )
  return { guardedQuery: wrap('query'), guardedCommand: wrap('command') }
})
vi.mock('#lib/db/services/placeLocal.js', () => ({
  createLocalPlace: mocks.createPlace,
}))
vi.mock('#lib/db/services/project.js', () => ({
  probeProjectQuery: mocks.probeProject,
}))
vi.mock('#lib/db/services/feature.js', () => ({
  probeFeatureQuery: mocks.probeFeature,
}))
vi.mock('#lib/db/services/place.js', () => ({
  getProjectPlaceSettings: mocks.readPolicy,
  saveProjectPlaceSettings: mocks.savePolicy,
  getAcceptedFeaturePlace: mocks.readPlace,
}))
vi.mock('#lib/api/services/authz/index.js', () => ({
  authorizeProjectUpdateForSubmission: mocks.authorizeProject,
  authorizeFeatureReadForProbe: mocks.authorizeFeature,
}))
import {
  createLocalPlace,
  getFeaturePlace,
  getPlaceUpdatePolicy,
  setPlaceUpdatePolicy,
} from '#lib/api/place.remote.js'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.probeProject.mockResolvedValue({ id: 'p', organisationId: 'org', hubId: 'hub' })
  mocks.probeFeature.mockResolvedValue({ id: 'f', projectId: 'p' })
  mocks.authorizeProject.mockReturnValue({ allowed: true })
  mocks.authorizeFeature.mockReturnValue({ allowed: true })
  mocks.readPolicy.mockResolvedValue({
    policy: DEFAULT_PROJECT_PLACE_POLICY,
    revision: 0,
  })
  mocks.savePolicy.mockResolvedValue({
    policy: DEFAULT_PROJECT_PLACE_POLICY,
    revision: 1,
  })
  mocks.readPlace.mockResolvedValue({ placeId: 'place' })
})

describe('Place remote boundaries', () => {
  it('authorizes persisted project scope before reading settings', async () => {
    mocks.authorizeProject.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })
    await expect(getPlaceUpdatePolicy({ projectId: 'p' })).rejects.toMatchObject({
      status: 403,
    })
    expect(mocks.readPolicy).not.toHaveBeenCalled()
    expect(mocks.authorizeProject).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: { id: 'p', organisationId: 'org', hubId: 'hub' },
        submittedData: { placeUpdatePolicy: true },
      }),
    )
  })
  it('does not write for unauthorized or missing projects', async () => {
    const input = {
      projectId: 'p',
      policy: DEFAULT_PROJECT_PLACE_POLICY,
      expectedRevision: 0,
    }
    mocks.authorizeProject.mockReturnValue({ allowed: false })
    await expect(setPlaceUpdatePolicy(input)).rejects.toMatchObject({ status: 403 })
    mocks.probeProject.mockResolvedValue(null)
    await expect(setPlaceUpdatePolicy(input)).rejects.toMatchObject({ status: 404 })
    expect(mocks.savePolicy).not.toHaveBeenCalled()
  })
  it('rejects invalid policies before persistence and reports stale saves', async () => {
    const input = {
      projectId: 'p',
      policy: DEFAULT_PROJECT_PLACE_POLICY,
      expectedRevision: 0,
    }
    await expect(
      setPlaceUpdatePolicy({ ...input, expectedRevision: -1 }),
    ).rejects.toThrow()
    expect(mocks.savePolicy).not.toHaveBeenCalled()
    mocks.savePolicy.mockResolvedValue(null)
    await expect(setPlaceUpdatePolicy(input)).rejects.toMatchObject({ status: 409 })
  })
  it('reads only after Feature authorization and uses persisted project ancestry', async () => {
    mocks.authorizeFeature.mockReturnValue({ allowed: false })
    await expect(getFeaturePlace({ featureId: 'f' })).rejects.toMatchObject({
      status: 403,
    })
    expect(mocks.readPlace).not.toHaveBeenCalled()
    mocks.authorizeFeature.mockReturnValue({ allowed: true })
    expect(await getFeaturePlace({ featureId: 'f' })).toEqual({ placeId: 'place' })
    expect(mocks.readPlace).toHaveBeenCalledWith(mocks.context.db, 'f', 'p')
  })
  it('returns null without loading a Place when the Feature is absent', async () => {
    mocks.probeFeature.mockResolvedValue(null)
    expect(await getFeaturePlace({ featureId: 'missing' })).toBeNull()
    expect(mocks.readPlace).not.toHaveBeenCalled()
  })
})

it('requires project management before local Place creation', async () => {
  const input = {
    projectId: 'p',
    state: 'manual' as const,
    facts: {
      names: { en: 'Shop' },
      phoneNumber: [],
      brands: [],
      location: {
        geometry: {
          type: 'Point' as const,
          coordinates: [114, 22] as [number, number],
        },
        address: {
          status: 'unresolved' as const,
          address2dId: null,
          address3dId: null,
          address3dUnitId: null,
          addressSnapshotId: null,
          records: {},
          fallbackDisplay: {},
        },
      },
    },
  }
  mocks.authorizeProject.mockReturnValue({ allowed: false })
  await expect(createLocalPlace(input)).rejects.toMatchObject({ status: 403 })
  expect(mocks.createPlace).not.toHaveBeenCalled()
  mocks.authorizeProject.mockReturnValue({ allowed: true })
  await createLocalPlace(input)
  expect(mocks.createPlace).toHaveBeenCalledWith(
    mocks.context.db,
    'p',
    expect.objectContaining({ state: 'manual' }),
    'u',
  )
})
