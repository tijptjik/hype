// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withRemoteMeta } from './remote-function-mock'
import type { UserRoleDisco } from '#lib/types.js'
import { DEFAULT_PROJECT_PLACE_POLICY } from '#lib/places/model.js'

const mocks = vi.hoisted(() => ({
  directory: vi.fn(),
  rejectIdentity: vi.fn(),
  rejectedSourceIds: vi.fn(),
  probeMergeSource: vi.fn(),
  probeMergeReview: vi.fn(),
  captureMerge: vi.fn(),
  readMerge: vi.fn(),
  applyMerge: vi.fn(),
  probeIdentity: vi.fn(),
  identityBaseline: vi.fn(),
  captureIdentity: vi.fn(),
  captureMirroredIdentity: vi.fn(),
  readIdentity: vi.fn(),
  acceptIdentity: vi.fn(),
  readSourcePage: vi.fn(),
  hydrateSource: vi.fn(),
  searchLocal: vi.fn(),
  listReviews: vi.fn(),
  readReview: vi.fn(),
  proposeReview: vi.fn(),
  rejectReview: vi.fn(),
  applyReview: vi.fn(),
  scheduleMtr: vi.fn(),
  resolveCandidate: vi.fn(),
  persistCandidate: vi.fn(),
  discoverPublication: vi.fn(),
  lookupSource: vi.fn(),
  searchPlaces: vi.fn(),
  createPlace: vi.fn(),
  relinkPlace: vi.fn(),
  unlinkPlace: vi.fn(),
  linkPlace: vi.fn(),
  authorizeFeatureUpdate: vi.fn(),
  probeProject: vi.fn(),
  probeOrganisation: vi.fn(),
  authorizeOrganisation: vi.fn(),
  probeFeature: vi.fn(),
  authorizeProject: vi.fn(),
  authorizeFeature: vi.fn(),
  readPolicy: vi.fn(),
  savePolicy: vi.fn(),
  readPlace: vi.fn(),
  readDetached: vi.fn(),
  context: {
    db: {},
    user: { id: 'u', isAnonymous: false },
    userRoles: [] as UserRoleDisco[],
    event: {
      locals: { platform: { env: { SAANSEOI_API_KEY: 'test-key' } } },
      fetch: vi.fn(),
    },
  },
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
vi.mock('#lib/db/services/placeIdentityRejection.js', () => ({
  rejectPlaceIdentityReview: mocks.rejectIdentity,
  rejectedFeaturePlaceSourceIds: mocks.rejectedSourceIds,
}))
vi.mock('#lib/db/services/placeMerge.js', () => ({
  probePlaceMergeSource: mocks.probeMergeSource,
  probePlaceMergeReview: mocks.probeMergeReview,
  capturePlaceMergeReview: mocks.captureMerge,
  readPlaceMergeReview: mocks.readMerge,
  applyPlaceMergeReview: mocks.applyMerge,
}))
vi.mock('#lib/db/services/placeIdentityReview.js', () => ({
  probePlaceIdentityScope: mocks.probeIdentity,
  readPlaceIdentityBaseline: mocks.identityBaseline,
  capturePlaceIdentityReview: mocks.captureIdentity,
  captureMirroredPlaceIdentityReview: mocks.captureMirroredIdentity,
  readPlaceIdentityReview: mocks.readIdentity,
  acceptPlaceIdentityReview: mocks.acceptIdentity,
}))
vi.mock('#lib/db/services/placeAdoptionReview.js', () => ({
  listPlaceAdoptionReviews: mocks.listReviews,
  readPlaceAdoptionReview: mocks.readReview,
  proposeFeaturePlaceAdoption: mocks.proposeReview,
  rejectPlaceAdoptionGroup: mocks.rejectReview,
}))
vi.mock('#lib/db/services/placeAdoptionApply.js', () => ({
  applyPlaceAdoptionGroup: mocks.applyReview,
}))
vi.mock('#lib/api/services/feature-mtr.js', () => ({
  scheduleFeatureMtr: mocks.scheduleMtr,
}))
vi.mock('#lib/places/sourceClient.js', async importOriginal => {
  const original = await importOriginal<typeof import('#lib/places/sourceClient.js')>()
  return {
    ...original,
    searchSaanSeoiPlaces: mocks.searchPlaces,
    readSaanSeoiPlacePage: mocks.readSourcePage,
  }
})
vi.mock('#lib/places/publication.js', () => ({
  discoverPlacePublication: mocks.discoverPublication,
}))
vi.mock('#lib/places/sourceAddress.js', () => ({
  hydrateSaanSeoiPlaceAddress: mocks.hydrateSource,
}))
vi.mock('#lib/places/sourceLookup.js', () => ({
  findSaanSeoiPlace: mocks.lookupSource,
}))
vi.mock('#lib/db/services/placeCandidate.js', () => ({
  resolvePlaceCandidate: mocks.resolveCandidate,
  persistPlaceCandidate: mocks.persistCandidate,
  searchLocalPlaceCandidates: mocks.searchLocal,
}))
vi.mock('#lib/db/services/placeUnlink.js', () => ({
  unlinkFeaturePlace: mocks.unlinkPlace,
}))
vi.mock('#lib/db/services/placeRelink.js', () => ({
  relinkFeaturePlace: mocks.relinkPlace,
}))
vi.mock('#lib/db/services/placeLink.js', () => ({
  linkInitialFeaturePlace: mocks.linkPlace,
}))
vi.mock('#lib/db/services/placeLocal.js', () => ({
  createLocalPlace: mocks.createPlace,
}))
vi.mock('#lib/db/services/organisation.js', () => ({
  probeOrganisationQuery: mocks.probeOrganisation,
}))
vi.mock('#lib/db/services/project.js', () => ({
  probeProjectQuery: mocks.probeProject,
}))
vi.mock('#lib/db/services/feature.js', () => ({
  probeFeatureQuery: mocks.probeFeature,
}))
vi.mock('#lib/db/services/placeDetached.js', () => ({
  getDetachedFeatureBrands: mocks.readDetached,
}))
vi.mock('#lib/db/services/place.js', () => ({
  getProjectPlaceSettings: mocks.readPolicy,
  saveProjectPlaceSettings: mocks.savePolicy,
  getAcceptedFeaturePlace: mocks.readPlace,
}))
vi.mock('#lib/api/services/authz/index.js', () => ({
  authorizeProjectUpdateForSubmission: mocks.authorizeProject,
  authorizeOrganisationUpdateForSubmission: mocks.authorizeOrganisation,
  authorizeFeatureReadForProbe: mocks.authorizeFeature,
  authorizeFeatureUpdateForSubmission: mocks.authorizeFeatureUpdate,
}))
import {
  searchFeatureLocalPlaces,
  getFeaturePlaceCandidate,
  importFeaturePlaceCandidate,
  searchFeaturePlaces,
  createLocalPlace,
  getLocalPlaceCreationAccess,
  relinkFeaturePlace,
  unlinkFeaturePlace,
  linkFeaturePlace,
  getFeaturePlace,
  getFeatureDetachedBrands,
  getPlaceUpdatePolicy,
  setPlaceUpdatePolicy,
} from '#lib/api/place.remote.js'

import {
  listFeaturePlaceReviews,
  getFeaturePlaceReview,
  reevaluateFeaturePlaceReview,
  rejectFeaturePlaceReview,
  acceptFeaturePlaceReview,
} from '#lib/api/placeReview.remote.js'

import {
  preparePlaceMergeReview,
  getPlaceMergeReview,
  acceptPlaceMergeReview,
  preparePlaceIdentityReview,
  prepareMirroredPlaceIdentityReview,
  getPlaceIdentityReviewAccess,
  getPlaceIdentityReview,
  acceptPlaceIdentityReview,
  rejectPlaceIdentityReview,
} from '#lib/api/placeIdentity.remote.js'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rejectedSourceIds.mockResolvedValue(new Set())
  mocks.rejectIdentity.mockResolvedValue({ status: 'rejected' })
  mocks.hydrateSource.mockImplementation(async (_client, projection) => projection)
  mocks.probeMergeSource.mockResolvedValue({ sourcePlaceId: 'source' })
  mocks.probeMergeReview.mockResolvedValue({ sourcePlaceId: 'source' })
  mocks.captureMerge.mockResolvedValue({
    status: 'ready',
    reviewId: 'merge',
    affectedFeatures: 2,
  })
  mocks.readMerge.mockResolvedValue({
    reviewId: 'merge',
    affectedFeatures: 2,
    visibility: 'private',
    stale: false,
    applied: false,
  })
  mocks.applyMerge.mockResolvedValue({
    status: 'applied',
    redirectId: 'redirect',
    affectedFeatures: 2,
  })
  mocks.context.user.isAnonymous = false
  mocks.context.userRoles = []
  mocks.probeIdentity.mockResolvedValue({ id: 'place', ownerOrganisationId: 'p' })
  mocks.identityBaseline.mockResolvedValue({
    placeId: 'place',
    expectedOwnerOrganisationId: 'p',
  })
  mocks.captureIdentity.mockResolvedValue('identity-review')
  mocks.captureMirroredIdentity.mockResolvedValue('mirrored-review')
  mocks.readIdentity.mockResolvedValue({ id: 'identity-review', stale: false })
  mocks.acceptIdentity.mockResolvedValue({
    status: 'applied',
    historyId: 'history',
    revisionId: 'source',
  })
  mocks.readSourcePage.mockResolvedValue({
    places: [{ ssId: 'candidate', facts: { names: { en: 'Shop' } } }],
    nextOffset: null,
    total: 1,
  })
  mocks.probeProject.mockResolvedValue({ id: 'p', organisationId: 'org', hubId: 'hub' })
  mocks.probeFeature.mockResolvedValue({ id: 'f', projectId: 'p' })
  mocks.authorizeOrganisation.mockReturnValue({ allowed: true })
  mocks.probeOrganisation.mockImplementation(async (_db, input) => ({
    id: input.ref,
    hubId: 'hub',
  }))
  mocks.authorizeProject.mockReturnValue({ allowed: true })
  mocks.authorizeFeature.mockReturnValue({ allowed: true })
  mocks.authorizeFeatureUpdate.mockReturnValue({ allowed: true })
  mocks.linkPlace.mockResolvedValue({ status: 'linked', revision: 'new' })
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
    mocks.authorizeFeatureUpdate.mockReturnValue({ allowed: true })
    mocks.linkPlace.mockResolvedValue({ status: 'linked', revision: 'new' })
    expect(await getFeaturePlace({ featureId: 'f' })).toEqual({ placeId: 'place' })
    expect(mocks.readPlace).toHaveBeenCalledWith(mocks.context.db, 'f', 'p')
  })
  it('returns null without loading a Place when the Feature is absent', async () => {
    mocks.probeFeature.mockResolvedValue(null)
    expect(await getFeaturePlace({ featureId: 'missing' })).toBeNull()
    expect(mocks.readPlace).not.toHaveBeenCalled()
  })
})

it('hides local creation for Project-only managers and rechecks Organisation authority', async () => {
  mocks.authorizeProject.mockReturnValue({ allowed: true })
  mocks.authorizeOrganisation.mockReturnValue({ allowed: false })
  expect(await getLocalPlaceCreationAccess({ projectId: 'p' })).toEqual({
    allowed: false,
  })
  mocks.authorizeOrganisation.mockReturnValue({ allowed: true })
  expect(await getLocalPlaceCreationAccess({ projectId: 'p' })).toEqual({
    allowed: true,
  })
  expect(mocks.probeOrganisation).toHaveBeenCalledWith(mocks.context.db, {
    ref: 'org',
    refKey: 'id',
  })
})

it('requires Organisation management before local Place creation', async () => {
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
  mocks.authorizeOrganisation.mockReturnValue({ allowed: false })
  await expect(createLocalPlace(input)).rejects.toMatchObject({ status: 403 })
  expect(mocks.createPlace).not.toHaveBeenCalled()
  mocks.authorizeOrganisation.mockReturnValue({ allowed: true })
  await createLocalPlace(input)
  expect(mocks.createPlace).toHaveBeenCalledWith(
    mocks.context.db,
    'org',
    expect.objectContaining({ state: 'manual' }),
    'u',
  )
})

describe('initial Place link command', () => {
  const input = {
    featureId: 'f',
    placeId: 'place',
    revisionId: 'revision',
    expectedFeatureModifiedAt: 'timestamp',
  }
  it('uses persisted ancestry and authorizes every inherited field group', async () => {
    expect(await linkFeaturePlace(input)).toEqual({ status: 'linked', revision: 'new' })
    expect(mocks.authorizeFeatureUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: { id: 'f', projectId: 'p' },
        submittedData: {
          i18n: true,
          properties: true,
          geometry: true,
          addressMeta: true,
        },
      }),
    )
    expect(mocks.linkPlace).toHaveBeenCalledWith(mocks.context.db, {
      ...input,
      projectId: 'p',
      actorId: 'u',
    })
  })
  it('rejects unauthorized links and client-supplied scope or baselines before writing', async () => {
    mocks.authorizeFeatureUpdate.mockReturnValue({
      allowed: false,
      code: 'FIELD_FORBIDDEN',
    })
    await expect(linkFeaturePlace(input)).rejects.toMatchObject({ status: 403 })
    await expect(
      linkFeaturePlace({ ...input, projectId: 'other' } as never),
    ).rejects.toThrow()
    await expect(
      linkFeaturePlace({ ...input, overrides: {} } as never),
    ).rejects.toThrow()
    expect(mocks.linkPlace).not.toHaveBeenCalled()
  })
  it.each([
    ['conflict', 409],
    ['place-unavailable', 404],
    ['ineligible', 422],
    ['review', 422],
  ] as const)('maps %s without leaking source records', async (status, httpStatus) => {
    mocks.linkPlace.mockResolvedValue({ status, reason: 'private' })
    await expect(linkFeaturePlace(input)).rejects.toMatchObject({ status: httpStatus })
  })
})

describe('Place source search authorization', () => {
  const input = { featureId: 'f', q: 'Shop', locale: 'en' as const }
  it('authorizes persisted Feature editing before making an external request', async () => {
    mocks.authorizeFeatureUpdate.mockReturnValue({ allowed: false })
    await expect(searchFeaturePlaces(input)).rejects.toMatchObject({ status: 403 })
    expect(mocks.searchPlaces).not.toHaveBeenCalled()
    mocks.probeFeature.mockResolvedValue(null)
    await expect(searchFeaturePlaces(input)).rejects.toMatchObject({ status: 404 })
    expect(mocks.searchPlaces).not.toHaveBeenCalled()
  })
  it('returns discovery candidates without creating or linking Places', async () => {
    mocks.searchPlaces.mockResolvedValue([{ placeId: 'ss-id' }])
    expect(await searchFeaturePlaces(input)).toEqual({
      source: 'saanseoi-latest',
      candidates: [{ placeId: 'ss-id' }],
    })
    expect(mocks.searchPlaces).toHaveBeenCalledWith(
      {
        baseUrl: 'https://api.saanseoi.hk',
        apiKey: 'test-key',
        fetch: mocks.context.event.fetch,
      },
      { q: 'Shop', locale: 'en', limit: 10 },
    )
    expect(mocks.createPlace).not.toHaveBeenCalled()
    expect(mocks.linkPlace).not.toHaveBeenCalled()
  })
  it.each(['id:ss-selected', 'ss-0006a46f-6276-5970-9e43-c962a2d535d6'])(
    'opens an exact source identity from %s without name search or persistence',
    async query => {
      const ssId = query.startsWith('id:') ? query.slice(3) : query
      mocks.rejectedSourceIds.mockResolvedValue(new Set([ssId]))
      mocks.discoverPublication.mockResolvedValue({
        pin: { releaseSet: 'release', catalogRevision: 'catalog', knownAt: 'time' },
      })
      mocks.lookupSource.mockResolvedValue({
        projection: {
          ssId,
          releaseId: 'resource-release',
          facts: {
            names: { en: 'Shop', 'zh-hant': '店' },
            brands: [
              { names: { en: 'First brand' } },
              { names: { en: 'Second brand' } },
            ],
          },
        },
      })
      expect(await searchFeaturePlaces({ ...input, q: query })).toEqual({
        source: 'saanseoi-latest',
        candidates: [
          {
            placeId: ssId,
            previouslyRejected: true,
            resourceReleaseId: 'resource-release',
            locale: 'en',
            nameText: 'Shop',
            brandText: 'First brand · Second brand',
          },
        ],
      })
      expect(mocks.lookupSource).toHaveBeenCalledWith(
        expect.anything(),
        { releaseSet: 'release', catalogRevision: 'catalog', knownAt: 'time' },
        ssId,
      )
      expect(mocks.searchPlaces).not.toHaveBeenCalled()
      expect(mocks.persistCandidate).not.toHaveBeenCalled()
      expect(mocks.linkPlace).not.toHaveBeenCalled()
      expect(mocks.captureIdentity).not.toHaveBeenCalled()
    },
  )
  it('authorizes exact-ID discovery before publication requests', async () => {
    mocks.authorizeFeatureUpdate.mockReturnValue({ allowed: false })
    await expect(
      searchFeaturePlaces({ ...input, q: 'id:ss-selected' }),
    ).rejects.toMatchObject({ status: 403 })
    expect(mocks.discoverPublication).not.toHaveBeenCalled()
    expect(mocks.lookupSource).not.toHaveBeenCalled()
  })
  it('distinguishes absent exact IDs from source failures without falling back to names', async () => {
    mocks.discoverPublication.mockResolvedValue({ pin: {} })
    mocks.lookupSource.mockResolvedValue(null)
    expect(await searchFeaturePlaces({ ...input, q: 'id:ss-missing' })).toEqual({
      source: 'saanseoi-latest',
      candidates: [],
    })
    mocks.lookupSource.mockRejectedValue(new Error('private upstream diagnostic'))
    await expect(
      searchFeaturePlaces({ ...input, q: 'id:ss-missing' }),
    ).rejects.toMatchObject({ status: 502, body: { message: 'PLACE_SEARCH_FAILED' } })
    expect(mocks.searchPlaces).not.toHaveBeenCalled()
  })
  it('rejects client source overrides and reports failures without leaking upstream details', async () => {
    await expect(
      searchFeaturePlaces({ ...input, baseUrl: 'https://other.example' } as never),
    ).rejects.toThrow()
    expect(mocks.searchPlaces).not.toHaveBeenCalled()
    mocks.searchPlaces.mockRejectedValue(new Error('private source diagnostic'))
    await expect(searchFeaturePlaces(input)).rejects.toMatchObject({
      status: 502,
      body: { message: 'PLACE_SEARCH_FAILED' },
    })
    mocks.context.event.locals.platform.env.SAANSEOI_API_KEY = ''
    try {
      await expect(searchFeaturePlaces(input)).rejects.toMatchObject({ status: 503 })
      expect(mocks.searchPlaces).toHaveBeenCalledTimes(1)
    } finally {
      mocks.context.event.locals.platform.env.SAANSEOI_API_KEY = 'test-key'
    }
  })
})

describe('source candidate resolution boundary', () => {
  const input = { featureId: 'f', ssId: 'ss-id', resourceReleaseId: 'release' }
  it('uses persisted project scope and returns explicit import-needed results', async () => {
    mocks.resolveCandidate.mockResolvedValue({ status: 'source-import-needed' })
    expect(await getFeaturePlaceCandidate(input)).toEqual({
      status: 'source-import-needed',
    })
    expect(mocks.resolveCandidate).toHaveBeenCalledWith(mocks.context.db, {
      projectId: 'p',
      ssId: 'ss-id',
      resourceReleaseId: 'release',
    })
    expect(mocks.createPlace).not.toHaveBeenCalled()
    expect(mocks.linkPlace).not.toHaveBeenCalled()
  })
  it('rejects forbidden editing and injected project scope before reading facts', async () => {
    mocks.authorizeFeatureUpdate.mockReturnValue({ allowed: false })
    await expect(getFeaturePlaceCandidate(input)).rejects.toMatchObject({ status: 403 })
    await expect(
      getFeaturePlaceCandidate({ ...input, projectId: 'other' } as never),
    ).rejects.toThrow()
    mocks.probeFeature.mockResolvedValue(null)
    await expect(getFeaturePlaceCandidate(input)).rejects.toMatchObject({ status: 404 })
    expect(mocks.resolveCandidate).not.toHaveBeenCalled()
  })
})

it('authorizes private local discovery using persisted scope before accessing facts', async () => {
  const input = { featureId: 'f', q: 'Shop' }
  mocks.authorizeFeatureUpdate.mockReturnValue({ allowed: false })
  await expect(searchFeatureLocalPlaces(input)).rejects.toMatchObject({ status: 403 })
  expect(mocks.searchLocal).not.toHaveBeenCalled()
  mocks.authorizeFeatureUpdate.mockReturnValue({ allowed: true })
  mocks.searchLocal.mockResolvedValue([])
  expect(await searchFeatureLocalPlaces(input)).toEqual([])
  expect(mocks.searchLocal).toHaveBeenCalledWith(mocks.context.db, {
    projectId: 'p',
    q: 'Shop',
  })
  await expect(
    searchFeatureLocalPlaces({ ...input, projectId: 'other' } as never),
  ).rejects.toThrow()
})

it('authorizes reassociation and derives actor/scope while retaining both concurrency tokens', async () => {
  const input = {
    featureId: 'f',
    placeId: 'next',
    revisionId: 'r',
    expectedRevision: 'old',
    expectedFeatureModifiedAt: 'timestamp',
  }
  mocks.authorizeFeatureUpdate.mockReturnValue({ allowed: false })
  await expect(relinkFeaturePlace(input)).rejects.toMatchObject({ status: 403 })
  expect(mocks.relinkPlace).not.toHaveBeenCalled()
  mocks.authorizeFeatureUpdate.mockReturnValue({ allowed: true })
  mocks.relinkPlace.mockResolvedValue({ status: 'linked', revision: 'new' })
  await relinkFeaturePlace(input)
  expect(mocks.relinkPlace).toHaveBeenCalledWith(mocks.context.db, {
    ...input,
    projectId: 'p',
    actorId: 'u',
  })
  mocks.relinkPlace.mockResolvedValue({ status: 'conflict' })
  await expect(relinkFeaturePlace(input)).rejects.toMatchObject({ status: 409 })
  await expect(
    relinkFeaturePlace({ ...input, actorId: 'someone-else' } as never),
  ).rejects.toThrow()
})

describe('detached Feature brand read boundary', () => {
  it('uses persisted scope and denies unauthorized reads before loading brands', async () => {
    mocks.authorizeFeature.mockReturnValue({ allowed: false, code: 'DENIED' })
    await expect(getFeatureDetachedBrands({ featureId: 'f' })).rejects.toMatchObject({
      status: 403,
    })
    expect(mocks.readDetached).not.toHaveBeenCalled()
    mocks.authorizeFeature.mockReturnValue({ allowed: true })
    mocks.readDetached.mockResolvedValue({ revision: 'detached', brands: [] })
    expect(await getFeatureDetachedBrands({ featureId: 'f' })).toEqual({
      revision: 'detached',
      brands: [],
    })
    expect(mocks.readDetached).toHaveBeenCalledWith(mocks.context.db, 'f', 'p')
    await expect(
      getFeatureDetachedBrands({ featureId: 'f', projectId: 'other' } as never),
    ).rejects.toThrow()
  })
})

describe('explicit unlink authorization', () => {
  const input = {
    featureId: 'f',
    expectedFeatureModifiedAt: 'seen',
    expectedRevision: 'seen-link',
  }
  it('requires all inherited-field permissions and derives actor and project', async () => {
    mocks.authorizeFeatureUpdate.mockReturnValue({ allowed: false, code: 'DENIED' })
    await expect(unlinkFeaturePlace(input)).rejects.toMatchObject({ status: 403 })
    expect(mocks.unlinkPlace).not.toHaveBeenCalled()
    mocks.authorizeFeatureUpdate.mockReturnValue({ allowed: true })
    mocks.unlinkPlace.mockResolvedValue({ status: 'unlinked', revision: 'detached' })
    await expect(unlinkFeaturePlace(input)).resolves.toMatchObject({
      status: 'unlinked',
    })
    expect(mocks.authorizeFeatureUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        submittedData: {
          i18n: true,
          properties: true,
          geometry: true,
          addressMeta: true,
        },
      }),
    )
    expect(mocks.unlinkPlace).toHaveBeenCalledWith(mocks.context.db, {
      ...input,
      actorId: 'u',
      projectId: 'p',
    })
    await expect(
      unlinkFeaturePlace({ ...input, projectId: 'other' } as never),
    ).rejects.toThrow()
  })
  it('returns stale conflicts and missing Features explicitly', async () => {
    mocks.unlinkPlace.mockResolvedValue({ status: 'conflict' })
    await expect(unlinkFeaturePlace(input)).rejects.toMatchObject({ status: 409 })
    mocks.probeFeature.mockResolvedValue(null)
    await expect(unlinkFeaturePlace(input)).rejects.toMatchObject({ status: 404 })
  })
})

describe('Place adoption review API boundaries', () => {
  const review = { featureId: 'f', proposalId: 'proposal' }
  const decision = {
    ...review,
    fieldGroup: 'location' as const,
    expectedRevision: 'seen',
    expectedFeatureModifiedAt: 'timestamp',
    reason: 'Reviewed premises',
  }

  it('authorizes every endpoint before accessing evidence or mutating decisions', async () => {
    mocks.authorizeFeatureUpdate.mockReturnValue({ allowed: false, code: 'DENIED' })
    for (const action of [
      () => listFeaturePlaceReviews({ featureId: 'f' }),
      () => getFeaturePlaceReview(review),
      () => reevaluateFeaturePlaceReview(review),
      () => rejectFeaturePlaceReview(decision),
      () => acceptFeaturePlaceReview(decision),
    ])
      await expect(action()).rejects.toMatchObject({ status: 403 })
    for (const read of [
      mocks.listReviews,
      mocks.readReview,
      mocks.proposeReview,
      mocks.rejectReview,
      mocks.applyReview,
    ])
      expect(read).not.toHaveBeenCalled()
    expect(mocks.authorizeFeatureUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: { id: 'f', projectId: 'p' },
        submittedData: {
          i18n: true,
          properties: true,
          geometry: true,
          addressMeta: true,
        },
      }),
    )
  })

  it('derives persisted scope, enforces bounded cursors and rejects client authority/source fields', async () => {
    mocks.listReviews.mockResolvedValue({ reviews: [], nextCursor: null })
    await listFeaturePlaceReviews({ featureId: 'f', beforeRow: 15 })
    expect(mocks.listReviews).toHaveBeenCalledWith(mocks.context.db, {
      featureId: 'f',
      projectId: 'p',
      beforeRow: 15,
    })
    for (const beforeRow of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
      await expect(
        listFeaturePlaceReviews({ featureId: 'f', beforeRow }),
      ).rejects.toThrow()
    for (const extra of [
      { projectId: 'other' },
      { actorId: 'other' },
      { mode: 'automatic' },
      { facts: { names: { en: 'Forged' } } },
    ])
      await expect(
        acceptFeaturePlaceReview({ ...decision, ...extra } as never),
      ).rejects.toThrow()
    await expect(
      rejectFeaturePlaceReview({ ...decision, reason: ' ' }),
    ).rejects.toThrow()
  })

  it('only re-evaluates the candidate from retained evidence and preserves unavailable/conflict results', async () => {
    mocks.readReview.mockResolvedValue(null)
    await expect(getFeaturePlaceReview(review)).rejects.toMatchObject({ status: 404 })
    await expect(reevaluateFeaturePlaceReview(review)).rejects.toMatchObject({
      status: 404,
    })
    expect(mocks.proposeReview).not.toHaveBeenCalled()
    mocks.readReview.mockResolvedValue({
      proposal: { candidateRevisionId: 'retained-candidate' },
    })
    mocks.proposeReview.mockResolvedValue({
      proposal: { id: 'new-assessment' },
      decisions: [],
    })
    await reevaluateFeaturePlaceReview(review)
    expect(mocks.proposeReview).toHaveBeenCalledWith(mocks.context.db, {
      featureId: 'f',
      projectId: 'p',
      candidateRevisionId: 'retained-candidate',
      reevaluatePending: true,
    })
    mocks.proposeReview.mockResolvedValue(null)
    await expect(reevaluateFeaturePlaceReview(review)).rejects.toMatchObject({
      status: 409,
    })
  })

  it('forces reviewed mode, uses authenticated actor and wakes routing only after committed geometry change', async () => {
    mocks.applyReview.mockResolvedValue({
      status: 'applied',
      revision: 'new',
      feature: { id: 'f', modifiedAt: 'next' },
      geometryChanged: false,
    })
    expect(await acceptFeaturePlaceReview(decision)).toEqual({
      status: 'applied',
      revision: 'new',
      modifiedAt: 'next',
    })
    expect(mocks.applyReview).toHaveBeenCalledWith(mocks.context.db, {
      ...decision,
      projectId: 'p',
      actorId: 'u',
      mode: 'reviewed',
    })
    expect(mocks.scheduleMtr).not.toHaveBeenCalled()
    mocks.applyReview.mockResolvedValue({
      status: 'review',
      reason: 'Missing dependency',
    })
    expect(await acceptFeaturePlaceReview(decision)).toEqual({
      status: 'review',
      reason: 'Missing dependency',
    })
    mocks.applyReview.mockResolvedValue({ status: 'conflict' })
    await expect(acceptFeaturePlaceReview(decision)).rejects.toMatchObject({
      status: 409,
    })
    expect(mocks.scheduleMtr).not.toHaveBeenCalled()
    mocks.applyReview.mockResolvedValue({
      status: 'applied',
      revision: 'new',
      feature: { id: 'f', modifiedAt: 'next' },
      geometryChanged: true,
    })
    await acceptFeaturePlaceReview(decision)
    expect(mocks.scheduleMtr).toHaveBeenCalledWith(
      mocks.context.event.locals.platform,
      'f',
    )
    mocks.rejectReview.mockResolvedValue(null)
    await expect(rejectFeaturePlaceReview(decision)).rejects.toMatchObject({
      status: 409,
    })
    expect(mocks.rejectReview).toHaveBeenCalledWith(mocks.context.db, {
      ...decision,
      projectId: 'p',
      actorId: 'u',
    })
  })

  it('does not read evidence for missing Features', async () => {
    mocks.probeFeature.mockResolvedValue(null)
    await expect(getFeaturePlaceReview(review)).rejects.toMatchObject({ status: 404 })
    expect(mocks.readReview).not.toHaveBeenCalled()
  })
})

describe('Place identity review authority and retained evidence', () => {
  const input = {
    placeId: 'place',
    ssId: 'candidate',
    sourceOffset: 100,
    publication: {
      releaseSet: 'release',
      catalogRevision: 'catalog',
      knownAt: '2026-10-18T00:00:00Z',
    },
  }
  it('reports editor access without exposing ownership and captures only a server-resolved revision', async () => {
    await expect(getPlaceIdentityReviewAccess({ placeId: 'place' })).resolves.toEqual({
      allowed: true,
    })
    await expect(
      prepareMirroredPlaceIdentityReview({
        placeId: 'place',
        candidateRevisionId: 'source-revision',
      }),
    ).resolves.toEqual({ reviewId: 'mirrored-review' })
    expect(mocks.captureMirroredIdentity).toHaveBeenCalledWith(
      mocks.context.db,
      { placeId: 'place', expectedOwnerOrganisationId: 'p' },
      'source-revision',
      'u',
    )
    mocks.authorizeOrganisation.mockReturnValue({ allowed: false })
    await expect(getPlaceIdentityReviewAccess({ placeId: 'place' })).resolves.toEqual({
      allowed: false,
    })
    await expect(
      prepareMirroredPlaceIdentityReview({
        placeId: 'place',
        candidateRevisionId: 'source-revision',
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect(mocks.captureMirroredIdentity).toHaveBeenCalledTimes(1)
  })
  it('authorizes persisted owner ancestry before capturing a pinned server record', async () => {
    await expect(preparePlaceIdentityReview(input)).resolves.toEqual({
      reviewId: 'identity-review',
    })
    expect(mocks.probeOrganisation).toHaveBeenCalledWith(mocks.context.db, {
      ref: 'p',
      refKey: 'id',
    })
    expect(mocks.authorizeOrganisation).toHaveBeenCalledWith(
      expect.objectContaining({ submittedData: { code: true } }),
    )
    expect(mocks.readSourcePage).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://api.saanseoi.hk',
        fetch: mocks.context.event.fetch,
      }),
      input.publication,
      100,
    )
    expect(mocks.captureIdentity).toHaveBeenCalledWith(
      mocks.context.db,
      { placeId: 'place', expectedOwnerOrganisationId: 'p' },
      { ssId: 'candidate', facts: { names: { en: 'Shop' } } },
      'u',
    )
    expect(mocks.authorizeOrganisation.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.readSourcePage.mock.invocationCallOrder[0],
    )
  })
  it('rejects guests before reading scope and project editors without management authority before source access', async () => {
    mocks.context.user.isAnonymous = true
    await expect(preparePlaceIdentityReview(input)).rejects.toMatchObject({
      status: 403,
    })
    expect(mocks.probeIdentity).not.toHaveBeenCalled()
    mocks.context.user.isAnonymous = false
    mocks.authorizeOrganisation.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })
    await expect(preparePlaceIdentityReview(input)).rejects.toMatchObject({
      status: 403,
    })
    expect(mocks.identityBaseline).not.toHaveBeenCalled()
    expect(mocks.readSourcePage).not.toHaveBeenCalled()
  })
  it('requires core hub stewardship for shared Places, not an unrelated hub admin', async () => {
    mocks.probeIdentity.mockResolvedValue({ id: 'place', ownerOrganisationId: null })
    mocks.context.userRoles = [
      Object.assign(
        { type: 'hub' as const, role: 'admin', hubId: 'hub', userId: 'u' },
        { hub: { code: 'breadline' } },
      ),
    ] as UserRoleDisco[]
    await expect(
      getPlaceIdentityReview({ placeId: 'place', reviewId: 'r' }),
    ).rejects.toMatchObject({ status: 403 })
    expect(mocks.readIdentity).not.toHaveBeenCalled()
    mocks.context.userRoles = [
      Object.assign(
        { type: 'hub' as const, role: 'admin', hubId: 'core', userId: 'u' },
        { hub: { code: 'core' } },
      ),
    ] as UserRoleDisco[]
    await getPlaceIdentityReview({ placeId: 'place', reviewId: 'r' })
    expect(mocks.readIdentity).toHaveBeenCalledWith(mocks.context.db, {
      placeId: 'place',
      reviewId: 'r',
      ownerOrganisationId: null,
    })
  })
  it('does not accept a search label, missing/duplicate source record or client-authored facts', async () => {
    await expect(
      preparePlaceIdentityReview({
        ...input,
        projection: { ssId: 'candidate' },
      } as never),
    ).rejects.toThrow()
    for (const places of [[], [{ ssId: 'candidate' }, { ssId: 'candidate' }]]) {
      mocks.readSourcePage.mockResolvedValue({ places })
      await expect(preparePlaceIdentityReview(input)).rejects.toMatchObject({
        status: 404,
      })
    }
    expect(mocks.captureIdentity).not.toHaveBeenCalled()
  })
  it('normalizes upstream failures and rejects a target changed during retrieval', async () => {
    mocks.readSourcePage.mockRejectedValueOnce(new Error('sensitive upstream error'))
    await expect(preparePlaceIdentityReview(input)).rejects.toMatchObject({
      status: 502,
      body: { message: 'PLACE_SOURCE_FAILED' },
    })
    mocks.captureIdentity.mockResolvedValue(null)
    await expect(preparePlaceIdentityReview(input)).rejects.toMatchObject({
      status: 409,
    })
  })
  it('accepts only a retained review and server-derived actor/owner, preserving explicit merge outcomes', async () => {
    const decision = { placeId: 'place', reviewId: 'r', reason: 'Confirmed shop unit' }
    await acceptPlaceIdentityReview(decision)
    expect(mocks.acceptIdentity).toHaveBeenCalledWith(mocks.context.db, {
      ...decision,
      actorId: 'u',
      ownerOrganisationId: 'p',
    })
    await expect(
      acceptPlaceIdentityReview({ ...decision, actorId: 'spoofed' } as never),
    ).rejects.toThrow()
    mocks.acceptIdentity.mockResolvedValue({ status: 'merge-required' })
    await expect(acceptPlaceIdentityReview(decision)).resolves.toEqual({
      status: 'merge-required',
    })
    mocks.acceptIdentity.mockResolvedValue({ status: 'conflict' })
    await expect(acceptPlaceIdentityReview(decision)).rejects.toMatchObject({
      status: 409,
    })
    mocks.authorizeOrganisation.mockReturnValue({ allowed: false })
    await expect(acceptPlaceIdentityReview(decision)).rejects.toMatchObject({
      status: 403,
    })
  })
})

describe('two-Place merge authorization', () => {
  const prepare = { placeId: 'place', identityReviewId: 'identity-review' }
  const read = { placeId: 'place', reviewId: 'merge' }
  const decision = { ...read, reason: 'Reviewed affected Features and same premises' }
  function scopeBoth() {
    mocks.probeIdentity.mockImplementation((_db, id) => ({
      id,
      ownerOrganisationId: id === 'source' ? null : 'p',
    }))
  }
  function core() {
    mocks.context.userRoles = [
      Object.assign(
        { type: 'hub' as const, role: 'admin', hubId: 'core', userId: 'u' },
        { hub: { code: 'core' } },
      ),
    ]
  }
  it('requires authority over the absorbed Place before reading impact or making any merge write', async () => {
    scopeBoth()
    await expect(preparePlaceMergeReview(prepare)).rejects.toMatchObject({
      status: 403,
    })
    await expect(getPlaceMergeReview(read)).rejects.toMatchObject({ status: 403 })
    await expect(acceptPlaceMergeReview(decision)).rejects.toMatchObject({
      status: 403,
    })
    expect(mocks.captureMerge).not.toHaveBeenCalled()
    expect(mocks.readMerge).not.toHaveBeenCalled()
    expect(mocks.applyMerge).not.toHaveBeenCalled()
  })
  it('derives both scopes, source and actor from persistence and reauthorizes each operation', async () => {
    scopeBoth()
    core()
    await expect(preparePlaceMergeReview(prepare)).resolves.toMatchObject({
      status: 'ready',
    })
    expect(mocks.captureMerge).toHaveBeenCalledWith(mocks.context.db, {
      ...prepare,
      sourcePlaceId: 'source',
      ownerOrganisationId: 'p',
      sourceOwnerOrganisationId: null,
      actorId: 'u',
    })
    await getPlaceMergeReview(read)
    expect(mocks.readMerge).toHaveBeenCalledWith(mocks.context.db, {
      ...read,
      sourcePlaceId: 'source',
      ownerOrganisationId: 'p',
      sourceOwnerOrganisationId: null,
    })
    await acceptPlaceMergeReview(decision)
    expect(mocks.applyMerge).toHaveBeenCalledWith(mocks.context.db, {
      ...decision,
      sourcePlaceId: 'source',
      ownerOrganisationId: 'p',
      sourceOwnerOrganisationId: null,
      actorId: 'u',
    })
    mocks.context.userRoles = []
    await expect(acceptPlaceMergeReview(decision)).rejects.toMatchObject({
      status: 403,
    })
    expect(mocks.applyMerge).toHaveBeenCalledTimes(1)
  })
  it('rejects client authority fields and requires a separate merge reason', async () => {
    scopeBoth()
    core()
    await expect(
      preparePlaceMergeReview({ ...prepare, sourcePlaceId: 'injected' } as never),
    ).rejects.toThrow()
    await expect(
      acceptPlaceMergeReview({ ...decision, ownerOrganisationId: 'other' } as never),
    ).rejects.toThrow()
    await expect(
      acceptPlaceMergeReview({ ...decision, reason: '  ' }),
    ).rejects.toThrow()
    expect(mocks.applyMerge).not.toHaveBeenCalled()
  })
  it('keeps privacy incompatibility explicit and maps missing/stale reviews to non-mutating errors', async () => {
    scopeBoth()
    core()
    mocks.captureMerge.mockResolvedValue({ status: 'scope-conflict' })
    await expect(preparePlaceMergeReview(prepare)).resolves.toEqual({
      status: 'scope-conflict',
    })
    mocks.captureMerge.mockResolvedValue({ status: 'conflict' })
    await expect(preparePlaceMergeReview(prepare)).rejects.toMatchObject({
      status: 409,
    })
    mocks.applyMerge.mockResolvedValue({ status: 'conflict' })
    await expect(acceptPlaceMergeReview(decision)).rejects.toMatchObject({
      status: 409,
    })
    mocks.probeMergeReview.mockResolvedValue(null)
    await expect(getPlaceMergeReview(read)).rejects.toMatchObject({ status: 404 })
  })
})

describe('canonical candidate import boundary', () => {
  const input = { featureId: 'f', ssId: 'ss-id', resourceReleaseId: 'release' }
  beforeEach(() => {
    mocks.discoverPublication.mockResolvedValue({ pin: { releaseSet: 'server-pin' } })
    mocks.lookupSource.mockResolvedValue({
      projection: { ssId: 'ss-id', releaseId: 'release' },
      offset: 100,
    })
    mocks.persistCandidate.mockResolvedValue({
      status: 'ready',
      placeId: 'place',
      revisionId: 'revision',
    })
  })
  it('uses server publication and persisted scope without linking or adopting', async () => {
    expect(await importFeaturePlaceCandidate(input)).toMatchObject({ status: 'ready' })
    expect(mocks.lookupSource).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://api.saanseoi.hk' }),
      { releaseSet: 'server-pin' },
      'ss-id',
    )
    expect(mocks.persistCandidate).toHaveBeenCalledWith(mocks.context.db, 'p', {
      ssId: 'ss-id',
      releaseId: 'release',
    })
    expect(mocks.linkPlace).not.toHaveBeenCalled()
    expect(mocks.applyReview).not.toHaveBeenCalled()
  })
  it('authorizes inherited fields before any source request', async () => {
    mocks.authorizeFeatureUpdate.mockReturnValue({ allowed: false })
    await expect(importFeaturePlaceCandidate(input)).rejects.toMatchObject({
      status: 403,
    })
    expect(mocks.discoverPublication).not.toHaveBeenCalled()
    expect(mocks.persistCandidate).not.toHaveBeenCalled()
    await expect(
      importFeaturePlaceCandidate({ ...input, projectId: 'other' } as never),
    ).rejects.toThrow()
    await expect(
      importFeaturePlaceCandidate({ ...input, facts: {} } as never),
    ).rejects.toThrow()
  })
  it.each([
    null,
    { projection: { ssId: 'other', releaseId: 'release' } },
    { projection: { ssId: 'ss-id', releaseId: 'changed' } },
  ])('rejects missing or changed selection before persistence: %j', async found => {
    mocks.lookupSource.mockResolvedValue(found)
    await expect(importFeaturePlaceCandidate(input)).rejects.toMatchObject({
      status: found ? 409 : 404,
    })
    expect(mocks.persistCandidate).not.toHaveBeenCalled()
  })
  it('sanitizes upstream and unavailable identity failures', async () => {
    mocks.lookupSource.mockRejectedValueOnce(new Error('private upstream payload'))
    await expect(importFeaturePlaceCandidate(input)).rejects.toMatchObject({
      status: 502,
      body: { message: 'PLACE_SOURCE_LOOKUP_FAILED' },
    })
    mocks.persistCandidate.mockResolvedValueOnce(null)
    await expect(importFeaturePlaceCandidate(input)).rejects.toMatchObject({
      status: 409,
      body: { message: 'PLACE_CANDIDATE_UNAVAILABLE' },
    })
    mocks.persistCandidate.mockRejectedValueOnce(new Error('private identity history'))
    await expect(importFeaturePlaceCandidate(input)).rejects.toMatchObject({
      status: 409,
      body: { message: 'PLACE_CANDIDATE_UNAVAILABLE' },
    })
  })
})

vi.mock('#lib/db/services/placeDirectory.js', () => ({
  listPlaceResources: mocks.directory,
}))
import { getPlaces, getPlace } from '#lib/api/placeDirectory.remote.js'

describe('standalone Place reads', () => {
  it('denies anonymous directory and detail reads before querying facts', async () => {
    mocks.context.user.isAnonymous = true
    await expect(getPlaces({})).rejects.toMatchObject({ status: 403 })
    await expect(getPlace({ id: 'place' })).rejects.toMatchObject({ status: 403 })
    expect(mocks.directory).not.toHaveBeenCalled()
  })
  it('allows shared catalogue reads without a claimed project scope', async () => {
    mocks.directory.mockResolvedValue({ data: [], nextCursor: null })
    await getPlaces({ q: 'shop', scope: 'client-cache-only' })
    expect(mocks.authorizeOrganisation).not.toHaveBeenCalled()
    expect(mocks.directory).toHaveBeenCalledWith(mocks.context.db, {
      q: 'shop',
      scope: 'client-cache-only',
    })
  })
  it('rejects project discovery and private details before reading facts', async () => {
    mocks.authorizeOrganisation.mockReturnValue({ allowed: false })
    await expect(getPlaces({ organisationId: 'other' })).rejects.toMatchObject({
      status: 403,
    })
    await expect(getPlace({ id: 'place' })).rejects.toMatchObject({ status: 403 })
    expect(mocks.directory).not.toHaveBeenCalled()
  })
  it('uses persisted ownership and fences the subsequent detail query', async () => {
    mocks.directory.mockResolvedValue({ data: [{ id: 'place' }], nextCursor: null })
    expect(await getPlace({ id: 'place' })).toEqual({
      id: 'place',
      canEditAddress: true,
    })
    expect(mocks.directory).toHaveBeenCalledWith(mocks.context.db, {
      id: 'place',
      organisationId: 'p',
    })
    await expect(
      getPlace({ id: 'place', projectId: 'other' } as never),
    ).rejects.toThrow()
  })
  it('returns missing if ownership changed after authorization', async () => {
    mocks.directory.mockResolvedValue({ data: [], nextCursor: null })
    expect(await getPlace({ id: 'place' })).toBeNull()
  })
})

describe('negative identity review authorization', () => {
  it('uses persisted scope and authenticated actor for rejection', async () => {
    await expect(
      rejectPlaceIdentityReview({
        placeId: 'place',
        reviewId: 'review',
        reason: 'Different shop unit',
      }),
    ).resolves.toEqual({ status: 'rejected' })
    expect(mocks.rejectIdentity).toHaveBeenCalledWith(mocks.context.db, {
      placeId: 'place',
      reviewId: 'review',
      reason: 'Different shop unit',
      ownerOrganisationId: 'p',
      actorId: 'u',
    })
  })
  it('denies revocation, blank reasons and client-supplied ownership before persistence', async () => {
    mocks.authorizeOrganisation.mockReturnValue({ allowed: false })
    await expect(
      rejectPlaceIdentityReview({
        placeId: 'place',
        reviewId: 'review',
        reason: 'Different',
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      rejectPlaceIdentityReview({ placeId: 'place', reviewId: 'review', reason: ' ' }),
    ).rejects.toThrow()
    await expect(
      rejectPlaceIdentityReview({
        placeId: 'place',
        reviewId: 'review',
        reason: 'Different',
        ownerOrganisationId: 'other',
      } as never),
    ).rejects.toThrow()
    expect(mocks.rejectIdentity).not.toHaveBeenCalled()
  })
  it('omits rejected source IDs from ordinary discovery without exposing reasons', async () => {
    mocks.rejectedSourceIds.mockResolvedValue(new Set(['rejected']))
    mocks.searchPlaces.mockResolvedValue([
      { placeId: 'rejected' },
      { placeId: 'other' },
    ])
    expect(await searchFeaturePlaces({ featureId: 'f', q: 'Shop' })).toEqual({
      source: 'saanseoi-latest',
      candidates: [{ placeId: 'other' }],
    })
    expect(mocks.rejectedSourceIds).toHaveBeenCalledWith(mocks.context.db, 'f', 'p')
  })
})
