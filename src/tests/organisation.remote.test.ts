import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetRequestEvent,
  mockSetupRequestHandler,
  mockAuthorizeOrganisationPublish,
  mockAuthorizeOrganisationDelete,
  mockAuthorizeOrganisationRead,
  mockAuthorizeOrganisationList,
  mockToQueryConditions,
  mockToAuthMessage,
  mockUpdateOrganisationById,
  mockLoadOrganisation,
  mockListOrganisations,
} = vi.hoisted(() => ({
  mockGetRequestEvent: vi.fn(),
  mockSetupRequestHandler: vi.fn(),
  mockAuthorizeOrganisationPublish: vi.fn(),
  mockAuthorizeOrganisationDelete: vi.fn(),
  mockAuthorizeOrganisationRead: vi.fn(),
  mockAuthorizeOrganisationList: vi.fn(),
  mockToQueryConditions: vi.fn(),
  mockToAuthMessage: vi.fn((code: string) => code),
  mockUpdateOrganisationById: vi.fn(),
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
  toOrganisationSubmittedFields: (_data: unknown) => [],
  toOrganisationUserRoleSignature: (_roles: unknown[]) => '',
  authorizeOrganisationRead: mockAuthorizeOrganisationRead,
  authorizeOrganisationList: mockAuthorizeOrganisationList,
  authorizeOrganisationCreate: () => ({ allowed: true }),
  authorizeOrganisationUpdate: () => ({ allowed: true }),
  authorizeOrganisationManageRoles: () => ({ allowed: true }),
  authorizeOrganisationPublish: mockAuthorizeOrganisationPublish,
  authorizeOrganisationDelete: mockAuthorizeOrganisationDelete,
}))

vi.mock('$lib/api/services/organisation', () => ({
  toQueryConditions: mockToQueryConditions,
  organisationWithRelations: {},
}))

vi.mock('$lib/db/services/organisation', () => ({
  createI18n: vi.fn(),
  createOrganisation: vi.fn(),
  createUserRoles: vi.fn(),
  listOrganisations: mockListOrganisations,
  getOrganisation: mockLoadOrganisation,
  updateI18n: vi.fn(),
  updateOrganisationById: mockUpdateOrganisationById,
  updateUserRoles: vi.fn(),
  toPersistedOrganisationUserRoles: vi.fn(),
  toEntityResponseShape: vi.fn(),
  toListResponseShape: vi.fn(),
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
  OrganisationFormData: {},
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

import {
  getOrganisations,
  getOrganisation,
  publishOrganisation,
  archiveOrganisation,
} from '$lib/api/server/organisation.remote'

const buildDb = (
  probeRows: Array<{
    id: string
    hubId: string | null
    isPublished?: boolean
    isArchived?: boolean
  }>,
) => ({
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => probeRows),
      })),
    })),
  })),
})

describe('organisation.remote authz', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetRequestEvent.mockReturnValue({ locals: { hub: null } })
    mockToAuthMessage.mockImplementation((code: string) => code)
    mockAuthorizeOrganisationRead.mockReturnValue({ allowed: true })
    mockAuthorizeOrganisationList.mockReturnValue({ allowed: true })
    mockToQueryConditions.mockReturnValue({ conditions: [], filtersToApply: {} })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('getOrganisations denies when authz denies', async () => {
    mockSetupRequestHandler.mockResolvedValue({
      db: {},
      user: { id: 'u-1', isAnonymous: false },
      userRoles: [],
      isAdminRequest: false,
    })
    mockAuthorizeOrganisationList.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(getOrganisations({ conditions: {} })).rejects.toMatchObject({
      status: 403,
    })
    expect(mockListOrganisations).not.toHaveBeenCalled()
  })

  it('getOrganisations uses admin-scoped query conditions for allowed unpublished requests', async () => {
    mockSetupRequestHandler.mockResolvedValue({
      db: {},
      user: { id: 'u-1', isAnonymous: false },
      userRoles: [
        {
          type: 'organisation',
          role: 'member',
          organisationId: 'org-1',
          userId: 'u-1',
        },
      ],
      isAdminRequest: false,
    })
    mockAuthorizeOrganisationList.mockReturnValue({ allowed: true })

    await getOrganisations({
      conditions: { isPublished: false, isArchived: false },
    })

    expect(mockToQueryConditions).toHaveBeenCalledWith(
      expect.any(Object),
      true,
      expect.objectContaining({ isPublished: false, isArchived: false }),
      expect.any(Array),
    )
  })

  it('getOrganisations uses admin-scoped query conditions for tri-state published filter', async () => {
    mockSetupRequestHandler.mockResolvedValue({
      db: {},
      user: { id: 'u-1', isAnonymous: false },
      userRoles: [
        {
          type: 'organisation',
          role: 'member',
          organisationId: 'org-1',
          userId: 'u-1',
        },
      ],
      isAdminRequest: false,
    })
    mockAuthorizeOrganisationList.mockReturnValue({ allowed: true })

    await getOrganisations({
      conditions: { isPublished: null, isArchived: false },
    })

    expect(mockToQueryConditions).toHaveBeenCalledWith(
      expect.any(Object),
      true,
      expect.objectContaining({ isPublished: null, isArchived: false }),
      expect.any(Array),
    )
  })

  it('getOrganisation denies when read authz denies', async () => {
    const db = buildDb([{ id: 'org-1', hubId: 'hub-a' }])
    mockSetupRequestHandler.mockResolvedValue({
      db,
      user: { id: 'u-1', isAnonymous: false },
      userRoles: [],
      isAdminRequest: false,
    })
    mockAuthorizeOrganisationRead.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(getOrganisation({ ref: 'org-1', refKey: 'id' })).rejects.toMatchObject(
      {
        status: 403,
      },
    )
    expect(mockLoadOrganisation).not.toHaveBeenCalled()
  })

  it('getOrganisation uses admin-scoped query conditions for allowed unpublished records', async () => {
    const db = buildDb([
      { id: 'org-1', hubId: 'hub-a', isPublished: false, isArchived: false },
    ])
    mockSetupRequestHandler.mockResolvedValue({
      db,
      user: { id: 'u-1', isAnonymous: false },
      userRoles: [
        {
          type: 'organisation',
          role: 'member',
          organisationId: 'org-1',
          userId: 'u-1',
        },
      ],
      isAdminRequest: false,
    })
    mockAuthorizeOrganisationRead.mockReturnValue({ allowed: true })

    await getOrganisation({ ref: 'org-1', refKey: 'id' })

    expect(mockToQueryConditions).toHaveBeenCalledWith(
      expect.any(Object),
      true,
      expect.objectContaining({ id: 'org-1' }),
      expect.any(Array),
    )
  })

  it('publishOrganisation denies when authz denies', async () => {
    const db = buildDb([{ id: 'org-1', hubId: 'hub-a' }])
    mockSetupRequestHandler.mockResolvedValue({
      db,
      user: { id: 'u-1', isAnonymous: false },
      userRoles: [],
    })
    mockAuthorizeOrganisationPublish.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(
      publishOrganisation({ id: 'org-1', state: true }),
    ).rejects.toMatchObject({
      status: 403,
    })
    expect(mockUpdateOrganisationById).not.toHaveBeenCalled()
  })

  it('publishOrganisation updates when authz allows', async () => {
    const db = buildDb([{ id: 'org-1', hubId: 'hub-a' }])
    mockSetupRequestHandler.mockResolvedValue({
      db,
      user: { id: 'u-1', isAnonymous: false },
      userRoles: [],
    })
    mockAuthorizeOrganisationPublish.mockReturnValue({ allowed: true })
    mockUpdateOrganisationById.mockResolvedValue({
      id: 'org-1',
      isPublished: true,
    })

    const result = await publishOrganisation({ id: 'org-1', state: true })
    expect(mockUpdateOrganisationById).toHaveBeenCalledWith(
      db,
      { isPublished: true },
      'org-1',
    )
    expect(result).toEqual({
      data: {
        id: 'org-1',
        isPublished: true,
      },
    })
  })

  it('archiveOrganisation denies when authz denies', async () => {
    const db = buildDb([{ id: 'org-1', hubId: 'hub-a' }])
    mockSetupRequestHandler.mockResolvedValue({
      db,
      user: { id: 'u-1', isAnonymous: false },
      userRoles: [],
    })
    mockAuthorizeOrganisationDelete.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(
      archiveOrganisation({ id: 'org-1', state: true }),
    ).rejects.toMatchObject({
      status: 403,
    })
    expect(mockUpdateOrganisationById).not.toHaveBeenCalled()
  })

  it('archiveOrganisation updates when authz allows', async () => {
    const db = buildDb([{ id: 'org-1', hubId: 'hub-a' }])
    mockSetupRequestHandler.mockResolvedValue({
      db,
      user: { id: 'u-1', isAnonymous: false },
      userRoles: [],
    })
    mockAuthorizeOrganisationDelete.mockReturnValue({ allowed: true })
    mockUpdateOrganisationById.mockResolvedValue({
      id: 'org-1',
      isArchived: true,
    })

    const result = await archiveOrganisation({ id: 'org-1', state: true })
    expect(mockUpdateOrganisationById).toHaveBeenCalledWith(
      db,
      { isArchived: true },
      'org-1',
    )
    expect(result).toEqual({
      data: {
        id: 'org-1',
        isArchived: true,
      },
    })
  })

  it('publishOrganisation returns 404 when organisation is missing', async () => {
    const db = buildDb([])
    mockSetupRequestHandler.mockResolvedValue({
      db,
      user: { id: 'u-1', isAnonymous: false },
      userRoles: [],
    })

    await expect(
      publishOrganisation({ id: 'org-1', state: true }),
    ).rejects.toMatchObject({
      status: 404,
    })
  })
})
