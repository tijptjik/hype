import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetRequestEvent,
  mockSetupRequestHandler,
  mockAuthorizeOrganisationListForContext,
  mockAuthorizeOrganisationReadForProbe,
  mockAuthorizeOrganisationPublishForSubmission,
  mockAuthorizeOrganisationDeleteForSubmission,
  mockToQueryConditions,
  mockToLookupConditions,
  mockToRequestedListState,
  mockGetOrganisationWithRelations,
  mockToOrganisationProfile,
  mockToAuthMessage,
  mockProbeOrganisationQuery,
  mockProbeOrganisationForCommand,
  mockUpdateOrganisationPublishedStateById,
  mockUpdateOrganisationArchivedStateById,
  mockLoadOrganisation,
  mockListOrganisations,
} = vi.hoisted(() => ({
  mockGetRequestEvent: vi.fn(),
  mockSetupRequestHandler: vi.fn(),
  mockAuthorizeOrganisationListForContext: vi.fn(),
  mockAuthorizeOrganisationReadForProbe: vi.fn(),
  mockAuthorizeOrganisationPublishForSubmission: vi.fn(),
  mockAuthorizeOrganisationDeleteForSubmission: vi.fn(),
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
  mockUpdateOrganisationPublishedStateById: vi.fn(),
  mockUpdateOrganisationArchivedStateById: vi.fn(),
  mockLoadOrganisation: vi.fn(),
  mockListOrganisations: vi.fn(),
}))

vi.mock(
  '$app/server',
  () => ({
    getRequestEvent: mockGetRequestEvent,
    query: (_schema: unknown, handler: unknown) => handler,
    form: (_schema: unknown, handler: unknown) => handler,
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
  invalid: (..._issues: unknown[]) => {
    const err = new Error('INVALID')
    throw err
  },
}))

vi.mock('$lib/api', () => ({
  setupRequestHandler: mockSetupRequestHandler,
  getValidQueryParams: (_table: unknown, params: unknown) => params,
}))

vi.mock('$lib/api/services/authz', () => ({
  isReservedCode: (_value: string) => false,
  toAuthMessage: mockToAuthMessage,
  toIssueDetailMessage: (code: string) => code,
  toOrganisationUserRoleSignature: (_roles: unknown[]) => '',
  authorizeOrganisationListForContext: mockAuthorizeOrganisationListForContext,
  authorizeOrganisationReadForProbe: mockAuthorizeOrganisationReadForProbe,
  authorizeOrganisationCreateForSubmission: () => ({ allowed: true }),
  authorizeOrganisationUpdateForSubmission: () => ({ allowed: true }),
  authorizeOrganisationManageRolesForSubmission: () => ({ allowed: true }),
  authorizeOrganisationPublishForSubmission:
    mockAuthorizeOrganisationPublishForSubmission,
  authorizeOrganisationDeleteForSubmission:
    mockAuthorizeOrganisationDeleteForSubmission,
}))

vi.mock('$lib/api/services/organisation', () => ({
  toQueryConditions: mockToQueryConditions,
  toLookupConditions: mockToLookupConditions,
  toRequestedListState: mockToRequestedListState,
  getOrganisationWithRelations: mockGetOrganisationWithRelations,
  toOrganisationProfile: mockToOrganisationProfile,
}))

vi.mock('$lib/db/services/organisation', () => ({
  createI18n: vi.fn(),
  createOrganisation: vi.fn(),
  createUserRoles: vi.fn(),
  listOrganisations: mockListOrganisations,
  probeExistingOrganisation: vi.fn(async () => null),
  probeOrganisationForUpdate: vi.fn(async () => null),
  probeOrganisationForCommand: mockProbeOrganisationForCommand,
  probeOrganisationQuery: mockProbeOrganisationQuery,
  getOrganisation: mockLoadOrganisation,
  updateI18n: vi.fn(),
  updateOrganisationByIdWithConcurrency: vi.fn(async () => null),
  updateOrganisationPublishedStateById: mockUpdateOrganisationPublishedStateById,
  updateOrganisationArchivedStateById: mockUpdateOrganisationArchivedStateById,
  syncOrganisationUserRoles: vi.fn(),
  toPersistedOrganisationUserRoles: vi.fn(),
  toEntityResponseShape: vi.fn((value: unknown) => ({ data: value })),
  toListResponseShape: vi.fn((value: unknown) => value),
}))

vi.mock('$lib/db/schema', () => ({
  organisation: {
    id: 'organisation.id',
    hubId: 'organisation.hubId',
    code: 'organisation.code',
    isPublished: 'organisation.isPublished',
    isArchived: 'organisation.isArchived',
    modifiedAt: 'organisation.modifiedAt',
  },
  organisationRole: {
    userId: 'organisationRole.userId',
    role: 'organisationRole.role',
    organisationId: 'organisationRole.organisationId',
  },
}))

vi.mock('$lib/db/zod', () => ({
  ListQueryParamsSchema: {},
  GetQueryParamsSchema: {},
  OrganisationFormData: { parse: (value: unknown) => value },
  PublishOrganisationSchema: {},
  RemoveOrganisationSchema: {},
}))

vi.mock('$lib/i18n', () => ({
  m: {
    admin__validation_code_already_exists: () => 'Code already exists',
    missing_permissions: () => 'Missing Permissions',
  },
  toLocaleRecordFromOrganisationFormI18n: vi.fn(),
}))

let remote: Awaited<typeof import('$lib/api/server/organisation.remote')>

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
    mockAuthorizeOrganisationPublishForSubmission.mockReturnValue({ allowed: true })
    mockAuthorizeOrganisationDeleteForSubmission.mockReturnValue({ allowed: true })

    mockToQueryConditions.mockReturnValue({ conditions: [], filtersToApply: {} })
    mockProbeOrganisationQuery.mockResolvedValue({
      id: 'org-1',
      hubId: 'hub-a',
      isPublished: true,
      isArchived: false,
    })
    mockProbeOrganisationForCommand.mockResolvedValue({ id: 'org-1', hubId: 'hub-a' })
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
})
