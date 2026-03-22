import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuthzMatrixReporter } from './authz-matrix-report'

const {
  mockAuthorizeLayerListForContext,
  mockAuthorizeLayerReadForProbe,
  mockAuthorizeLayerCreateForSubmission,
  mockAuthorizeLayerUpdateForSubmission,
  mockAuthorizeLayerPublishForSubmission,
  mockAuthorizeLayerDeleteForSubmission,
  mockProbeLayerQuery,
  mockResolveLayerCommandProbe,
  mockProbeLayerForUpdate,
  mockProbeProjectForUpdate,
  mockListLayers,
  mockLoadLayer,
  mockCreateLayer,
  mockCreateI18n,
  mockUpdateI18n,
  mockUpdateProperties,
  mockUpdateLayerByIdWithConcurrency,
  mockUpdateLayerPublishedStateById,
  mockUpdateLayerArchivedStateById,
  mockToQueryConditions,
  mockToLayerPrisms,
  mockToLookupConditions,
  mockToRequestedListState,
  mockToLayerProfile,
  mockGetLayerWithRelations,
  mockToListResponseShape,
  mockToEntityResponseShape,
  mockToComparableLayerProperties,
  mockToStableSignature,
  mockGuardedContext,
} = vi.hoisted(() => ({
  mockAuthorizeLayerListForContext: vi.fn(() => ({ allowed: true })),
  mockAuthorizeLayerReadForProbe: vi.fn(() => ({ allowed: true })),
  mockAuthorizeLayerCreateForSubmission: vi.fn(() => ({ allowed: true })),
  mockAuthorizeLayerUpdateForSubmission: vi.fn(() => ({ allowed: true })),
  mockAuthorizeLayerPublishForSubmission: vi.fn(() => ({ allowed: true })),
  mockAuthorizeLayerDeleteForSubmission: vi.fn(() => ({ allowed: true })),
  mockProbeLayerQuery: vi.fn(async () => null),
  mockResolveLayerCommandProbe: vi.fn(),
  mockProbeLayerForUpdate: vi.fn(async () => null),
  mockProbeProjectForUpdate: vi.fn(async () => null),
  mockListLayers: vi.fn(async () => ({
    data: [],
    limit: 20,
    offset: 0,
    totalCount: 0,
  })),
  mockLoadLayer: vi.fn(async () => null),
  mockCreateLayer: vi.fn(async () => ({
    id: 'layer-1',
    modifiedAt: '2026-03-18T00:00:01.000Z',
  })),
  mockCreateI18n: vi.fn(async () => undefined),
  mockUpdateI18n: vi.fn(async () => undefined),
  mockUpdateProperties: vi.fn(async () => undefined),
  mockUpdateLayerByIdWithConcurrency: vi.fn(async () => null),
  mockUpdateLayerPublishedStateById: vi.fn(async () => null),
  mockUpdateLayerArchivedStateById: vi.fn(async () => null),
  mockToQueryConditions: vi.fn(() => ({ conditions: [], filtersToApply: {} })),
  mockToLayerPrisms: vi.fn((value: unknown) => value),
  mockToLookupConditions: vi.fn((params: unknown) => params),
  mockToRequestedListState: vi.fn(() => ({ isPublished: true, isArchived: false })),
  mockToLayerProfile: vi.fn((value: unknown, fallback: string) =>
    typeof value === 'string' ? value : fallback,
  ),
  mockGetLayerWithRelations: vi.fn(() => ({})),
  mockToListResponseShape: vi.fn((value: unknown) => value),
  mockToEntityResponseShape: vi.fn(async (value: unknown) => ({ data: value })),
  mockToComparableLayerProperties: vi.fn((value: unknown) => value),
  mockToStableSignature: vi.fn((value: unknown) => JSON.stringify(value ?? null)),
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
        const issueBuilder = ((message: string) => message)
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
            event: {
              locals: { hub: { id: string | null; isSuperAdmin?: boolean } }
              url: URL
            }
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
  toStableSignature: mockToStableSignature,
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

vi.mock('$lib/api/services/layer', () => ({
  getLayerWithRelations: mockGetLayerWithRelations,
  toComparableLayerProperties: mockToComparableLayerProperties,
  toEntityResponseShape: mockToEntityResponseShape,
  toListResponseShape: mockToListResponseShape,
  toLayerProfile: mockToLayerProfile,
  toLayerPrisms: mockToLayerPrisms,
  toLookupConditions: mockToLookupConditions,
  toQueryConditions: mockToQueryConditions,
  toRequestedListState: mockToRequestedListState,
}))

vi.mock('$lib/api/services/authz', () => ({
  authorizeLayerCreateForSubmission: mockAuthorizeLayerCreateForSubmission,
  authorizeLayerDeleteForSubmission: mockAuthorizeLayerDeleteForSubmission,
  authorizeLayerListForContext: mockAuthorizeLayerListForContext,
  authorizeLayerPublishForSubmission: mockAuthorizeLayerPublishForSubmission,
  authorizeLayerReadForProbe: mockAuthorizeLayerReadForProbe,
  authorizeLayerUpdateForSubmission: mockAuthorizeLayerUpdateForSubmission,
  ensureLayerCommandAllowed: (
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

vi.mock('$lib/db/services/layer', () => ({
  createI18n: mockCreateI18n,
  createLayer: mockCreateLayer,
  getLayer: mockLoadLayer,
  listLayers: mockListLayers,
  probeLayerForUpdate: mockProbeLayerForUpdate,
  probeLayerQuery: mockProbeLayerQuery,
  resolveLayerCommandProbe: mockResolveLayerCommandProbe,
  updateProperties: mockUpdateProperties,
  updateI18n: mockUpdateI18n,
  updateLayerArchivedStateById: mockUpdateLayerArchivedStateById,
  updateLayerByIdWithConcurrency: mockUpdateLayerByIdWithConcurrency,
  updateLayerPublishedStateById: mockUpdateLayerPublishedStateById,
}))

vi.mock('$lib/db/services/project', () => ({
  probeProjectForUpdate: mockProbeProjectForUpdate,
}))

vi.mock('$lib/db/schema', async importOriginal => await importOriginal())

vi.mock('$lib/db/zod', () => ({
  GetQueryParamsSchema: {},
  LayerFormData: { parse: (value: unknown) => value },
  ListQueryParamsSchema: {},
  PublishLayerSchema: {},
  RemoveLayerSchema: {},
}))

vi.mock('$lib/i18n', async importOriginal => {
  const actual = await importOriginal<typeof import('$lib/i18n')>()
  return {
    ...actual,
    getLocale: vi.fn(() => 'en'),
  }
})

let remote: Awaited<typeof import('$lib/api/server/layer.remote')>

const matrix = createAuthzMatrixReporter('layer.remote')

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

describe('layer.remote authz matrix', () => {
  beforeEach(async () => {
    vi.resetModules()
    remote = await import('$lib/api/server/layer.remote')
    vi.clearAllMocks()

    mockAuthorizeLayerListForContext.mockReturnValue({ allowed: true })
    mockAuthorizeLayerReadForProbe.mockReturnValue({ allowed: true })
    mockAuthorizeLayerCreateForSubmission.mockReturnValue({ allowed: true })
    mockAuthorizeLayerUpdateForSubmission.mockReturnValue({ allowed: true })
    mockAuthorizeLayerPublishForSubmission.mockReturnValue({ allowed: true })
    mockAuthorizeLayerDeleteForSubmission.mockReturnValue({ allowed: true })
    mockToQueryConditions.mockReturnValue({ conditions: [], filtersToApply: {} })
    mockToRequestedListState.mockReturnValue({
      isPublished: true,
      isArchived: false,
    })
    mockToLayerProfile.mockImplementation((value: unknown, fallback: string) =>
      typeof value === 'string' ? value : fallback,
    )
    mockToEntityResponseShape.mockImplementation(async (value: unknown) => ({
      data: value,
    }))
    mockToListResponseShape.mockImplementation((value: unknown) => value)

    mockGuardedContext.mockResolvedValue({
      db: {},
      user: { id: 'u-1', isAnonymous: false, superAdmin: false },
      userRoles: [],
      isAdminRequest: true,
      event: {
        locals: { hub: { id: 'hub-a' } },
        url: new URL('https://example.test/admin/layers'),
      },
    })

    mockProbeLayerQuery.mockResolvedValue({
      id: 'layer-1',
      organisationId: 'org-1',
      projectId: 'project-1',
      hubId: 'hub-a',
      isPublished: true,
      isArchived: false,
    })
    mockResolveLayerCommandProbe.mockResolvedValue({
      id: 'layer-1',
      organisationId: 'org-1',
      projectId: 'project-1',
      hubId: 'hub-a',
    })
    mockProbeProjectForUpdate.mockResolvedValue({
      id: 'project-1',
      organisationId: 'org-1',
      hubId: 'hub-a',
    })
    mockProbeLayerForUpdate.mockResolvedValue({
      id: 'layer-1',
      organisationId: 'org-1',
      projectId: 'project-1',
      hubId: 'hub-a',
      metadata: { zoom: 10 },
      modifiedAt: '2026-03-18T00:00:00.000Z',
    })
    mockLoadLayer.mockResolvedValue({
      id: 'layer-1',
      i18n: { en: { name: 'Layer' } },
      properties: [],
      isDefaultVisible: true,
    })
    mockUpdateLayerByIdWithConcurrency.mockResolvedValue({
      id: 'layer-1',
      modifiedAt: '2026-03-18T00:00:01.000Z',
    })
    mockUpdateLayerPublishedStateById.mockResolvedValue({
      id: 'layer-1',
      isPublished: true,
    })
    mockUpdateLayerArchivedStateById.mockResolvedValue({
      id: 'layer-1',
      isArchived: true,
    })
  })

  it('getLayers denies when list authz denies', async () => {
    mockAuthorizeLayerListForContext.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(
      remote.getLayers({ conditions: { isPublished: false } }),
    ).rejects.toMatchObject({ status: 403 })

    recordMatrix({
      action: 'getLayers',
      scenario: 'list denied',
      actor: 'unauthorized',
      expected: false,
      actual: false,
      code: 'INSUFFICIENT_ROLE',
    })
  })

  it('getLayers allows admin-scoped unpublished list requests', async () => {
    await remote.getLayers({
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
      action: 'getLayers',
      scenario: 'list allowed',
      actor: 'authorized',
      expected: true,
      actual: true,
    })
  })

  it('getLayer denies when read authz denies', async () => {
    mockAuthorizeLayerReadForProbe.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(
      remote.getLayer({ ref: 'layer-1', refKey: 'id' }),
    ).rejects.toMatchObject({ status: 403 })

    recordMatrix({
      action: 'getLayer',
      scenario: 'read denied',
      actor: 'unauthorized',
      expected: false,
      actual: false,
      code: 'INSUFFICIENT_ROLE',
    })
  })

  it('layerForm create denies when create authz denies', async () => {
    mockAuthorizeLayerCreateForSubmission.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(
      remote.layerForm(
        {
          meta: { mode: 'create' },
          data: {
            projectId: 'project-1',
            metadata: {},
            isDefaultVisible: true,
            properties: [],
            i18n: { en: { name: 'Layer' } },
          },
        },
        throwingInvalid,
      ),
    ).rejects.toThrow('INSUFFICIENT_ROLE')

    recordMatrix({
      action: 'layerForm',
      scenario: 'create denied',
      actor: 'unauthorized',
      expected: false,
      actual: false,
      code: 'INSUFFICIENT_ROLE',
    })
  })

  it('layerForm update allows changed field submission', async () => {
    const result = await remote.layerForm(
      {
        meta: {
          id: 'layer-1',
          mode: 'update',
          updatedAt: '2026-03-18T00:00:00.000Z',
        },
        data: {
          projectId: 'project-1',
          metadata: { zoom: 11 },
          isDefaultVisible: false,
          properties: [{ propertyId: 'prop-1', isVisible: true }],
          i18n: { en: { name: 'Layer 2' } },
        },
      },
      throwingInvalid,
    )

    expect(mockAuthorizeLayerUpdateForSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: expect.objectContaining({
          id: 'layer-1',
          projectId: 'project-1',
        }),
      }),
    )
    expect(result).toEqual({
      data: {
        id: 'layer-1',
        modifiedAt: '2026-03-18T00:00:01.000Z',
      },
    })
    recordMatrix({
      action: 'layerForm',
      scenario: 'update allowed',
      actor: 'authorized',
      expected: true,
      actual: true,
    })
  })

  it('publishLayer denies when publish authz denies', async () => {
    mockAuthorizeLayerPublishForSubmission.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(
      remote.publishLayer({ id: 'layer-1', state: true }),
    ).rejects.toMatchObject({ status: 403 })

    recordMatrix({
      action: 'publishLayer',
      scenario: 'publish denied',
      actor: 'unauthorized',
      expected: false,
      actual: false,
      code: 'INSUFFICIENT_ROLE',
    })
  })

  it('publishLayer allows state mutation when authz allows', async () => {
    const result = await remote.publishLayer({ id: 'layer-1', state: true })

    expect(mockUpdateLayerPublishedStateById).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        id: 'layer-1',
        state: true,
        publisherId: 'u-1',
      }),
    )
    expect(result).toEqual({
      data: {
        id: 'layer-1',
        isPublished: true,
      },
    })
    recordMatrix({
      action: 'publishLayer',
      scenario: 'publish allowed',
      actor: 'authorized',
      expected: true,
      actual: true,
    })
  })

  it('archiveLayer denies when delete authz denies', async () => {
    mockAuthorizeLayerDeleteForSubmission.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(
      remote.archiveLayer({ id: 'layer-1', state: true }),
    ).rejects.toMatchObject({ status: 403 })

    recordMatrix({
      action: 'archiveLayer',
      scenario: 'archive denied',
      actor: 'unauthorized',
      expected: false,
      actual: false,
      code: 'INSUFFICIENT_ROLE',
    })
  })
})
