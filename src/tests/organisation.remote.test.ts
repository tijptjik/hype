import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPolicyMatrixReporter } from './policy-matrix-report'

const {
  mockGetRequestEvent,
  mockSetupRequestHandler,
  mockAuthorizeOrganisationListForContext,
  mockAuthorizeOrganisationReadForProbe,
  mockAuthorizeOrganisationCreateForSubmission,
  mockAuthorizeOrganisationUpdateForSubmission,
  mockAuthorizeOrganisationManageRolesForSubmission,
  mockAuthorizeOrganisationPublishForSubmission,
  mockAuthorizeOrganisationDeleteForSubmission,
  mockValidateUniqueNonReservedCode,
  mockToQueryConditions,
  mockToLookupConditions,
  mockToRequestedListState,
  mockGetOrganisationWithRelations,
  mockToOrganisationProfile,
  mockToAuthMessage,
  mockProbeOrganisationQuery,
  mockProbeOrganisationForCommand,
  mockResolveOrganisationCommandProbe,
  mockUpdateOrganisationPublishedStateById,
  mockUpdateOrganisationArchivedStateById,
  mockLoadOrganisation,
  mockListOrganisations,
  mockCascadeOrganisationCapabilitiesToProjects,
} = vi.hoisted(() => ({
  mockGetRequestEvent: vi.fn(),
  mockSetupRequestHandler: vi.fn(),
  mockAuthorizeOrganisationListForContext: vi.fn(),
  mockAuthorizeOrganisationReadForProbe: vi.fn(),
  mockAuthorizeOrganisationCreateForSubmission: vi.fn(),
  mockAuthorizeOrganisationUpdateForSubmission: vi.fn(),
  mockAuthorizeOrganisationManageRolesForSubmission: vi.fn(),
  mockAuthorizeOrganisationPublishForSubmission: vi.fn(),
  mockAuthorizeOrganisationDeleteForSubmission: vi.fn(),
  mockValidateUniqueNonReservedCode: vi.fn(async () => undefined),
  mockToQueryConditions: vi.fn(),
  mockToLookupConditions: vi.fn((params: unknown) => params),
  mockToRequestedListState: vi.fn(() => ({ isPublished: true, isArchived: false })),
  mockGetOrganisationWithRelations: vi.fn(() => ({})),
  mockToOrganisationProfile: vi.fn((value: unknown, fallback: string) =>
    typeof value === 'string' ? value : fallback,
  ),
  mockToAuthMessage: vi.fn((code: string) => code),
  mockProbeOrganisationQuery: vi.fn(),
  mockProbeOrganisationForCommand: vi.fn(),
  mockResolveOrganisationCommandProbe: vi.fn(),
  mockUpdateOrganisationPublishedStateById: vi.fn(),
  mockUpdateOrganisationArchivedStateById: vi.fn(),
  mockLoadOrganisation: vi.fn(),
  mockListOrganisations: vi.fn(),
  mockCascadeOrganisationCapabilitiesToProjects: vi.fn(async () => undefined),
}))

vi.mock(
  '$app/server',
  () => ({
    getRequestEvent: mockGetRequestEvent,
    query: (_schema: unknown, handler: unknown) => handler,
    form: (_schema: unknown, handler: unknown) => async (input: unknown) => {
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
      return (handler as (payload: unknown, issue: unknown) => Promise<unknown>)(
        input,
        issue,
      )
    },
    command: (_schema: unknown, handler: unknown) => handler,
  }),
  { virtual: true },
)

vi.mock('@sveltejs/kit', () => ({
  error: (status: number, message: string) => {
    const err = new Error(message) as Error & { status: number }
    err.status = status
    throw err
  },
  invalid: (issue: unknown) => {
    const err = new Error(String(issue))
    throw err
  },
}))

vi.mock('$lib/api', () => ({
  setupRequestHandler: mockSetupRequestHandler,
  getValidQueryParams: (_table: unknown, params: unknown) => params,
}))

vi.mock('$lib/types', () => ({}))

vi.mock('$lib/api/services/authz', () => ({
  isReservedCode: (_value: string) => false,
  toAuthMessage: mockToAuthMessage,
  toIssueDetailMessage: (code: string) => code,
  toOrganisationUserRoleSignature: (roles: Array<{ userId: string; role: string }>) =>
    roles
      .map(role => `${role.userId}:${role.role}`)
      .sort()
      .join('|'),
  authorizeOrganisationListForContext: mockAuthorizeOrganisationListForContext,
  authorizeOrganisationReadForProbe: mockAuthorizeOrganisationReadForProbe,
  authorizeOrganisationCreateForSubmission:
    mockAuthorizeOrganisationCreateForSubmission,
  authorizeOrganisationUpdateForSubmission:
    mockAuthorizeOrganisationUpdateForSubmission,
  authorizeOrganisationManageRolesForSubmission:
    mockAuthorizeOrganisationManageRolesForSubmission,
  authorizeOrganisationPublishForSubmission:
    mockAuthorizeOrganisationPublishForSubmission,
  authorizeOrganisationDeleteForSubmission:
    mockAuthorizeOrganisationDeleteForSubmission,
  ensureOrganisationCommandAllowed: (decision: { allowed: boolean; code?: string }) => {
    if (!decision.allowed) {
      const err = new Error(
        mockToAuthMessage(decision.code ?? 'INSUFFICIENT_ROLE'),
      ) as Error & {
        status: number
      }
      err.status = 403
      throw err
    }
  },
}))

vi.mock('$lib/api/services/organisation', () => ({
  toQueryConditions: mockToQueryConditions,
  toLookupConditions: mockToLookupConditions,
  toRequestedListState: mockToRequestedListState,
  getOrganisationWithRelations: mockGetOrganisationWithRelations,
  toOrganisationProfile: mockToOrganisationProfile,
  toListResponseShape: vi.fn((value: unknown) => value),
  toEntityResponseShape: vi.fn((value: unknown) => ({ data: value })),
  hasOrganisationCapabilitiesChanged: vi.fn(
    (params: {
      hasSubmittedCapabilitiesField: boolean
      submittedCapabilities: unknown
      currentCapabilities: unknown
    }) =>
      params.hasSubmittedCapabilitiesField &&
      JSON.stringify(params.submittedCapabilities ?? {}) !==
        JSON.stringify(params.currentCapabilities ?? {}),
  ),
}))

vi.mock('$lib/api/services/project', () => ({
  normalizeSubmittedPropertyRanks: <T>(properties: T[]) => properties,
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
  toCreatedResponseShape: (value: { id: string; modifiedAt?: string }) => ({
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

vi.mock('$lib/db/services/organisation', () => ({
  createI18n: vi.fn(),
  createOrganisation: vi.fn(),
  createUserRoles: vi.fn(),
  listUserRoleAssignments: vi.fn(async () => []),
  listOrganisationRoleAssignments: vi.fn(async () => []),
  listOrganisations: mockListOrganisations,
  probeExistingOrganisation: vi.fn(async () => null),
  probeOrganisationForUpdate: vi.fn(async () => null),
  probeOrganisationForCommand: mockProbeOrganisationForCommand,
  resolveOrganisationCommandProbe: mockResolveOrganisationCommandProbe,
  probeOrganisationQuery: mockProbeOrganisationQuery,
  getOrganisation: mockLoadOrganisation,
  updateI18n: vi.fn(),
  updateOrganisationByIdWithConcurrency: vi.fn(async () => null),
  updateOrganisationPublishedStateById: mockUpdateOrganisationPublishedStateById,
  updateOrganisationArchivedStateById: mockUpdateOrganisationArchivedStateById,
  syncUserRoles: vi.fn(),
  syncOrganisationUserRoles: vi.fn(),
  toUserRoles: vi.fn((roles: unknown[]) => roles),
  toPersistedOrganisationUserRoles: vi.fn(),
  toEntityResponseShape: vi.fn((value: unknown) => ({ data: value })),
  toListResponseShape: vi.fn((value: unknown) => value),
}))

vi.mock('$lib/db/services/property', () => ({
  syncOrganisationProperties: vi.fn(async () => undefined),
}))

vi.mock('$lib/db/services/project', () => ({
  cascadeOrganisationCapabilitiesToProjects:
    mockCascadeOrganisationCapabilitiesToProjects,
}))

vi.mock('$lib/db/schema', async importOriginal => await importOriginal())

vi.mock('$lib/db/zod', async importOriginal => {
  const actual = await importOriginal<typeof import('$lib/db/zod')>()
  return {
    ...actual,
    ListQueryParamsSchema: {},
    GetQueryParamsSchema: {},
    OrganisationFormData: { parse: (value: unknown) => value },
    PublishOrganisationSchema: {},
    RemoveOrganisationSchema: {},
  }
})

vi.mock('$lib/i18n', () => ({
  getLocale: vi.fn(() => 'en'),
  m: new Proxy(
    {},
    {
      get: () => () => '',
    },
  ),
  toLocaleRecordFromOrganisationFormI18n: vi.fn(),
}))

let remote: Awaited<typeof import('$lib/api/server/organisation.remote')>
const policyMatrix = createPolicyMatrixReporter('organisation.remote')

describe('organisation.remote authz', () => {
  beforeEach(async () => {
    vi.resetModules()
    remote = await import('$lib/api/server/organisation.remote')
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    mockGetRequestEvent.mockReturnValue({ locals: { hub: null } })
    mockToAuthMessage.mockImplementation((code: string) => code)

    mockAuthorizeOrganisationListForContext.mockReturnValue({ allowed: true })
    mockAuthorizeOrganisationReadForProbe.mockReturnValue({ allowed: true })
    mockAuthorizeOrganisationCreateForSubmission.mockReturnValue({ allowed: true })
    mockAuthorizeOrganisationUpdateForSubmission.mockReturnValue({ allowed: true })
    mockAuthorizeOrganisationManageRolesForSubmission.mockReturnValue({
      allowed: true,
    })
    mockAuthorizeOrganisationPublishForSubmission.mockReturnValue({ allowed: true })
    mockAuthorizeOrganisationDeleteForSubmission.mockReturnValue({ allowed: true })
    mockValidateUniqueNonReservedCode.mockResolvedValue(undefined)

    mockToQueryConditions.mockReturnValue({ conditions: [], filtersToApply: {} })
    mockProbeOrganisationQuery.mockResolvedValue({
      id: 'org-1',
      hubId: 'hub-a',
      isPublished: true,
      isArchived: false,
    })
    mockProbeOrganisationForCommand.mockResolvedValue({ id: 'org-1', hubId: 'hub-a' })
    mockResolveOrganisationCommandProbe.mockImplementation(
      async (_db: unknown, _id: string, onNotFound: () => never) => {
        const result = await mockProbeOrganisationForCommand()
        if (!result) return onNotFound()
        return result
      },
    )
    mockUpdateOrganisationPublishedStateById.mockResolvedValue({
      id: 'org-1',
      isPublished: true,
    })
    mockUpdateOrganisationArchivedStateById.mockResolvedValue({
      id: 'org-1',
      isArchived: true,
    })

    mockSetupRequestHandler.mockResolvedValue({
      db: {},
      user: { id: 'u-1', isAnonymous: false },
      userRoles: [],
      isAdminRequest: false,
      event: { locals: { hub: null } },
      invalid: vi.fn(),
      issue: vi.fn(),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  afterAll(() => {
    policyMatrix.flush()
  })

  it('getOrganisations denies when authz denies', async () => {
    mockAuthorizeOrganisationListForContext.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(remote.getOrganisations({ conditions: {} })).rejects.toMatchObject({
      status: 403,
    })
    expect(mockListOrganisations).not.toHaveBeenCalled()
  })

  it('getOrganisations uses admin-scoped query conditions for allowed unpublished requests', async () => {
    await remote.getOrganisations({
      conditions: { isPublished: false, isArchived: false },
      meta: { isAdminRequest: true },
    })

    expect(mockToQueryConditions).toHaveBeenCalledWith(
      expect.any(Object),
      true,
      expect.objectContaining({ isPublished: false, isArchived: false }),
      expect.any(Array),
    )
  })

  it('getOrganisations uses admin-scoped query conditions for tri-state published filter', async () => {
    await remote.getOrganisations({
      conditions: { isPublished: null, isArchived: false },
      meta: { isAdminRequest: true },
    })

    expect(mockToQueryConditions).toHaveBeenCalledWith(
      expect.any(Object),
      true,
      expect.objectContaining({ isPublished: null, isArchived: false }),
      expect.any(Array),
    )
  })

  it('getOrganisation denies when read authz denies', async () => {
    mockAuthorizeOrganisationReadForProbe.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(
      remote.getOrganisation({ ref: 'org-1', refKey: 'id' }),
    ).rejects.toMatchObject({ status: 403 })
    expect(mockLoadOrganisation).not.toHaveBeenCalled()
  })

  it('getOrganisation uses admin-scoped query conditions for allowed unpublished records', async () => {
    mockProbeOrganisationQuery.mockResolvedValue({
      id: 'org-1',
      hubId: 'hub-a',
      isPublished: false,
      isArchived: false,
    })

    await remote.getOrganisation({
      ref: 'org-1',
      refKey: 'id',
      meta: { isAdminRequest: true },
    })

    expect(mockToQueryConditions).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u-1', isAnonymous: false }),
      true,
      expect.objectContaining({ ref: 'org-1', refKey: 'id' }),
      [],
    )
  })

  it('publishOrganisation denies when authz denies', async () => {
    mockAuthorizeOrganisationPublishForSubmission.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(
      remote.publishOrganisation({ id: 'org-1', state: true }),
    ).rejects.toMatchObject({ status: 403 })
    expect(mockUpdateOrganisationPublishedStateById).not.toHaveBeenCalled()
  })

  it('publishOrganisation updates when authz allows', async () => {
    const result = await remote.publishOrganisation({ id: 'org-1', state: true })

    expect(mockUpdateOrganisationPublishedStateById).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        id: 'org-1',
        state: true,
        publisherId: 'u-1',
      }),
    )
    expect(result).toEqual({
      data: {
        id: 'org-1',
        isPublished: true,
      },
    })
  })

  it('archiveOrganisation denies when authz denies', async () => {
    mockAuthorizeOrganisationDeleteForSubmission.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(
      remote.archiveOrganisation({ id: 'org-1', state: true }),
    ).rejects.toMatchObject({ status: 403 })
    expect(mockUpdateOrganisationArchivedStateById).not.toHaveBeenCalled()
  })

  it('archiveOrganisation updates when authz allows', async () => {
    const result = await remote.archiveOrganisation({ id: 'org-1', state: true })

    expect(mockUpdateOrganisationArchivedStateById).toHaveBeenCalledWith(
      expect.any(Object),
      { id: 'org-1', state: true },
    )
    expect(result).toEqual({
      data: {
        id: 'org-1',
        isArchived: true,
      },
    })
  })

  it('publishOrganisation returns 404 when organisation is missing', async () => {
    mockProbeOrganisationForCommand.mockResolvedValue(null)

    await expect(
      remote.publishOrganisation({ id: 'org-1', state: true }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('organisationForm rejects empty userRoles', async () => {
    await expect(
      remote.organisationForm({
        meta: { mode: 'create' },
        data: {
          code: 'org-code',
          url: '',
          i18n: { en: {}, zhHans: {}, zhHant: {} },
          userRoles: [],
        },
      }),
    ).rejects.toThrow('USER_ROLES_REQUIRED')

    policyMatrix.recordValidation({
      flow: 'Create/Update',
      rule: 'userRoles empty',
      expected: 'Deny (invalid: USER_ROLES_REQUIRED)',
      actual: 'Deny (invalid: USER_ROLES_REQUIRED)',
      code: 'USER_ROLES_REQUIRED',
    })
  })

  it('organisationForm rejects missing owner in userRoles', async () => {
    await expect(
      remote.organisationForm({
        meta: { mode: 'create' },
        data: {
          code: 'org-code',
          url: '',
          i18n: { en: {}, zhHans: {}, zhHant: {} },
          userRoles: [{ userId: 'u-1', role: 'member' }],
        },
      }),
    ).rejects.toThrow('OWNER_REQUIRED')

    policyMatrix.recordValidation({
      flow: 'Create/Update',
      rule: 'no owner in userRoles',
      expected: 'Deny (invalid: OWNER_REQUIRED)',
      actual: 'Deny (invalid: OWNER_REQUIRED)',
      code: 'OWNER_REQUIRED',
    })
  })

  it('organisationForm rejects duplicate userRoles.userId', async () => {
    await expect(
      remote.organisationForm({
        meta: { mode: 'create' },
        data: {
          code: 'org-code',
          url: '',
          i18n: { en: {}, zhHans: {}, zhHant: {} },
          userRoles: [
            { userId: 'u-1', role: 'owner' },
            { userId: 'u-1', role: 'member' },
          ],
        },
      }),
    ).rejects.toThrow('Duplicate user roles submitted')

    policyMatrix.recordValidation({
      flow: 'Create/Update',
      rule: 'duplicate userRoles.userId',
      expected: 'Deny (invalid)',
      actual: 'Deny (invalid)',
    })
  })

  it('organisationForm rejects stale writes when updatedAt is missing', async () => {
    const organisationServices = await import('$lib/db/services/organisation')
    vi.mocked(organisationServices.probeOrganisationForUpdate).mockResolvedValue({
      id: 'org-1',
      code: 'org-code',
      hubId: 'hub-a',
      capabilities: {},
      modifiedAt: '2026-03-08T00:00:00.000Z',
    })

    await expect(
      remote.organisationForm({
        meta: { id: 'org-1', mode: 'update' },
        data: {
          code: 'org-code',
          url: '',
          i18n: { en: {}, zhHans: {}, zhHant: {} },
          userRoles: [{ userId: 'u-1', role: 'owner' }],
        },
      }),
    ).rejects.toThrow('STALE_WRITE')

    policyMatrix.recordValidation({
      flow: 'Update',
      rule: 'missing meta.updatedAt',
      expected: 'Deny (invalid: STALE_WRITE)',
      actual: 'Deny (invalid: STALE_WRITE)',
      code: 'STALE_WRITE',
    })
  })

  it('organisationForm rejects role mutation when manage roles authz denies', async () => {
    const organisationServices = await import('$lib/db/services/organisation')
    vi.mocked(organisationServices.probeOrganisationForUpdate).mockResolvedValue({
      id: 'org-1',
      code: 'org-code',
      hubId: 'hub-a',
      capabilities: {},
      modifiedAt: '2026-03-08T00:00:00.000Z',
    })
    vi.mocked(organisationServices.listUserRoleAssignments).mockResolvedValue([
      { userId: 'u-1', role: 'owner' },
    ])
    mockAuthorizeOrganisationManageRolesForSubmission.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(
      remote.organisationForm({
        meta: {
          id: 'org-1',
          mode: 'update',
          updatedAt: '2026-03-08T00:00:00.000Z',
        },
        data: {
          code: 'org-code',
          url: '',
          i18n: { en: {}, zhHans: {}, zhHant: {} },
          userRoles: [
            { userId: 'u-1', role: 'owner' },
            { userId: 'u-2', role: 'member' },
          ],
        },
      }),
    ).rejects.toThrow('INSUFFICIENT_ROLE')

    policyMatrix.recordValidation({
      flow: 'Role mutation',
      rule: 'actor lacks manageOrganisationRoles',
      expected: 'Deny (invalid with authz code)',
      actual: 'Deny (invalid with authz code)',
      code: 'INSUFFICIENT_ROLE',
    })
  })

  it('publishOrganisation denies unauthorized command with authz code', async () => {
    mockAuthorizeOrganisationPublishForSubmission.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(
      remote.publishOrganisation({ id: 'org-1', state: true }),
    ).rejects.toMatchObject({ status: 403 })

    policyMatrix.recordValidation({
      flow: 'Unauthorized command',
      rule: 'actor lacks action permission',
      expected: 'Deny (403 + authz code)',
      actual: 'Deny (403 + authz code)',
      code: 'INSUFFICIENT_ROLE',
    })
  })

  it('organisationForm cascades capability removals to projects and project roles', async () => {
    const organisationServices = await import('$lib/db/services/organisation')
    const probeOrganisationForUpdate = vi.mocked(
      organisationServices.probeOrganisationForUpdate,
    )
    const updateOrganisationByIdWithConcurrency = vi.mocked(
      organisationServices.updateOrganisationByIdWithConcurrency,
    )

    probeOrganisationForUpdate.mockResolvedValue({
      id: 'org-1',
      code: 'org-code',
      hubId: 'hub-a',
      capabilities: {
        manageBakeries: { i18n: {} },
        manageVolunteers: { i18n: {} },
      },
      modifiedAt: '2026-03-08T00:00:00.000Z',
    })
    updateOrganisationByIdWithConcurrency.mockResolvedValue({
      id: 'org-1',
      modifiedAt: '2026-03-08T00:00:01.000Z',
    })

    await remote.organisationForm({
      meta: {
        id: 'org-1',
        mode: 'update',
        updatedAt: '2026-03-08T00:00:00.000Z',
      },
      data: {
        code: 'org-code',
        url: '',
        i18n: { en: {}, zhHans: {}, zhHant: {} },
        userRoles: [{ userId: 'u-1', role: 'owner' }],
        capabilities: {
          manageBakeries: { i18n: {} },
        },
      },
    })

    expect(mockCascadeOrganisationCapabilitiesToProjects).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        organisationId: 'org-1',
      }),
    )
  })
})
