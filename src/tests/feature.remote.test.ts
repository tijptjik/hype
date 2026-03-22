import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createAuthzMatrixReporter } from './authz-matrix-report'

const {
  mockAuthorizeFeatureListForContext,
  mockAuthorizeFeatureReadForProbe,
  mockAuthorizeFeatureCreateForSubmission,
  mockAuthorizeFeatureUpdateForSubmission,
  mockAuthorizeFeaturePublishForSubmission,
  mockAuthorizeFeatureDeleteForSubmission,
  mockProbeFeatureQuery,
  mockResolveFeatureCommandProbe,
  mockProbeFeatureForUpdate,
  mockProbeLayerForUpdate,
  mockListFeatures,
  mockLoadFeature,
  mockCreateFeature,
  mockCreateI18n,
  mockCreateProperties,
  mockUpdateFeatureByIdWithConcurrency,
  mockUpdateFeaturePublishedStateById,
  mockUpdateFeatureArchivedStateById,
  mockUpdateI18n,
  mockUpdateProperties,
  mockPublishAllImagesWithPublicIntent,
  mockToQueryConditions,
  mockToLookupConditions,
  mockToRequestedListState,
  mockToFeatureProfile,
  mockGetFeatureWithRelations,
  mockToListResponseShape,
  mockToEntityResponseShape,
  mockToComparableFeatureProperties,
  mockGuardedContext,
} = vi.hoisted(() => ({
  mockAuthorizeFeatureListForContext: vi.fn(() => ({ allowed: true })),
  mockAuthorizeFeatureReadForProbe: vi.fn(() => ({ allowed: true })),
  mockAuthorizeFeatureCreateForSubmission: vi.fn(() => ({ allowed: true })),
  mockAuthorizeFeatureUpdateForSubmission: vi.fn(() => ({ allowed: true })),
  mockAuthorizeFeaturePublishForSubmission: vi.fn(() => ({ allowed: true })),
  mockAuthorizeFeatureDeleteForSubmission: vi.fn(() => ({ allowed: true })),
  mockProbeFeatureQuery: vi.fn(async () => null),
  mockResolveFeatureCommandProbe: vi.fn(),
  mockProbeFeatureForUpdate: vi.fn(async () => null),
  mockProbeLayerForUpdate: vi.fn(async () => null),
  mockListFeatures: vi.fn(async () => ({
    data: [],
    limit: 20,
    offset: 0,
    totalCount: 0,
  })),
  mockLoadFeature: vi.fn(async () => null),
  mockCreateFeature: vi.fn(async () => ({
    id: 'feature-1',
    modifiedAt: '2026-03-18T00:00:01.000Z',
  })),
  mockCreateI18n: vi.fn(async () => undefined),
  mockCreateProperties: vi.fn(async () => undefined),
  mockUpdateFeatureByIdWithConcurrency: vi.fn(async () => null),
  mockUpdateFeaturePublishedStateById: vi.fn(async () => null),
  mockUpdateFeatureArchivedStateById: vi.fn(async () => null),
  mockUpdateI18n: vi.fn(async () => undefined),
  mockUpdateProperties: vi.fn(async () => undefined),
  mockPublishAllImagesWithPublicIntent: vi.fn(async () => undefined),
  mockToQueryConditions: vi.fn(() => ({ conditions: [], filtersToApply: {} })),
  mockToLookupConditions: vi.fn((params: unknown) => params),
  mockToRequestedListState: vi.fn(() => ({ isPublished: true, isArchived: false })),
  mockToFeatureProfile: vi.fn((value: unknown, fallback: string) =>
    typeof value === 'string' ? value : fallback,
  ),
  mockGetFeatureWithRelations: vi.fn(() => ({})),
  mockToListResponseShape: vi.fn(async (value: unknown) => value),
  mockToEntityResponseShape: vi.fn((value: unknown) => ({ data: value })),
  mockToComparableFeatureProperties: vi.fn((value: unknown) => value),
  mockGuardedContext: vi.fn(),
}))

vi.mock('$lib/api/server/remote', () => ({
  guardedQuery: (_schema: unknown, handler: unknown) => async (input: unknown) =>
    (handler as (payload: unknown, ctx: unknown) => Promise<unknown>)(
      input,
      await mockGuardedContext(),
    ),
  guardedCommand: (_schema: unknown, handler: unknown) => async (input: unknown) =>
    (handler as (payload: unknown, ctx: unknown) => Promise<unknown>)(
      input,
      await mockGuardedContext(),
    ),
  guardedForm:
    (_schema: unknown, handler: unknown) =>
    async (input: unknown, invalid: (message: string) => never) => {
      const issue = (() => {
        const issueBuilder = (message: string) => message
        issueBuilder.data = new Proxy(
          {},
          {
            get: () => (message: string) => message,
          },
        )
        return issueBuilder
      })()

      return (
        handler as (
          payload: unknown,
          ctx: {
            db: unknown
            user: Record<string, unknown>
            userRoles: unknown[]
            invalid: (message: string) => never
            issue: unknown
            isAdminRequest: boolean
            event: { locals: { hub: { id: string | null } }; url: URL }
          },
        ) => Promise<unknown>
      )(input, {
        ...(await mockGuardedContext()),
        invalid,
        issue,
      })
    },
}))

vi.mock('@sveltejs/kit', () => ({
  error: (status: number, message: string) => {
    const err = new Error(message) as Error & { status: number }
    err.status = status
    throw err
  },
}))

vi.mock('$lib/api', () => ({
  getValidQueryParams: (_table: unknown, params: unknown) => params,
}))

vi.mock('$lib/api/services', () => ({
  getDuplicateValues: (values: string[]) => {
    const seen = new Set<string>()
    const duplicates: string[] = []
    for (const value of values) {
      if (seen.has(value)) duplicates.push(value)
      seen.add(value)
    }
    return duplicates
  },
  requireValue: <T>(value: T | null | undefined, onEmpty: () => never): T => {
    if (value === null || value === undefined) return onEmpty()
    return value
  },
  toBooleanStateResponseShape: (
    value: Record<string, unknown>,
    stateKey: 'isPublished' | 'isArchived',
  ) => ({
    data: {
      id: value.id,
      [stateKey]: value[stateKey],
    },
  }),
  toCreatedResponseShape: (value: { id: string; modifiedAt: string }) => ({
    data: {
      id: value.id,
      modifiedAt: value.modifiedAt,
    },
  }),
}))

vi.mock('$lib/api/services/feature', () => ({
  getFeatureWithRelations: mockGetFeatureWithRelations,
  toComparableFeatureProperties: mockToComparableFeatureProperties,
  toEntityResponseShape: mockToEntityResponseShape,
  toFeatureProfile: mockToFeatureProfile,
  toListResponseShape: mockToListResponseShape,
  toLookupConditions: mockToLookupConditions,
  toQueryConditions: mockToQueryConditions,
  toRequestedListState: mockToRequestedListState,
}))

vi.mock('$lib/api/services/authz', () => ({
  authorizeFeatureCreateForSubmission: mockAuthorizeFeatureCreateForSubmission,
  authorizeFeatureDeleteForSubmission: mockAuthorizeFeatureDeleteForSubmission,
  authorizeFeatureListForContext: mockAuthorizeFeatureListForContext,
  authorizeFeaturePublishForSubmission: mockAuthorizeFeaturePublishForSubmission,
  authorizeFeatureReadForProbe: mockAuthorizeFeatureReadForProbe,
  authorizeFeatureUpdateForSubmission: mockAuthorizeFeatureUpdateForSubmission,
  ensureFeatureCommandAllowed: (
    decision: { allowed: boolean; code?: string },
    toIssueDetailMessage?: (code: string) => string,
  ) => {
    if (decision.allowed) return
    const err = new Error(
      toIssueDetailMessage?.(decision.code ?? 'INSUFFICIENT_ROLE') ??
        decision.code ??
        'INSUFFICIENT_ROLE',
    ) as Error & { status: number }
    err.status = 403
    throw err
  },
  toAuthMessage: (code: string) => code,
  toIssueDetailMessage: (code: string) => code,
}))

vi.mock('$lib/db/services/feature', () => ({
  createFeature: mockCreateFeature,
  createI18n: mockCreateI18n,
  createProperties: mockCreateProperties,
  getFeature: mockLoadFeature,
  listFeatures: mockListFeatures,
  probeFeatureForUpdate: mockProbeFeatureForUpdate,
  probeFeatureQuery: mockProbeFeatureQuery,
  resolveFeatureCommandProbe: mockResolveFeatureCommandProbe,
  updateFeatureArchivedStateById: mockUpdateFeatureArchivedStateById,
  updateFeatureByIdWithConcurrency: mockUpdateFeatureByIdWithConcurrency,
  updateFeaturePublishedStateById: mockUpdateFeaturePublishedStateById,
  updateI18n: mockUpdateI18n,
  updateProperties: mockUpdateProperties,
}))

vi.mock('$lib/db/services/layer', () => ({
  probeLayerForUpdate: mockProbeLayerForUpdate,
}))

vi.mock('$lib/db/services/image', () => ({
  publishAllImagesWithPublicIntent: mockPublishAllImagesWithPublicIntent,
}))

vi.mock('$lib/db/schema', async importOriginal => await importOriginal())

vi.mock('$lib/db/zod', () => ({
  FeatureFormData: { parse: (value: unknown) => value },
  GetQueryParamsSchema: {},
  ListQueryParamsSchema: {},
  PublishFeatureSchema: {},
  RemoveFeatureSchema: {},
}))

vi.mock('$lib/db/zod/form', () => ({
  FormBoolean: z.coerce.boolean<boolean>(),
}))

vi.mock('$lib/i18n', async importOriginal => {
  const actual = await importOriginal<typeof import('$lib/i18n')>()
  return {
    ...actual,
    getLocale: vi.fn(() => 'en'),
  }
})

let remote: Awaited<typeof import('$lib/api/server/feature.remote')>

const matrix = createAuthzMatrixReporter('feature.remote')

const recordMatrix = (row: {
  action: string
  scenario: string
  actor: string
  expected: boolean
  actual: boolean
  code?: string
}): void => {
  matrix.record(row)
  expect(row.actual).toBe(row.expected)
}

const throwingInvalid = (message: string): never => {
  throw new Error(message)
}

afterAll(() => {
  matrix.flush()
})

describe('feature.remote authz matrix', () => {
  beforeEach(async () => {
    vi.resetModules()
    remote = await import('$lib/api/server/feature.remote')
    vi.clearAllMocks()

    mockAuthorizeFeatureListForContext.mockReturnValue({ allowed: true })
    mockAuthorizeFeatureReadForProbe.mockReturnValue({ allowed: true })
    mockAuthorizeFeatureCreateForSubmission.mockReturnValue({ allowed: true })
    mockAuthorizeFeatureUpdateForSubmission.mockReturnValue({ allowed: true })
    mockAuthorizeFeaturePublishForSubmission.mockReturnValue({ allowed: true })
    mockAuthorizeFeatureDeleteForSubmission.mockReturnValue({ allowed: true })
    mockToQueryConditions.mockReturnValue({ conditions: [], filtersToApply: {} })
    mockToRequestedListState.mockReturnValue({
      isPublished: true,
      isArchived: false,
    })
    mockToFeatureProfile.mockImplementation((value: unknown, fallback: string) =>
      typeof value === 'string' ? value : fallback,
    )
    mockToEntityResponseShape.mockImplementation((value: unknown) => ({ data: value }))
    mockToListResponseShape.mockImplementation(async (value: unknown) => value)

    mockGuardedContext.mockResolvedValue({
      db: {},
      user: { id: 'u-1', isAnonymous: false, superAdmin: false },
      userRoles: [],
      isAdminRequest: true,
      event: {
        locals: { hub: { id: 'hub-a' } },
        url: new URL('https://example.test/admin/features'),
      },
    })

    mockProbeFeatureQuery.mockResolvedValue({
      id: 'feature-1',
      organisationId: 'org-1',
      projectId: 'project-1',
      layerId: 'layer-1',
      resourceHubId: 'hub-a',
      isPublished: true,
      isArchived: false,
    })
    mockResolveFeatureCommandProbe.mockResolvedValue({
      id: 'feature-1',
      organisationId: 'org-1',
      projectId: 'project-1',
      layerId: 'layer-1',
      resourceHubId: 'hub-a',
    })
    mockProbeFeatureForUpdate.mockResolvedValue({
      id: 'feature-1',
      organisationId: 'org-1',
      projectId: 'project-1',
      layerId: 'layer-1',
      resourceHubId: 'hub-a',
      contributorId: 'u-2',
      geometry: { type: 'Point', coordinates: [114.1, 22.3] },
      addressMeta: { street: 'Main' },
      isIntangible: false,
      isVisitable: true,
      modifiedAt: '2026-03-18T00:00:00.000Z',
    })
    mockProbeLayerForUpdate.mockResolvedValue({
      id: 'layer-1',
      organisationId: 'org-1',
      projectId: 'project-1',
      hubId: 'hub-a',
    })
    mockLoadFeature.mockResolvedValue({
      id: 'feature-1',
      i18n: { en: { name: 'Feature' } },
      properties: [],
    })
    mockUpdateFeatureByIdWithConcurrency.mockResolvedValue({
      id: 'feature-1',
      modifiedAt: '2026-03-18T00:00:01.000Z',
    })
    mockUpdateFeaturePublishedStateById.mockResolvedValue({
      id: 'feature-1',
      isPublished: true,
    })
    mockUpdateFeatureArchivedStateById.mockResolvedValue({
      id: 'feature-1',
      isArchived: true,
    })
  })

  it('getFeatures denies when list authz denies', async () => {
    mockAuthorizeFeatureListForContext.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(
      remote.getFeatures({ conditions: { isPublished: false } }),
    ).rejects.toMatchObject({ status: 403 })

    recordMatrix({
      action: 'getFeatures',
      scenario: 'list denied',
      actor: 'unauthorized',
      expected: false,
      actual: false,
      code: 'INSUFFICIENT_ROLE',
    })
    expect(mockListFeatures).not.toHaveBeenCalled()
  })

  it('getFeatures allows admin-scoped unpublished list requests', async () => {
    await remote.getFeatures({
      conditions: { isPublished: false, isArchived: false },
      meta: { isAdminRequest: true },
    })

    expect(mockToQueryConditions).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      true,
      expect.objectContaining({ isPublished: false, isArchived: false }),
      expect.any(Array),
      undefined,
      'hub-a',
    )
    recordMatrix({
      action: 'getFeatures',
      scenario: 'list allowed',
      actor: 'authorized',
      expected: true,
      actual: true,
    })
  })

  it('getFeature denies when read authz denies', async () => {
    mockAuthorizeFeatureReadForProbe.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(
      remote.getFeature({ ref: 'feature-1', refKey: 'id' }),
    ).rejects.toMatchObject({ status: 403 })

    recordMatrix({
      action: 'getFeature',
      scenario: 'read denied',
      actor: 'unauthorized',
      expected: false,
      actual: false,
      code: 'INSUFFICIENT_ROLE',
    })
    expect(mockLoadFeature).not.toHaveBeenCalled()
  })

  it('featureForm create denies when create authz denies', async () => {
    mockAuthorizeFeatureCreateForSubmission.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(
      remote.featureForm(
        {
          meta: { mode: 'create' },
          data: {
            layerId: 'layer-1',
            contributorId: null,
            i18n: { en: { name: 'Feature' } },
            properties: [],
            geometry: { type: 'Point', coordinates: [114.1, 22.3] },
            addressMeta: {},
            isIntangible: false,
            isVisitable: true,
          },
        },
        throwingInvalid,
      ),
    ).rejects.toThrow('INSUFFICIENT_ROLE')

    recordMatrix({
      action: 'featureForm',
      scenario: 'create denied',
      actor: 'unauthorized',
      expected: false,
      actual: false,
      code: 'INSUFFICIENT_ROLE',
    })
    expect(mockCreateFeature).not.toHaveBeenCalled()
  })

  it('featureForm update allows changed field submission', async () => {
    const result = await remote.featureForm(
      {
        meta: {
          id: 'feature-1',
          mode: 'update',
          updatedAt: '2026-03-18T00:00:00.000Z',
        },
        data: {
          layerId: 'layer-1',
          contributorId: null,
          i18n: { en: { name: 'Feature 2' } },
          properties: [],
          geometry: { type: 'Point', coordinates: [114.2, 22.4] },
          addressMeta: { street: 'Changed' },
          isIntangible: true,
          isVisitable: false,
          isPendingReview: true,
        },
      },
      throwingInvalid,
    )

    expect(mockAuthorizeFeatureUpdateForSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: expect.objectContaining({
          id: 'feature-1',
          projectId: 'project-1',
        }),
      }),
    )
    expect(result).toEqual({
      data: {
        id: 'feature-1',
        modifiedAt: '2026-03-18T00:00:01.000Z',
      },
    })
    recordMatrix({
      action: 'featureForm',
      scenario: 'update allowed',
      actor: 'authorized',
      expected: true,
      actual: true,
    })
  })

  it('publishFeature denies when publish authz denies', async () => {
    mockAuthorizeFeaturePublishForSubmission.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(
      remote.publishFeature({ id: 'feature-1', state: true }),
    ).rejects.toMatchObject({ status: 403 })

    recordMatrix({
      action: 'publishFeature',
      scenario: 'publish denied',
      actor: 'unauthorized',
      expected: false,
      actual: false,
      code: 'INSUFFICIENT_ROLE',
    })
  })

  it('publishFeature publishes state and public images when allowed', async () => {
    const result = await remote.publishFeature({ id: 'feature-1', state: true })

    expect(mockUpdateFeaturePublishedStateById).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        id: 'feature-1',
        state: true,
        publisherId: 'u-1',
      }),
    )
    expect(mockPublishAllImagesWithPublicIntent).toHaveBeenCalledWith(
      expect.any(Object),
      'feature-1',
      'u-1',
    )
    expect(result).toEqual({
      data: {
        id: 'feature-1',
        isPublished: true,
      },
    })
    recordMatrix({
      action: 'publishFeature',
      scenario: 'publish allowed',
      actor: 'authorized',
      expected: true,
      actual: true,
    })
  })

  it('archiveFeature denies when delete authz denies', async () => {
    mockAuthorizeFeatureDeleteForSubmission.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(
      remote.archiveFeature({ id: 'feature-1', state: true }),
    ).rejects.toMatchObject({ status: 403 })

    recordMatrix({
      action: 'archiveFeature',
      scenario: 'archive denied',
      actor: 'unauthorized',
      expected: false,
      actual: false,
      code: 'INSUFFICIENT_ROLE',
    })
  })

  it('updateFeatureState denies when update authz denies', async () => {
    mockAuthorizeFeatureUpdateForSubmission.mockReturnValue({
      allowed: false,
      code: 'FIELD_FORBIDDEN',
    })

    await expect(
      remote.updateFeatureState({
        id: 'feature-1',
        data: { isPendingReview: true },
      }),
    ).rejects.toMatchObject({ status: 403 })

    recordMatrix({
      action: 'updateFeatureState',
      scenario: 'patch denied',
      actor: 'unauthorized',
      expected: false,
      actual: false,
      code: 'FIELD_FORBIDDEN',
    })
  })

  it('updateFeatureState allows partial state mutation', async () => {
    mockUpdateFeatureByIdWithConcurrency.mockResolvedValue({
      id: 'feature-1',
      isPublished: true,
      isPendingReview: false,
    })

    const result = await remote.updateFeatureState({
      id: 'feature-1',
      data: { isPublished: true },
    })

    expect(mockPublishAllImagesWithPublicIntent).toHaveBeenCalledWith(
      expect.any(Object),
      'feature-1',
      'u-1',
    )
    expect(result).toEqual({
      data: {
        id: 'feature-1',
        isPublished: true,
        isPendingReview: false,
      },
    })
    recordMatrix({
      action: 'updateFeatureState',
      scenario: 'patch allowed',
      actor: 'authorized',
      expected: true,
      actual: true,
    })
  })
})
