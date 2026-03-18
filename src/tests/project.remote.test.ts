import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPolicyMatrixReporter } from './policy-matrix-report'

const {
  mockProjectFormDataParse,
  mockToLocaleRecordFromOrganisationFormI18n,
  mockProbeProjectForUpdate,
  mockLoadProject,
  mockProbeOrganisationHubForProject,
  mockListProjectRoleAssignments,
  mockMergeOrganisationCapabilities,
  mockUpdateProjectByIdWithConcurrency,
  mockCascadeProjectOrganisationToDescendants,
  mockUpdatePropertiesWithRelated,
  mockListResolvedProjectProperties,
  mockUpdateI18n,
  mockSyncProjectUserRoles,
  mockAuthorizeProjectUpdateForSubmission,
  mockAuthorizeProjectCreateForSubmission,
  mockAuthorizeProjectDeleteForSubmission,
  mockAuthorizeProjectPublishForSubmission,
  mockAuthorizeProjectManageRolesForSubmission,
  mockAuthorizeProjectAssignCapabilitiesForSubmission,
  mockAuthorizeProjectManageCapabilitiesForSubmission,
  mockValidateUniqueNonReservedCode,
  mockResolveProjectCommandProbe,
  mockUpdateProjectPublishedStateById,
  mockUpdateProjectArchivedStateById,
  mockGuardedContext,
} = vi.hoisted(() => ({
  mockProjectFormDataParse: vi.fn((input: unknown) => input),
  mockToLocaleRecordFromOrganisationFormI18n: vi.fn(() => ({})),
  mockProbeProjectForUpdate: vi.fn(async () => null),
  mockLoadProject: vi.fn(async () => null),
  mockProbeOrganisationHubForProject: vi.fn(async () => null),
  mockListProjectRoleAssignments: vi.fn(async () => []),
  mockMergeOrganisationCapabilities: vi.fn(
    async (_db: unknown, _organisationId: string, projectCapabilities: unknown) =>
      projectCapabilities ?? {},
  ),
  mockUpdateProjectByIdWithConcurrency: vi.fn(async () => null),
  mockCascadeProjectOrganisationToDescendants: vi.fn(async () => undefined),
  mockUpdatePropertiesWithRelated: vi.fn(async () => []),
  mockListResolvedProjectProperties: vi.fn(async () => []),
  mockUpdateI18n: vi.fn(async () => undefined),
  mockSyncProjectUserRoles: vi.fn(async () => undefined),
  mockAuthorizeProjectUpdateForSubmission: vi.fn(() => ({ allowed: true })),
  mockAuthorizeProjectCreateForSubmission: vi.fn(() => ({ allowed: true })),
  mockAuthorizeProjectDeleteForSubmission: vi.fn(() => ({ allowed: true })),
  mockAuthorizeProjectPublishForSubmission: vi.fn(() => ({ allowed: true })),
  mockAuthorizeProjectManageRolesForSubmission: vi.fn(() => ({ allowed: true })),
  mockAuthorizeProjectAssignCapabilitiesForSubmission: vi.fn(() => ({ allowed: true })),
  mockAuthorizeProjectManageCapabilitiesForSubmission: vi.fn(() => ({ allowed: true })),
  mockValidateUniqueNonReservedCode: vi.fn(async () => undefined),
  mockResolveProjectCommandProbe: vi.fn(async () => ({
    id: 'project-1',
    organisationId: 'org-1',
    hubId: 'hub-a',
  })),
  mockUpdateProjectPublishedStateById: vi.fn(async () => null),
  mockUpdateProjectArchivedStateById: vi.fn(async () => null),
  mockGuardedContext: vi.fn(),
}))

vi.mock('$lib/api/server/remote', () => ({
  guardedQuery: (_schema: unknown, handler: unknown) => handler,
  guardedCommand: (_schema: unknown, handler: unknown) => async (input: unknown) =>
    (handler as (payload: unknown, ctx: unknown) => Promise<unknown>)(
      input,
      await mockGuardedContext(),
    ),
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
  validateUniqueNonReservedCode: mockValidateUniqueNonReservedCode,
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
  resolveCanonicalScopeByPropertyId: vi.fn(async () => new Map()),
  splitSubmittedPropertiesByScope: vi.fn((properties: unknown[]) => ({
    local: properties.filter(property =>
      (() => {
        const scope = (property as { scope?: unknown } | null | undefined)?.scope
        return scope === undefined || scope === null || scope === 'project'
      })(),
    ),
    inherited: properties.filter(property =>
      (() => {
        const scope = (property as { scope?: unknown } | null | undefined)?.scope
        return scope !== undefined && scope !== null && scope !== 'project'
      })(),
    ),
  })),
  toSubmittedLocalPropertiesWithProjectId: vi.fn(
    (properties: unknown[], projectId: string) =>
      properties.map(property => ({
        ...(property as Record<string, unknown>),
        projectId,
        scope: 'project',
      })),
  ),
  toSubmittedPropertyIdSet: vi.fn(
    (properties: Array<{ id?: unknown }>) =>
      new Set(
        properties
          .map(property => property.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
  ),
  toPreservedLocalPropertiesForProject: vi.fn(
    (params: {
      existingLocalProperties: Array<{ id: string; projectId?: string; scope?: string }>
      submittedLocalPropertyIds: Set<string>
      projectId: string
    }) =>
      params.existingLocalProperties
        .filter(property => !params.submittedLocalPropertyIds.has(property.id))
        .map(property => ({
          ...property,
          projectId: params.projectId,
          hubId: null,
          scope: 'project',
        })),
  ),
  mergeProjectInheritedPropertySyncItems: vi.fn(
    (submittedInherited: unknown[], _persistedInherited: unknown[]) =>
      submittedInherited,
  ),
  toEntityResponseShape: vi.fn(async (value: unknown) => ({ data: value })),
  sanitizeSubmittedRoleCapabilities: vi.fn(
    (
      submittedRoles: Array<{
        userId: string
        role: string
        capabilities?: unknown
      }>,
    ) =>
      submittedRoles.map(role => ({
        ...role,
        capabilities: role.capabilities ?? {},
      })),
  ),
  toQueryConditions: vi.fn(() => ({ conditions: [], filtersToApply: {} })),
  toProjectProfile: vi.fn((_value: unknown, fallback: string) => fallback),
  toRequestedListState: vi.fn(() => ({ isPublished: true, isArchived: false })),
}))

vi.mock('$lib/api/services/authz', () => ({
  authorizeProjectAssignCapabilitiesForSubmission:
    mockAuthorizeProjectAssignCapabilitiesForSubmission,
  authorizeProjectCreateForSubmission: mockAuthorizeProjectCreateForSubmission,
  authorizeProjectDeleteForSubmission: mockAuthorizeProjectDeleteForSubmission,
  authorizeProjectListForContext: vi.fn(() => ({ allowed: true })),
  authorizeProjectManageCapabilitiesForSubmission:
    mockAuthorizeProjectManageCapabilitiesForSubmission,
  authorizeProjectManageRolesForSubmission:
    mockAuthorizeProjectManageRolesForSubmission,
  authorizeProjectPublishForSubmission: mockAuthorizeProjectPublishForSubmission,
  authorizeProjectReadForProbe: vi.fn(() => ({ allowed: true })),
  authorizeProjectUpdateForSubmission: mockAuthorizeProjectUpdateForSubmission,
  ensureProjectCommandAllowed: (
    decision: { allowed: boolean; code?: string },
    toIssueDetailMessage: (code: string) => string,
  ) => {
    if (decision.allowed) return
    throw new Error(toIssueDetailMessage(decision.code ?? 'INSUFFICIENT_ROLE'))
  },
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
  createUserRoles: vi.fn(async () => undefined),
  createProject: vi.fn(async () => null),
  getProject: mockLoadProject,
  listUserRoleAssignments: mockListProjectRoleAssignments,
  mergeOrganisationCapabilities: mockMergeOrganisationCapabilities,
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
  resolveProjectCommandProbe: mockResolveProjectCommandProbe,
  syncUserRoles: mockSyncProjectUserRoles,
  toEntityResponseShape: vi.fn((value: unknown) => ({ data: value })),
  toUserRoles: vi.fn((roles: unknown[]) => roles),
  toListResponseShape: vi.fn((value: unknown) => value),
  updateI18n: mockUpdateI18n,
  cascadeOrganisationToDescendants: mockCascadeProjectOrganisationToDescendants,
  updateProjectArchivedStateById: mockUpdateProjectArchivedStateById,
  updateProjectByIdWithConcurrency: mockUpdateProjectByIdWithConcurrency,
  updateProjectPublishedStateById: mockUpdateProjectPublishedStateById,
}))

vi.mock('$lib/db/services/property', () => ({
  createPropertiesWithRelated: vi.fn(async () => undefined),
  listResolvedProjectProperties: mockListResolvedProjectProperties,
  seedDefaultInheritedPropertiesForProject: vi.fn(async () => undefined),
  syncProjectInheritedProperties: vi.fn(async () => undefined),
  upsertProjectProperties: mockUpdatePropertiesWithRelated,
  updatePropertiesWithRelated: mockUpdatePropertiesWithRelated,
}))

vi.mock('$lib/i18n', async importOriginal => {
  const actual = await importOriginal<typeof import('$lib/i18n')>()
  return {
    ...actual,
    toLocaleRecordFromOrganisationFormI18n: mockToLocaleRecordFromOrganisationFormI18n,
  }
})

vi.mock('$lib/db/zod', async importOriginal => {
  const actual = await importOriginal<typeof import('$lib/db/zod')>()
  return {
    ...actual,
    GetQueryParamsSchema: {},
    ListQueryParamsSchema: {},
    PublishProjectSchema: {},
    RemoveProjectSchema: {},
    ProjectFormData: {
      parse: mockProjectFormDataParse,
    },
  }
})

vi.mock('$lib/db/schema', async importOriginal => await importOriginal())

let remote: Awaited<typeof import('$lib/api/server/project.remote')>
const policyMatrix = createPolicyMatrixReporter('project.remote')

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
    mockListResolvedProjectProperties.mockResolvedValue([])
    mockAuthorizeProjectUpdateForSubmission.mockReturnValue({ allowed: true })
    mockAuthorizeProjectCreateForSubmission.mockReturnValue({ allowed: true })
    mockAuthorizeProjectDeleteForSubmission.mockReturnValue({ allowed: true })
    mockAuthorizeProjectPublishForSubmission.mockReturnValue({ allowed: true })
    mockAuthorizeProjectManageRolesForSubmission.mockReturnValue({ allowed: true })
    mockAuthorizeProjectAssignCapabilitiesForSubmission.mockReturnValue({
      allowed: true,
    })
    mockAuthorizeProjectManageCapabilitiesForSubmission.mockReturnValue({
      allowed: true,
    })
    mockValidateUniqueNonReservedCode.mockResolvedValue(undefined)
    mockUpdateProjectPublishedStateById.mockResolvedValue({
      id: 'project-1',
      isPublished: true,
    })
    mockUpdateProjectArchivedStateById.mockResolvedValue({
      id: 'project-1',
      isArchived: true,
    })

    mockGuardedContext.mockResolvedValue({
      db: {
        query: {
          property: {
            findMany: vi.fn(async () => [
              { id: 'p-class-a', scope: 'project' },
              { id: 'p-class-b', scope: 'project' },
              { id: 'p-spec-a', scope: 'project' },
            ]),
          },
          projectProperty: {
            findMany: vi.fn(async () => []),
          },
        },
      },
      user: { id: 'u-1', isAnonymous: false, superAdmin: false },
      userRoles: [],
      isAdminRequest: true,
      event: { locals: { hub: null }, url: new URL('https://example.test/admin') },
    })
  })

  afterAll(() => {
    policyMatrix.flush()
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

  it('preserves existing local project properties when submitted snapshot omits them', async () => {
    mockListResolvedProjectProperties.mockResolvedValue([
      {
        id: 'p-local-existing',
        key: 'existingLocal',
        type: 'classifier',
        rank: 0,
        scope: 'project',
        projectId: 'project-1',
        hubId: null,
        organisationId: null,
        component: 'SelectField',
        isTranslatable: true,
        isDefaultEnabled: false,
        values: [],
        i18n: { en: {}, zhHans: {}, zhHant: {} },
      },
    ] as any)

    const payload = buildUpdatePayload('org-1')
    payload.data.properties = [
      {
        id: 'g-global-1',
        key: 'globalField',
        type: 'classifier',
        rank: 0,
        scope: 'hub',
        hubId: 'hub-a',
        values: [],
        i18n: { en: {}, zhHans: {}, zhHant: {} },
      },
    ] as any

    await remote.projectForm(payload, throwingInvalid)

    expect(mockUpdatePropertiesWithRelated).toHaveBeenCalledWith(
      expect.any(Object),
      [
        expect.objectContaining({
          id: 'p-local-existing',
          scope: 'project',
          projectId: 'project-1',
        }),
      ],
      'project-1',
    )
  })

  it('rejects duplicate property keys', async () => {
    const payload = buildUpdatePayload('org-1')
    payload.data.properties = [
      { key: 'dup', type: 'classifier' },
      { key: 'dup', type: 'specifier' },
    ] as any

    await expect(remote.projectForm(payload, throwingInvalid)).rejects.toThrow(
      'Duplicate property keys submitted',
    )
    policyMatrix.recordValidation({
      flow: 'Create/Update',
      rule: 'duplicate property keys',
      expected: 'Deny (invalid)',
      actual: 'Deny (invalid)',
    })
  })

  it('rejects stale write when updatedAt is missing', async () => {
    const payload = buildUpdatePayload('org-1')
    delete (payload.meta as { updatedAt?: string }).updatedAt

    await expect(remote.projectForm(payload, throwingInvalid)).rejects.toThrow(
      'STALE_WRITE',
    )
    policyMatrix.recordValidation({
      flow: 'Update',
      rule: 'missing meta.updatedAt',
      expected: 'Deny (invalid: STALE_WRITE)',
      actual: 'Deny (invalid: STALE_WRITE)',
      code: 'STALE_WRITE',
    })
  })

  it('rejects role membership mutation when manage roles authz denies', async () => {
    mockAuthorizeProjectManageRolesForSubmission.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    const payload = buildUpdatePayload('org-1')
    payload.data.userRoles = [
      { userId: 'u-1', role: 'owner', capabilities: {} },
      { userId: 'u-2', role: 'member', capabilities: {} },
    ] as any

    await expect(remote.projectForm(payload, throwingInvalid)).rejects.toThrow(
      'INSUFFICIENT_ROLE',
    )
    policyMatrix.recordValidation({
      flow: 'Role membership mutation',
      rule: 'actor lacks manageProjectRoles',
      expected: 'Deny (invalid with authz code)',
      actual: 'Deny (invalid with authz code)',
      code: 'INSUFFICIENT_ROLE',
    })
  })

  it('rejects role capability assignment when assign capabilities authz denies', async () => {
    mockAuthorizeProjectAssignCapabilitiesForSubmission.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })
    mockListProjectRoleAssignments.mockResolvedValue([
      { userId: 'u-1', role: 'owner', capabilities: { a: true } },
    ] as any)

    const payload = buildUpdatePayload('org-1')
    payload.data.userRoles = [
      { userId: 'u-1', role: 'owner', capabilities: { a: false } },
    ] as any

    await expect(remote.projectForm(payload, throwingInvalid)).rejects.toThrow(
      'INSUFFICIENT_ROLE',
    )
    policyMatrix.recordValidation({
      flow: 'Role capability assignment mutation',
      rule: 'actor lacks assignCapabilities',
      expected: 'Deny (invalid with authz code)',
      actual: 'Deny (invalid with authz code)',
      code: 'INSUFFICIENT_ROLE',
    })
  })

  it('rejects project capability mutation when manage capabilities authz denies', async () => {
    mockAuthorizeProjectManageCapabilitiesForSubmission.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })
    mockProbeProjectForUpdate.mockResolvedValue({
      id: 'project-1',
      organisationId: 'org-1',
      hubId: 'hub-a',
      code: 'project-code',
      capabilities: { old: true },
      modifiedAt: '2026-02-24T00:00:00.000Z',
    } as any)

    const payload = buildUpdatePayload('org-1')
    payload.data.capabilities = { next: true } as any

    await expect(remote.projectForm(payload, throwingInvalid)).rejects.toThrow(
      'INSUFFICIENT_ROLE',
    )
    policyMatrix.recordValidation({
      flow: 'Project capability config mutation',
      rule: 'actor lacks manageCapabilities',
      expected: 'Deny (invalid with authz code)',
      actual: 'Deny (invalid with authz code)',
      code: 'INSUFFICIENT_ROLE',
    })
  })

  it('denies unauthorized publish command with authz code', async () => {
    mockAuthorizeProjectPublishForSubmission.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(
      remote.publishProject({ id: 'project-1', state: true } as any),
    ).rejects.toThrow('INSUFFICIENT_ROLE')
    policyMatrix.recordValidation({
      flow: 'Unauthorized command',
      rule: 'actor lacks action permission',
      expected: 'Deny (403 + authz code)',
      actual: 'Deny (403 + authz code)',
      code: 'INSUFFICIENT_ROLE',
    })
  })
})
