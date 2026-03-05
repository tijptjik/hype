import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockProjectFormDataParse,
  mockToLocaleRecordFromOrganisationFormI18n,
  mockProbeProjectForUpdate,
  mockLoadProject,
  mockProbeOrganisationHubForProject,
  mockListProjectRoleAssignments,
  mockUpdateProjectByIdWithConcurrency,
  mockCascadeProjectOrganisationToDescendants,
  mockUpdatePropertiesWithRelated,
  mockUpdateI18n,
  mockSyncProjectUserRoles,
  mockAuthorizeProjectUpdateForSubmission,
  mockAuthorizeProjectCreateForSubmission,
  mockAuthorizeProjectDeleteForSubmission,
  mockGuardedContext,
} = vi.hoisted(() => ({
  mockProjectFormDataParse: vi.fn((input: unknown) => input),
  mockToLocaleRecordFromOrganisationFormI18n: vi.fn(() => ({})),
  mockProbeProjectForUpdate: vi.fn(async () => null),
  mockLoadProject: vi.fn(async () => null),
  mockProbeOrganisationHubForProject: vi.fn(async () => null),
  mockListProjectRoleAssignments: vi.fn(async () => []),
  mockUpdateProjectByIdWithConcurrency: vi.fn(async () => null),
  mockCascadeProjectOrganisationToDescendants: vi.fn(async () => undefined),
  mockUpdatePropertiesWithRelated: vi.fn(async () => []),
  mockUpdateI18n: vi.fn(async () => undefined),
  mockSyncProjectUserRoles: vi.fn(async () => undefined),
  mockAuthorizeProjectUpdateForSubmission: vi.fn(() => ({ allowed: true })),
  mockAuthorizeProjectCreateForSubmission: vi.fn(() => ({ allowed: true })),
  mockAuthorizeProjectDeleteForSubmission: vi.fn(() => ({ allowed: true })),
  mockGuardedContext: vi.fn(),
}))

vi.mock('$lib/api/server/remote', () => ({
  guardedQuery: (_schema: unknown, handler: unknown) => handler,
  guardedCommand: (_schema: unknown, handler: unknown) => handler,
  guardedForm:
    (_schema: unknown, handler: unknown) =>
    async (input: unknown, invalid: (message: string) => never) => {
      const issue = (() => {
        const issueBuilder = ((message: string) => message) as any
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
            event: { locals: { hub: null }; url: URL }
          },
        ) => Promise<unknown>
      )(input, {
        ...(await mockGuardedContext()),
        invalid,
        issue,
      })
    },
}))

vi.mock('$lib/api', () => ({
  getPrisms: vi.fn(() => ({ organisation: [], project: [], layer: [] })),
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
  hasRoleMembershipChanged: (
    submitted: Array<{ userId: string; role: string }>,
    existing: Array<{ userId: string; role: string }>,
    toSignature: (roles: Array<{ userId: string; role: string }>) => string,
  ) => toSignature(submitted) !== toSignature(existing),
  requireValue: <T>(value: T | null | undefined, onEmpty: () => never): T => {
    if (value === null || value === undefined) return onEmpty()
    return value
  },
  toCreatedResponseShape: (value: { id: string; modifiedAt: string }) => ({
    data: {
      id: value.id,
      modifiedAt: value.modifiedAt,
    },
  }),
  toBooleanStateResponseShape: (
    value: Record<string, unknown>,
    stateKey: 'isPublished' | 'isArchived',
  ) => ({
    data: {
      id: value.id,
      [stateKey]: value[stateKey],
    },
  }),
  validateUniqueNonReservedCode: vi.fn(async () => undefined),
}))

vi.mock('$lib/api/services/project', () => ({
  getProjectWithRelations: vi.fn(() => ({})),
  normalizeSubmittedPropertyRanks: <
    T extends { type?: unknown; rank?: unknown; values?: unknown },
  >(
    properties: T[],
  ): T[] => {
    const normalized = properties.map(property => ({ ...property }))
    const asRank = (value: unknown): number => {
      if (typeof value === 'number' && Number.isFinite(value)) return value
      if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) {
        return Number(value)
      }
      return Number.POSITIVE_INFINITY
    }

    const assignByType = (type: 'classifier' | 'specifier'): void => {
      normalized
        .map((property, index) => ({ property, index }))
        .filter(({ property }) => property.type === type)
        .sort((a, b) => {
          const aRank = asRank(a.property.rank)
          const bRank = asRank(b.property.rank)
          if (aRank !== bRank) return aRank - bRank
          return a.index - b.index
        })
        .forEach(({ property }, rank) => {
          property.rank = rank
        })
    }

    assignByType('classifier')
    assignByType('specifier')

    for (const property of normalized) {
      if (!Array.isArray(property.values)) continue
      const values = property.values as Array<
        { rank?: unknown } & Record<string, unknown>
      >
      property.values = values
        .map((value, index) => ({ value: { ...value }, index }))
        .sort((a, b) => {
          const aRank = asRank(a.value.rank)
          const bRank = asRank(b.value.rank)
          if (aRank !== bRank) return aRank - bRank
          return a.index - b.index
        })
        .map(({ value }, rank) => ({
          ...value,
          rank,
        }))
    }

    return normalized as T[]
  },
  toLookupConditions: vi.fn(() => ({})),
  toQueryConditions: vi.fn(() => ({ conditions: [], filtersToApply: {} })),
  toProjectProfile: vi.fn((_value: unknown, fallback: string) => fallback),
  toRequestedListState: vi.fn(() => ({ isPublished: true, isArchived: false })),
}))

vi.mock('$lib/api/services/authz', () => ({
  authorizeProjectAssignCapabilitiesForSubmission: vi.fn(() => ({ allowed: true })),
  authorizeProjectCreateForSubmission: mockAuthorizeProjectCreateForSubmission,
  authorizeProjectDeleteForSubmission: mockAuthorizeProjectDeleteForSubmission,
  authorizeProjectListForContext: vi.fn(() => ({ allowed: true })),
  authorizeProjectManageCapabilitiesForSubmission: vi.fn(() => ({ allowed: true })),
  authorizeProjectManageRolesForSubmission: vi.fn(() => ({ allowed: true })),
  authorizeProjectPublishForSubmission: vi.fn(() => ({ allowed: true })),
  authorizeProjectReadForProbe: vi.fn(() => ({ allowed: true })),
  authorizeProjectUpdateForSubmission: mockAuthorizeProjectUpdateForSubmission,
  ensureProjectCommandAllowed: vi.fn(),
  isReservedCode: vi.fn(() => false),
  toAuthMessage: vi.fn((code: string) => code),
  toIssueDetailMessage: vi.fn((code: string) => code),
  toProjectUserRoleCapabilitiesSignature: (
    roles: Array<{
      userId: string
      capabilities?: Record<string, boolean | undefined> | null
    }>,
  ) =>
    roles
      .map(role => `${role.userId}:${JSON.stringify(role.capabilities ?? {})}`)
      .sort()
      .join('|'),
  toProjectUserRoleSignature: (roles: Array<{ userId: string; role: string }>) =>
    roles
      .map(role => `${role.userId}:${role.role}`)
      .sort()
      .join('|'),
  toProjectStableAuthzSignature: (value: unknown) => JSON.stringify(value ?? null),
  normalizeProjectI18nForFormInput: (i18n: unknown) => i18n ?? {},
}))

vi.mock('$lib/db/services/project', () => ({
  createI18n: vi.fn(async () => undefined),
  createProjectUserRoles: vi.fn(async () => undefined),
  createProject: vi.fn(async () => null),
  getProject: mockLoadProject,
  listOrganisationOwnerRoleAssignments: vi.fn(async () => []),
  listProjectRoleAssignments: mockListProjectRoleAssignments,
  listProjects: vi.fn(async () => ({
    data: [],
    limit: 0,
    offset: 0,
    totalCount: 0,
    hasMore: false,
    nextOffset: null,
  })),
  probeOrganisationHubForProject: mockProbeOrganisationHubForProject,
  probeExistingProject: vi.fn(async () => null),
  probeProjectQuery: vi.fn(async () => null),
  probeProjectForUpdate: mockProbeProjectForUpdate,
  resolveProjectCommandProbe: vi.fn(async () => null),
  syncProjectUserRoles: mockSyncProjectUserRoles,
  toEntityResponseShape: vi.fn((value: unknown) => ({ data: value })),
  toPersistedProjectUserRoles: vi.fn((roles: unknown[]) => roles),
  toListResponseShape: vi.fn((value: unknown) => value),
  updateI18n: mockUpdateI18n,
  cascadeProjectOrganisationToDescendants: mockCascadeProjectOrganisationToDescendants,
  updateProjectArchivedStateById: vi.fn(async () => null),
  updateProjectByIdWithConcurrency: mockUpdateProjectByIdWithConcurrency,
  updateProjectPublishedStateById: vi.fn(async () => null),
}))

vi.mock('$lib/db/services/property', () => ({
  createPropertiesWithRelated: vi.fn(async () => undefined),
  updatePropertiesWithRelated: mockUpdatePropertiesWithRelated,
}))

vi.mock('$lib/i18n', () => ({
  toLocaleRecordFromOrganisationFormI18n: mockToLocaleRecordFromOrganisationFormI18n,
}))

vi.mock('$lib/db/zod', () => ({
  GetQueryParamsSchema: {},
  ListQueryParamsSchema: {},
  PublishProjectSchema: {},
  RemoveProjectSchema: {},
  ProjectFormData: {
    parse: mockProjectFormDataParse,
  },
}))

vi.mock('$lib/db/schema', () => ({
  project: {
    id: 'project.id',
    organisationId: 'project.organisationId',
    code: 'project.code',
    isPublished: 'project.isPublished',
    isArchived: 'project.isArchived',
    modifiedAt: 'project.modifiedAt',
  },
}))

let remote: Awaited<typeof import('$lib/api/server/project.remote')>

const buildUpdatePayload = (organisationId: string) => ({
  meta: {
    id: 'project-1',
    mode: 'update' as const,
    updatedAt: '2026-02-24T00:00:00.000Z',
  },
  data: {
    organisationId,
    code: 'project-code',
    i18n: { en: {}, zhHans: {}, zhHant: {} },
    capabilities: {},
    userRoles: [{ userId: 'u-1', role: 'owner', capabilities: {} }],
    properties: [],
  },
})

const throwingInvalid = (message: string): never => {
  throw new Error(message)
}

describe('project.remote form organisation move authz', () => {
  beforeEach(async () => {
    vi.resetModules()
    remote = await import('$lib/api/server/project.remote')
    vi.clearAllMocks()

    mockProbeProjectForUpdate.mockResolvedValue({
      id: 'project-1',
      organisationId: 'org-1',
      hubId: 'hub-a',
      code: 'project-code',
      capabilities: {},
      modifiedAt: '2026-02-24T00:00:00.000Z',
    })
    mockLoadProject.mockResolvedValue({
      id: 'project-1',
      organisationId: 'org-1',
      code: 'project-code',
      capabilities: {},
      i18n: { en: {}, zhHans: {}, zhHant: {} },
      properties: [],
      userRoles: [{ userId: 'u-1', role: 'owner', capabilities: {} }],
    })
    mockProbeOrganisationHubForProject.mockResolvedValue({
      id: 'org-2',
      hubId: 'hub-a',
    })
    mockListProjectRoleAssignments.mockResolvedValue([
      { userId: 'u-1', role: 'owner', capabilities: {} },
    ])
    mockUpdateProjectByIdWithConcurrency.mockResolvedValue({
      id: 'project-1',
      modifiedAt: '2026-02-24T01:00:00.000Z',
    })
    mockAuthorizeProjectUpdateForSubmission.mockReturnValue({ allowed: true })
    mockAuthorizeProjectCreateForSubmission.mockReturnValue({ allowed: true })
    mockAuthorizeProjectDeleteForSubmission.mockReturnValue({ allowed: true })

    mockGuardedContext.mockResolvedValue({
      db: {},
      user: { id: 'u-1', isAnonymous: false, superAdmin: false },
      userRoles: [],
      isAdminRequest: true,
      event: { locals: { hub: null }, url: new URL('https://example.test/admin') },
    })
  })

  it('allows organisation reassignment when create(target) and delete(source) are both allowed', async () => {
    const result = await remote.projectForm(
      buildUpdatePayload('org-2'),
      throwingInvalid,
    )

    expect(mockAuthorizeProjectCreateForSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        organisationId: 'org-2',
        resourceHubId: 'hub-a',
      }),
    )
    expect(mockAuthorizeProjectDeleteForSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: expect.objectContaining({
          id: 'project-1',
          organisationId: 'org-1',
          hubId: 'hub-a',
        }),
      }),
    )
    expect(mockUpdateProjectByIdWithConcurrency).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        id: 'project-1',
        data: expect.objectContaining({
          organisationId: 'org-2',
        }),
      }),
    )
    expect(mockSyncProjectUserRoles).not.toHaveBeenCalled()
    expect(mockCascadeProjectOrganisationToDescendants).toHaveBeenCalledWith(
      expect.any(Object),
      {
        projectId: 'project-1',
        organisationId: 'org-2',
      },
    )
    expect(result).toEqual({
      data: {
        id: 'project-1',
        modifiedAt: '2026-02-24T01:00:00.000Z',
      },
    })
  })

  it('rejects organisation reassignment when create(target) is denied', async () => {
    mockAuthorizeProjectCreateForSubmission.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(
      remote.projectForm(buildUpdatePayload('org-2'), throwingInvalid),
    ).rejects.toThrow('INSUFFICIENT_ROLE')

    expect(mockAuthorizeProjectDeleteForSubmission).not.toHaveBeenCalled()
    expect(mockUpdateProjectByIdWithConcurrency).not.toHaveBeenCalled()
  })

  it('rejects organisation reassignment when delete(source) is denied', async () => {
    mockAuthorizeProjectDeleteForSubmission.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(
      remote.projectForm(buildUpdatePayload('org-2'), throwingInvalid),
    ).rejects.toThrow('INSUFFICIENT_ROLE')

    expect(mockUpdateProjectByIdWithConcurrency).not.toHaveBeenCalled()
  })

  it('does not run move-specific checks when organisationId is unchanged', async () => {
    await remote.projectForm(buildUpdatePayload('org-1'), throwingInvalid)

    expect(mockAuthorizeProjectCreateForSubmission).not.toHaveBeenCalled()
    expect(mockAuthorizeProjectDeleteForSubmission).not.toHaveBeenCalled()
    expect(mockCascadeProjectOrganisationToDescendants).not.toHaveBeenCalled()
    expect(mockUpdateProjectByIdWithConcurrency).toHaveBeenCalledTimes(1)
  })

  it('normalizes submitted property ranks per type before persistence', async () => {
    const payload = buildUpdatePayload('org-1')
    payload.data.properties = [
      {
        id: 'p-class-a',
        key: 'class-a',
        type: 'classifier',
        rank: 9,
        values: [
          { id: 'pv-a-1', rank: 8, i18n: { en: {}, zhHans: {}, zhHant: {} } },
          { id: 'pv-a-2', rank: 3, i18n: { en: {}, zhHans: {}, zhHant: {} } },
        ],
      },
      { id: 'p-class-b', key: 'class-b', type: 'classifier', rank: 2 },
      { id: 'p-spec-a', key: 'spec-a', type: 'specifier' },
    ] as any

    await remote.projectForm(payload, throwingInvalid)

    expect(mockUpdatePropertiesWithRelated).toHaveBeenCalledWith(
      expect.any(Object),
      [
        expect.objectContaining({
          id: 'p-class-a',
          type: 'classifier',
          rank: 1,
          values: [
            expect.objectContaining({ id: 'pv-a-2', rank: 0 }),
            expect.objectContaining({ id: 'pv-a-1', rank: 1 }),
          ],
        }),
        expect.objectContaining({ id: 'p-class-b', type: 'classifier', rank: 0 }),
        expect.objectContaining({ id: 'p-spec-a', type: 'specifier', rank: 0 }),
      ],
      'project-1',
    )
  })

  it('skips role/property submission and persistence when userRoles and properties are omitted', async () => {
    const payload = {
      meta: {
        id: 'project-1',
        mode: 'update' as const,
        updatedAt: '2026-02-24T00:00:00.000Z',
      },
      data: {
        organisationId: 'org-1',
        code: 'project-code',
        i18n: { en: {}, zhHans: {}, zhHant: {} },
        capabilities: {},
      },
    }

    const result = await remote.projectForm(payload, throwingInvalid)

    expect(mockAuthorizeProjectUpdateForSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        submittedData: expect.not.objectContaining({
          userRoles: expect.anything(),
          properties: expect.anything(),
        }),
      }),
    )
    expect(mockListProjectRoleAssignments).not.toHaveBeenCalled()
    expect(mockSyncProjectUserRoles).not.toHaveBeenCalled()
    expect(mockUpdatePropertiesWithRelated).not.toHaveBeenCalled()
    expect(mockUpdateProjectByIdWithConcurrency).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      data: {
        id: 'project-1',
        modifiedAt: '2026-02-24T01:00:00.000Z',
      },
    })
  })
})
