import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetRequestEvent,
  mockSetupRequestHandler,
  mockGetUsersForHydration,
  mockSearchUsersByConditions,
  mockToUserSearchTextCondition,
  mockToEntityResponseShape,
  mockToAuthMessage,
} = vi.hoisted(() => ({
  mockGetRequestEvent: vi.fn(),
  mockSetupRequestHandler: vi.fn(),
  mockGetUsersForHydration: vi.fn(),
  mockSearchUsersByConditions: vi.fn(),
  mockToUserSearchTextCondition: vi.fn(),
  mockToEntityResponseShape: vi.fn(),
  mockToAuthMessage: vi.fn((code: string) => code),
}))

vi.mock(
  '$app/server',
  () => ({
    getRequestEvent: mockGetRequestEvent,
    query: (_schema: unknown, handler: unknown) => handler,
  }),
  { virtual: true },
)

vi.mock('@sveltejs/kit', () => ({
  error: (status: number, message: string) => {
    const err = new Error(message) as Error & { status: number }
    err.status = status
    throw err
  },
}))

vi.mock('$lib/api', () => ({
  setupRequestHandler: mockSetupRequestHandler,
}))

vi.mock('$lib/types', () => ({}))

vi.mock('$lib/enums', () => ({
  HierarchicalResource: {
    feature: 'feature',
  },
}))

vi.mock('$lib/db', () => ({
  applyPrismConstraints: vi.fn(() => []),
}))

vi.mock('$lib/api/services/authz', () => ({
  toAuthMessage: mockToAuthMessage,
  canSearchUsers: (params: {
    superAdmin?: boolean | null
    userRoles: Array<{ type: string; role: string }>
  }) => {
    if (params.superAdmin) return true
    return params.userRoles.some(role => {
      if (role.type === 'hub') return role.role === 'admin'
      if (role.type === 'organisation') return role.role === 'owner'
      if (role.type === 'project') return role.role === 'owner'
      return false
    })
  },
  canOverrideUserSearchArchivedFilter: (params: {
    superAdmin?: boolean | null
    userRoles: Array<{ type: string; role: string }>
  }) => {
    if (params.superAdmin) return true
    return params.userRoles.some(role => role.type === 'hub' && role.role === 'admin')
  },
}))

vi.mock('$lib/api/services/user', () => ({
  assertPermissionsToUpdateUser: vi.fn(),
  getUserQueryContext: vi.fn(() => ({ conditions: [] })),
  isPrivilegedArchivedSearchRequested: (state: { isArchived: boolean | null }) =>
    state.isArchived === true || state.isArchived === null,
  toEntityRoleExistsCondition: vi.fn(() => ({ fn: 'exists' })),
  toParentChainCondition: vi.fn(async () => ({ fn: 'parent-chain' })),
  toRequestedSearchState: (conditions: { isArchived?: unknown }) => ({
    isArchived:
      conditions.isArchived === undefined
        ? false
        : (conditions.isArchived as boolean | null),
  }),
  toUserSearchPagingAndSorting: (params: {
    pagination?: { limit?: number; offset?: number }
    sorting?: { sortBy?: string; sortOrder?: string }
  }) => ({
    limit: Math.min(params.pagination?.limit ?? 20, 100),
    offset: params.pagination?.offset ?? 0,
    sortBy:
      params.sorting?.sortBy === 'email' ||
      params.sorting?.sortBy === 'createdAt' ||
      params.sorting?.sortBy === 'updatedAt'
        ? params.sorting.sortBy
        : 'name',
    sortOrder: params.sorting?.sortOrder === 'desc' ? 'desc' : 'asc',
  }),
  userEntityWithRelations: {},
}))

vi.mock('$lib/api/server/remote', () => ({
  guardedQuery: (_schema: unknown, handler: unknown) => handler,
  guardedCommand: (_schema: unknown, handler: unknown) => handler,
  guardedBatchByIdQuery:
    (_schema: unknown, fn: unknown) =>
    async (arg: { id: string; meta?: { profile?: string } }) => {
      const event = mockGetRequestEvent()
      const ctx = await mockSetupRequestHandler(event)
      const resolver = await (
        fn as (params: {
          args: Array<{ id: string; meta?: { profile?: string } }>
          ids: string[]
          ctx: unknown
        }) => Promise<(output: { id: string; meta?: { profile?: string } }) => unknown>
      )({
        args: [arg],
        ids: [arg.id],
        ctx,
      })
      return resolver(arg)
    },
}))

vi.mock('$lib/db/services/user', () => ({
  getUsersForHydration: mockGetUsersForHydration,
  searchUsersByConditions: mockSearchUsersByConditions,
  toUserSearchTextCondition: mockToUserSearchTextCondition,
  toEntityResponseShape: mockToEntityResponseShape,
}))

vi.mock('$lib/db/services/hub', () => ({
  getFeatureHubFilter: vi.fn(() => undefined),
}))

vi.mock('$lib/db/zod', () => ({
  AddUserFeatureToListSchema: {},
  GetUserFeaturesParamsSchema: {},
  GetUserLayersParamsSchema: {},
  GetUserParamsSchema: {},
  RemoveUserFeatureFromListSchema: {},
  SetUserLayerDefaultsSchema: {},
  UpdateUserParamsSchema: {},
  UserAdminListProfileAPI: {
    parse: (value: unknown) => value,
  },
  UserHydrationSchema: {},
  UserSearchQueryParamsSchema: {},
}))

vi.mock('$lib/db/schema/index', () => ({
  feature: {
    id: 'feature.id',
    organisationId: 'feature.organisationId',
  },
  featureImage: {
    featureId: 'featureImage.featureId',
    imageId: 'featureImage.imageId',
  },
  user: {
    id: 'user.id',
    name: 'user.name',
    email: 'user.email',
    image: 'user.image',
    attribution: 'user.attribution',
    username: 'user.username',
    isArchived: 'user.isArchived',
    createdAt: 'user.createdAt',
    updatedAt: 'user.updatedAt',
  },
  hubRole: { userId: 'hubRole.userId', role: 'hubRole.role', hubId: 'hubRole.hubId' },
  organisation: { id: 'organisation.id', hubId: 'organisation.hubId' },
  organisationRole: {
    userId: 'organisationRole.userId',
    role: 'organisationRole.role',
    organisationId: 'organisationRole.organisationId',
  },
  project: { id: 'project.id', organisationId: 'project.organisationId' },
  projectRole: {
    userId: 'projectRole.userId',
    role: 'projectRole.role',
    projectId: 'projectRole.projectId',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ fn: 'and', args }),
  asc: (column: unknown) => ({ fn: 'asc', column }),
  desc: (column: unknown) => ({ fn: 'desc', column }),
  eq: (left: unknown, right: unknown) => ({ fn: 'eq', left, right }),
  exists: (value: unknown) => ({ fn: 'exists', value }),
  inArray: (left: unknown, right: unknown) => ({ fn: 'inArray', left, right }),
  like: (left: unknown, right: unknown) => ({ fn: 'like', left, right }),
  or: (...args: unknown[]) => ({ fn: 'or', args }),
  sql: (strings?: TemplateStringsArray, ...values: unknown[]) => ({
    fn: 'sql',
    strings,
    values,
  }),
}))

let remote: Awaited<typeof import('$lib/api/server/user.remote')>

describe('user.remote', () => {
  beforeEach(async () => {
    vi.resetModules()
    remote = await import('$lib/api/server/user.remote')
    vi.clearAllMocks()

    mockGetRequestEvent.mockReturnValue({
      locals: { user: { id: 'u-1' } },
      platform: { env: {} },
      request: { method: 'POST' },
    })

    mockSetupRequestHandler.mockResolvedValue({
      db: {},
      session: { id: 's-1' },
      user: { id: 'u-1', isAnonymous: false, superAdmin: false },
      userId: 'u-1',
      userRoles: [],
      isAdminRequest: false,
      request: { method: 'POST' },
    })
    mockSearchUsersByConditions.mockResolvedValue({ data: [], totalCount: 0 })
    mockToUserSearchTextCondition.mockReturnValue({
      fn: 'or',
      args: [],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('getUserForAttribution returns null for archived users', async () => {
    mockGetUsersForHydration.mockResolvedValue([
      { id: 'u-1', isArchived: true, attribution: 'X' },
    ])

    const result = await remote.getUserForAttribution({ id: 'u-1' })

    expect(result).toBeNull()
    expect(mockToEntityResponseShape).not.toHaveBeenCalled()
  })

  it('getUserForAttribution uses explicit meta.profile when provided', async () => {
    const row = { id: 'u-1', isArchived: false, attribution: 'A' }
    mockGetUsersForHydration.mockResolvedValue([row])
    mockToEntityResponseShape.mockReturnValue({ id: 'u-1', attribution: 'A' })

    const result = await remote.getUserForAttribution({
      id: 'u-1',
      meta: { profile: 'admin' as const },
    })

    expect(result).toEqual({ id: 'u-1', attribution: 'A' })
    expect(mockToEntityResponseShape).toHaveBeenCalledWith(row, 'admin')
  })

  it('getUserForAttribution defaults profile to card when context is admin', async () => {
    const row = { id: 'u-1', isArchived: false, attribution: 'A' }
    mockSetupRequestHandler.mockResolvedValue({
      db: {},
      session: { id: 's-1' },
      user: { id: 'u-1', isAnonymous: false, superAdmin: true },
      userId: 'u-1',
      userRoles: [],
      isAdminRequest: true,
      request: { method: 'POST' },
    })
    mockGetUsersForHydration.mockResolvedValue([row])
    mockToEntityResponseShape.mockReturnValue({ id: 'u-1', attribution: 'A' })

    await remote.getUserForAttribution({ id: 'u-1' })

    expect(mockToEntityResponseShape).toHaveBeenCalledWith(row, 'card')
  })

  it('getUserForAttribution defaults profile to attribution for non-admin context', async () => {
    const row = { id: 'u-1', isArchived: false, attribution: 'A' }
    mockGetUsersForHydration.mockResolvedValue([row])
    mockToEntityResponseShape.mockReturnValue({ id: 'u-1', attribution: 'A' })

    await remote.getUserForAttribution({ id: 'u-1' })

    expect(mockToEntityResponseShape).toHaveBeenCalledWith(row, 'attribution')
  })

  it('searchUsers caps limit at 100 and parses count rows', async () => {
    const db = { __tag: 'db-caps-limit' }
    mockSearchUsersByConditions.mockResolvedValue({
      data: [
        {
          id: 'u-1',
          name: 'Alice',
          email: 'alice@example.com',
          image: null,
          attribution: 'Alice',
        },
      ],
      totalCount: 7,
    })

    mockSetupRequestHandler.mockResolvedValue({
      db,
      session: { id: 's-1' },
      user: { id: 'u-1', isAnonymous: false, superAdmin: false },
      userId: 'u-1',
      userRoles: [
        {
          type: 'organisation',
          role: 'owner',
          organisationId: 'org-1',
          userId: 'u-1',
        },
      ],
      isAdminRequest: false,
      request: { method: 'POST' },
    })

    const result = await remote.searchUsers({
      q: '',
      pagination: { limit: 999, offset: 3 },
      sorting: { sortBy: 'createdAt', sortOrder: 'desc' },
    })

    expect(result).toMatchObject({
      limit: 100,
      offset: 3,
      totalCount: 7,
      data: [
        {
          id: 'u-1',
          name: 'Alice',
          email: 'alice@example.com',
          image: null,
          attribution: 'Alice',
        },
      ],
    })
    const searchParams = mockSearchUsersByConditions.mock.calls[0]?.[1]
    const searchDb = mockSearchUsersByConditions.mock.calls[0]?.[0]
    expect(searchDb).toBe(db)
    expect(searchParams).toMatchObject({
      limit: 100,
      offset: 3,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    })
    expect(searchParams?.conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fn: 'eq',
          left: 'user.isArchived',
          right: false,
        }),
      ]),
    )
  })

  it('searchUsers denies when caller has no ownership/admin role and is not superAdmin', async () => {
    const db = { __tag: 'db-deny-no-role' }

    mockSetupRequestHandler.mockResolvedValue({
      db,
      session: { id: 's-1' },
      user: { id: 'u-1', isAnonymous: false, superAdmin: false },
      userId: 'u-1',
      userRoles: [
        {
          type: 'organisation',
          role: 'member',
          organisationId: 'org-1',
          userId: 'u-1',
        },
      ],
      isAdminRequest: false,
      request: { method: 'POST' },
    })

    await expect(
      remote.searchUsers({
        q: '',
        pagination: { limit: 20, offset: 0 },
        sorting: { sortBy: 'name', sortOrder: 'asc' },
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect(mockToAuthMessage).toHaveBeenCalledWith('INSUFFICIENT_ROLE')
  })

  it('searchUsers allows superAdmin to explicitly set conditions.isArchived=true', async () => {
    const db = { __tag: 'db-superadmin-archived-true' }

    mockSetupRequestHandler.mockResolvedValue({
      db,
      session: { id: 's-1' },
      user: { id: 'u-1', isAnonymous: false, superAdmin: true },
      userId: 'u-1',
      userRoles: [],
      isAdminRequest: false,
      request: { method: 'POST' },
    })

    await remote.searchUsers({
      q: '',
      conditions: { isArchived: true },
      pagination: { limit: 20, offset: 0 },
      sorting: { sortBy: 'name', sortOrder: 'asc' },
    })

    const searchParams = mockSearchUsersByConditions.mock.calls[0]?.[1]
    const searchDb = mockSearchUsersByConditions.mock.calls[0]?.[0]
    expect(searchDb).toBe(db)
    expect(searchParams?.conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fn: 'eq',
          left: 'user.isArchived',
          right: true,
        }),
      ]),
    )
  })

  it('searchUsers allows hub admin to explicitly set conditions.isArchived=true', async () => {
    const db = { __tag: 'db-hub-admin-archived-true' }

    mockSetupRequestHandler.mockResolvedValue({
      db,
      session: { id: 's-1' },
      user: { id: 'u-1', isAnonymous: false, superAdmin: false },
      userId: 'u-1',
      userRoles: [
        {
          type: 'hub',
          role: 'admin',
          hubId: 'hub-1',
          userId: 'u-1',
        },
      ],
      isAdminRequest: false,
      request: { method: 'POST' },
    })

    await remote.searchUsers({
      q: '',
      conditions: { isArchived: true },
      pagination: { limit: 20, offset: 0 },
      sorting: { sortBy: 'name', sortOrder: 'asc' },
    })

    const searchParams = mockSearchUsersByConditions.mock.calls[0]?.[1]
    const searchDb = mockSearchUsersByConditions.mock.calls[0]?.[0]
    expect(searchDb).toBe(db)
    expect(searchParams?.conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fn: 'eq',
          left: 'user.isArchived',
          right: true,
        }),
      ]),
    )
  })

  it('searchUsers denies owner when explicitly setting conditions.isArchived', async () => {
    const db = { __tag: 'db-owner-archived-true-deny' }

    mockSetupRequestHandler.mockResolvedValue({
      db,
      session: { id: 's-1' },
      user: { id: 'u-1', isAnonymous: false, superAdmin: false },
      userId: 'u-1',
      userRoles: [
        {
          type: 'organisation',
          role: 'owner',
          organisationId: 'org-1',
          userId: 'u-1',
        },
      ],
      isAdminRequest: false,
      request: { method: 'POST' },
    })

    await expect(
      remote.searchUsers({
        q: '',
        conditions: { isArchived: true },
        pagination: { limit: 20, offset: 0 },
        sorting: { sortBy: 'name', sortOrder: 'asc' },
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect(mockToAuthMessage).toHaveBeenCalledWith('FIELD_FORBIDDEN')
  })

  it('searchUsers allows owner to explicitly set conditions.isArchived=false', async () => {
    const db = { __tag: 'db-owner-archived-false' }

    mockSetupRequestHandler.mockResolvedValue({
      db,
      session: { id: 's-1' },
      user: { id: 'u-1', isAnonymous: false, superAdmin: false },
      userId: 'u-1',
      userRoles: [
        {
          type: 'organisation',
          role: 'owner',
          organisationId: 'org-1',
          userId: 'u-1',
        },
      ],
      isAdminRequest: false,
      request: { method: 'POST' },
    })

    await expect(
      remote.searchUsers({
        q: '',
        conditions: { isArchived: false },
        pagination: { limit: 20, offset: 0 },
        sorting: { sortBy: 'name', sortOrder: 'asc' },
      }),
    ).resolves.toMatchObject({
      limit: 20,
      offset: 0,
      totalCount: 0,
      data: [],
    })
    const searchDb = mockSearchUsersByConditions.mock.calls[0]?.[0]
    expect(searchDb).toBe(db)
  })

  it('searchUsers denies owner when explicitly setting conditions.isArchived=null', async () => {
    const db = { __tag: 'db-owner-archived-null-deny' }

    mockSetupRequestHandler.mockResolvedValue({
      db,
      session: { id: 's-1' },
      user: { id: 'u-1', isAnonymous: false, superAdmin: false },
      userId: 'u-1',
      userRoles: [
        {
          type: 'organisation',
          role: 'owner',
          organisationId: 'org-1',
          userId: 'u-1',
        },
      ],
      isAdminRequest: false,
      request: { method: 'POST' },
    })

    await expect(
      remote.searchUsers({
        q: '',
        conditions: { isArchived: null },
        pagination: { limit: 20, offset: 0 },
        sorting: { sortBy: 'name', sortOrder: 'asc' },
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect(mockToAuthMessage).toHaveBeenCalledWith('FIELD_FORBIDDEN')
  })

  it('searchUsers allows superAdmin to set conditions.isArchived=null (no archived filter)', async () => {
    const db = { __tag: 'db-superadmin-archived-null' }

    mockSetupRequestHandler.mockResolvedValue({
      db,
      session: { id: 's-1' },
      user: { id: 'u-1', isAnonymous: false, superAdmin: true },
      userId: 'u-1',
      userRoles: [],
      isAdminRequest: false,
      request: { method: 'POST' },
    })

    await remote.searchUsers({
      q: '',
      conditions: { isArchived: null },
      pagination: { limit: 20, offset: 0 },
      sorting: { sortBy: 'name', sortOrder: 'asc' },
    })

    const searchParams = mockSearchUsersByConditions.mock.calls[0]?.[1]
    const searchDb = mockSearchUsersByConditions.mock.calls[0]?.[0]
    expect(searchDb).toBe(db)
    expect(searchParams?.conditions).toEqual([])
  })
})
