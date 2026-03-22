import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPolicyMatrixReporter } from './policy-matrix-report'

const {
  mockHubFormDataParse,
  mockToLocaleRecordFromOrganisationFormI18n,
  mockCreateHub,
  mockCreateI18n,
  mockCreateHubUserRoles,
  mockSyncHubOrganisations,
  mockSyncHubLayerDefaults,
  mockUpdateI18n,
  mockSyncHubUserRoles,
  mockListHubRoleAssignments,
  mockProbeExistingHub,
  mockProbeHubForUpdate,
  mockUpdateHubByIdWithConcurrency,
  mockAuthorizeHubCreateForSubmission,
  mockAuthorizeHubUpdateForSubmission,
  mockAuthorizeHubManageRolesForSubmission,
  mockAuthorizeHubPublishForSubmission,
  mockAuthorizeHubDeleteForSubmission,
  mockValidateUniqueNonReservedCode,
  mockResolveHubCommandProbe,
  mockUpdateHubPublishedStateById,
  mockUpdateHubArchivedStateById,
  mockHasInvalidHubOrganisationAssignmentsForSubmission,
  mockGuardedContext,
} = vi.hoisted(() => ({
  mockHubFormDataParse: vi.fn((input: unknown) => input),
  mockToLocaleRecordFromOrganisationFormI18n: vi.fn(() => ({})),
  mockCreateHub: vi.fn(async (_db: unknown, payload: unknown) => ({
    id: 'hub-1',
    modifiedAt: '2026-02-23T00:00:00.000Z',
    ...payload,
  })),
  mockCreateI18n: vi.fn(async () => undefined),
  mockCreateHubUserRoles: vi.fn(async () => undefined),
  mockSyncHubOrganisations: vi.fn(async () => undefined),
  mockSyncHubLayerDefaults: vi.fn(async () => undefined),
  mockUpdateI18n: vi.fn(async () => undefined),
  mockSyncHubUserRoles: vi.fn(async () => undefined),
  mockListHubRoleAssignments: vi.fn(async () => []),
  mockProbeExistingHub: vi.fn(async () => null),
  mockProbeHubForUpdate: vi.fn(async () => null),
  mockUpdateHubByIdWithConcurrency: vi.fn(async () => null),
  mockAuthorizeHubCreateForSubmission: vi.fn(() => ({ allowed: true })),
  mockAuthorizeHubUpdateForSubmission: vi.fn(() => ({ allowed: true })),
  mockAuthorizeHubManageRolesForSubmission: vi.fn(() => ({ allowed: true })),
  mockAuthorizeHubPublishForSubmission: vi.fn(() => ({ allowed: true })),
  mockAuthorizeHubDeleteForSubmission: vi.fn(() => ({ allowed: true })),
  mockValidateUniqueNonReservedCode: vi.fn(async () => undefined),
  mockResolveHubCommandProbe: vi.fn(async () => ({ id: 'hub-1' })),
  mockUpdateHubPublishedStateById: vi.fn(async () => null),
  mockUpdateHubArchivedStateById: vi.fn(async () => null),
  mockHasInvalidHubOrganisationAssignmentsForSubmission: vi.fn(async () => false),
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
    async (input: unknown, invalid: unknown) => {
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
            invalid: unknown
            issue: unknown
          },
        ) => Promise<unknown>
      )(input, {
        ...(await mockGuardedContext()),
        invalid,
        issue,
      })
    },
}))

vi.mock('$lib/db/zod', () => ({
  ListQueryParamsSchema: {},
  GetQueryParamsSchema: {},
  PublishHubSchema: {},
  RemoveHubSchema: {},
  HubFormData: {
    parse: mockHubFormDataParse,
  },
}))

vi.mock('$lib/i18n', () => ({
  m: new Proxy(
    {},
    {
      get: () => () => '',
    },
  ),
  toLocaleRecordFromOrganisationFormI18n: mockToLocaleRecordFromOrganisationFormI18n,
}))

vi.mock('$lib/api/services/project', () => ({
  normalizeSubmittedPropertyRanks: <T>(properties: T[]) => properties,
}))

vi.mock('$lib/api', () => ({
  getValidQueryParams: (_table: unknown, params: unknown) => params,
}))

vi.mock('$lib/api/services/authz', () => ({
  isReservedCode: (_value: string) => false,
  toAuthMessage: (code: string) => code,
  toIssueDetailMessage: (code: string) => code,
  toHubUserRoleSignature: (roles: Array<{ userId: string; role: string }>) =>
    roles
      .map(role => `${role.userId}:${role.role}`)
      .sort()
      .join('|'),
  authorizeHubList: () => ({ allowed: true }),
  authorizeHubReadForProbe: () => ({ allowed: true }),
  authorizeHubCreateForSubmission: mockAuthorizeHubCreateForSubmission,
  authorizeHubUpdateForSubmission: mockAuthorizeHubUpdateForSubmission,
  authorizeHubManageRolesForSubmission: mockAuthorizeHubManageRolesForSubmission,
  authorizeHubPublishForSubmission: mockAuthorizeHubPublishForSubmission,
  authorizeHubDeleteForSubmission: mockAuthorizeHubDeleteForSubmission,
  ensureHubCommandAllowed: (decision: { allowed: boolean; code?: string }) => {
    if (decision.allowed) return
    throw new Error(decision.code ?? 'INSUFFICIENT_ROLE')
  },
  hasInvalidHubOrganisationAssignmentsForSubmission:
    mockHasInvalidHubOrganisationAssignmentsForSubmission,
  toHubListConditions: vi.fn(() => []),
}))

vi.mock('$lib/api/services/hub', () => ({
  hubCollectionWithRelations: {},
  hubEntityWithRelations: {},
  toEntityResponseShape: vi.fn((row: unknown) => ({ data: row })),
  toListResponseShape: vi.fn((value: unknown) => value),
  toHubProfile: vi.fn((value: unknown, fallback: string) =>
    typeof value === 'string' ? value : fallback,
  ),
  toLookupConditions: vi.fn(() => ({})),
  toQueryConditions: vi.fn(() => []),
  toRequestedListState: vi.fn(() => ({
    isPublished: undefined,
    isArchived: undefined,
  })),
}))

vi.mock('$lib/db/services/hub', () => ({
  createHub: mockCreateHub,
  createI18n: mockCreateI18n,
  createUserRoles: mockCreateHubUserRoles,
  createHubUserRoles: mockCreateHubUserRoles,
  probeExistingHub: mockProbeExistingHub,
  probeHubForUpdate: mockProbeHubForUpdate,
  resolveHubCommandProbe: mockResolveHubCommandProbe,
  updateHubByIdWithConcurrency: mockUpdateHubByIdWithConcurrency,
  probeHubForCommand: vi.fn(async () => null),
  updateHubPublishedStateById: mockUpdateHubPublishedStateById,
  updateHubArchivedStateById: mockUpdateHubArchivedStateById,
  updateI18n: mockUpdateI18n,
  syncUserRoles: mockSyncHubUserRoles,
  syncHubUserRoles: mockSyncHubUserRoles,
  syncOrganisations: mockSyncHubOrganisations,
  listUserRoles: mockListHubRoleAssignments,
  listHubRoleAssignments: mockListHubRoleAssignments,
  listHubOrganisationLookups: vi.fn(async () => []),
  listHubs: vi.fn(),
  getHub: vi.fn(),
  syncHubOrganisations: mockSyncHubOrganisations,
  syncHubLayerDefaults: mockSyncHubLayerDefaults,
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
  validateUniqueNonReservedCode: mockValidateUniqueNonReservedCode,
}))

vi.mock('$lib/db/services/property', () => ({
  syncHubProperties: vi.fn(async () => undefined),
  syncHubGlobalProperties: vi.fn(async () => undefined),
}))

vi.mock('$lib/db/schema', () => ({
  hub: {
    id: 'hub.id',
    code: 'hub.code',
    isPublished: 'hub.isPublished',
    isArchived: 'hub.isArchived',
    modifiedAt: 'hub.modifiedAt',
  },
  hubRole: {
    hubId: 'hubRole.hubId',
    userId: 'hubRole.userId',
    role: 'hubRole.role',
  },
  organisation: {
    id: 'organisation.id',
    hubId: 'organisation.hubId',
  },
}))

let remote: Awaited<typeof import('$lib/api/server/hub.remote')>
const policyMatrix = createPolicyMatrixReporter('hub.remote')

const buildDbForCreate = () => ({
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => []),
      })),
    })),
  })),
})

const buildDbForUpdate = (params: {
  existingRoles: Array<{ userId: string; role: string }>
}) => {
  const db = {
    select: vi.fn((_shape: unknown) => ({
      from: vi.fn((table: unknown) => {
        const tableRecord = table as Record<string, unknown>
        if (tableRecord?.hubId === 'hubRole.hubId') {
          return {
            where: vi.fn(async () => params.existingRoles),
          }
        }
        return { where: vi.fn(async () => []) }
      }),
    })),
  }
  return { db }
}

describe('hub.remote form image handling', () => {
  beforeEach(async () => {
    vi.resetModules()
    remote = await import('$lib/api/server/hub.remote')
    vi.clearAllMocks()
    mockAuthorizeHubCreateForSubmission.mockReturnValue({ allowed: true })
    mockAuthorizeHubUpdateForSubmission.mockReturnValue({ allowed: true })
    mockAuthorizeHubManageRolesForSubmission.mockReturnValue({ allowed: true })
    mockAuthorizeHubPublishForSubmission.mockReturnValue({ allowed: true })
    mockAuthorizeHubDeleteForSubmission.mockReturnValue({ allowed: true })
    mockValidateUniqueNonReservedCode.mockResolvedValue(undefined)
    mockUpdateHubPublishedStateById.mockResolvedValue({
      id: 'hub-1',
      isPublished: true,
    })
    mockUpdateHubArchivedStateById.mockResolvedValue({
      id: 'hub-1',
      isArchived: true,
    })
    mockHasInvalidHubOrganisationAssignmentsForSubmission.mockResolvedValue(false)
    mockProbeExistingHub.mockResolvedValue(null)
    mockListHubRoleAssignments.mockResolvedValue([])
  })

  afterAll(() => {
    policyMatrix.flush()
  })

  it('create mode ignores imageId from incoming form payload', async () => {
    const db = buildDbForCreate()
    mockGuardedContext.mockResolvedValue({
      db,
      user: { id: 'u-1', isAnonymous: false, superAdmin: true },
      userRoles: [],
    })

    await remote.hubForm(
      {
        meta: { mode: 'create' },
        data: {
          code: 'new-hub',
          domain: '',
          imageId: 'img-123',
          i18n: { en: {}, zhHans: {}, zhHant: {} },
          userRoles: [{ userId: 'u-1', role: 'admin' }],
          organisations: [],
        },
      },
      (() => undefined),
    )

    expect(mockCreateHub).toHaveBeenCalledTimes(1)
    const createPayload = mockCreateHub.mock.calls[0]?.[1] as Record<string, unknown>
    expect(createPayload).not.toHaveProperty('imageId')
  })

  it('update mode ignores imageId from incoming form payload', async () => {
    const { db } = buildDbForUpdate({
      existingRoles: [{ userId: 'u-1', role: 'admin' }],
    })
    mockListHubRoleAssignments.mockResolvedValue([{ userId: 'u-1', role: 'admin' }])
    mockProbeHubForUpdate.mockResolvedValue({
      id: 'hub-1',
      code: 'core',
      modifiedAt: '2026-02-23T00:00:00.000Z',
    })
    mockUpdateHubByIdWithConcurrency.mockResolvedValue({
      id: 'hub-1',
      modifiedAt: '2026-02-23T01:00:00.000Z',
    })

    mockGuardedContext.mockResolvedValue({
      db,
      user: { id: 'u-1', isAnonymous: false, superAdmin: true },
      userRoles: [],
    })

    await remote.hubForm(
      {
        meta: {
          id: 'hub-1',
          mode: 'update',
          updatedAt: '2026-02-23T00:00:00.000Z',
        },
        data: {
          code: 'core',
          domain: 'example.org',
          imageId: 'img-999',
          i18n: { en: {}, zhHans: {}, zhHant: {} },
          userRoles: [{ userId: 'u-1', role: 'admin' }],
          organisations: [],
        },
      },
      (() => undefined),
    )

    expect(mockUpdateHubByIdWithConcurrency).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        data: {
          code: 'core',
          domain: 'example.org',
        },
      }),
    )
    expect(
      mockUpdateHubByIdWithConcurrency.mock.calls[0]?.[1]?.data,
    ).not.toHaveProperty('imageId')
  })

  it('rejects empty userRoles', async () => {
    const db = buildDbForCreate()
    mockGuardedContext.mockResolvedValue({
      db,
      user: { id: 'u-1', isAnonymous: false, superAdmin: true },
      userRoles: [],
    })

    await expect(
      remote.hubForm(
        {
          meta: { mode: 'create' },
          data: {
            code: 'new-hub',
            domain: '',
            i18n: { en: {}, zhHans: {}, zhHant: {} },
            userRoles: [],
            organisations: [],
          },
        },
        ((message: string) => {
          throw new Error(message)
        }),
      ),
    ).rejects.toThrow('USER_ROLES_REQUIRED')
    policyMatrix.recordValidation({
      flow: 'Create/Update',
      rule: 'userRoles empty',
      expected: 'Deny (invalid: USER_ROLES_REQUIRED)',
      actual: 'Deny (invalid: USER_ROLES_REQUIRED)',
      code: 'USER_ROLES_REQUIRED',
    })
  })

  it('rejects duplicate userRoles.userId', async () => {
    const db = buildDbForCreate()
    mockGuardedContext.mockResolvedValue({
      db,
      user: { id: 'u-1', isAnonymous: false, superAdmin: true },
      userRoles: [],
    })

    await expect(
      remote.hubForm(
        {
          meta: { mode: 'create' },
          data: {
            code: 'new-hub',
            domain: '',
            i18n: { en: {}, zhHans: {}, zhHant: {} },
            userRoles: [
              { userId: 'u-1', role: 'admin' },
              { userId: 'u-1', role: 'admin' },
            ],
            organisations: [],
          },
        },
        ((message: string) => {
          throw new Error(message)
        }),
      ),
    ).rejects.toThrow('Duplicate user roles submitted')
    policyMatrix.recordValidation({
      flow: 'Create/Update',
      rule: 'duplicate userRoles.userId',
      expected: 'Deny (invalid)',
      actual: 'Deny (invalid)',
    })
  })

  it('rejects hub scope violations on submitted organisations', async () => {
    const { db } = buildDbForUpdate({
      existingRoles: [{ userId: 'u-1', role: 'admin' }],
    })
    mockProbeHubForUpdate.mockResolvedValue({
      id: 'hub-1',
      code: 'core',
      modifiedAt: '2026-02-23T00:00:00.000Z',
    })
    mockHasInvalidHubOrganisationAssignmentsForSubmission.mockResolvedValue(true)
    mockGuardedContext.mockResolvedValue({
      db,
      user: { id: 'u-1', isAnonymous: false, superAdmin: true },
      userRoles: [],
    })

    await expect(
      remote.hubForm(
        {
          meta: {
            id: 'hub-1',
            mode: 'update',
            updatedAt: '2026-02-23T00:00:00.000Z',
          },
          data: {
            code: 'core',
            domain: '',
            i18n: { en: {}, zhHans: {}, zhHant: {} },
            userRoles: [{ userId: 'u-1', role: 'admin' }],
            organisations: [{ organisationId: 'org-1' }],
          },
        },
        ((message: string) => {
          throw new Error(message)
        }),
      ),
    ).rejects.toThrow('HUB_SCOPE_FORBIDDEN')
    policyMatrix.recordValidation({
      flow: 'Update',
      rule: 'submitted organisation assignment outside actor scope',
      expected: 'Deny (invalid: HUB_SCOPE_FORBIDDEN)',
      actual: 'Deny (invalid: HUB_SCOPE_FORBIDDEN)',
      code: 'HUB_SCOPE_FORBIDDEN',
    })
  })

  it('rejects stale write when updatedAt is missing', async () => {
    const { db } = buildDbForUpdate({
      existingRoles: [{ userId: 'u-1', role: 'admin' }],
    })
    mockProbeHubForUpdate.mockResolvedValue({
      id: 'hub-1',
      code: 'core',
      modifiedAt: '2026-02-23T00:00:00.000Z',
    })
    mockGuardedContext.mockResolvedValue({
      db,
      user: { id: 'u-1', isAnonymous: false, superAdmin: true },
      userRoles: [],
    })

    await expect(
      remote.hubForm(
        {
          meta: { id: 'hub-1', mode: 'update' },
          data: {
            code: 'core',
            domain: '',
            i18n: { en: {}, zhHans: {}, zhHant: {} },
            userRoles: [{ userId: 'u-1', role: 'admin' }],
            organisations: [],
          },
        },
        ((message: string) => {
          throw new Error(message)
        }),
      ),
    ).rejects.toThrow('STALE_WRITE')
    policyMatrix.recordValidation({
      flow: 'Update',
      rule: 'missing meta.updatedAt',
      expected: 'Deny (invalid: STALE_WRITE)',
      actual: 'Deny (invalid: STALE_WRITE)',
      code: 'STALE_WRITE',
    })
  })

  it('rejects role mutation when manage roles authz denies', async () => {
    const { db } = buildDbForUpdate({
      existingRoles: [{ userId: 'u-1', role: 'admin' }],
    })
    mockProbeHubForUpdate.mockResolvedValue({
      id: 'hub-1',
      code: 'core',
      modifiedAt: '2026-02-23T00:00:00.000Z',
    })
    mockAuthorizeHubManageRolesForSubmission.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })
    mockGuardedContext.mockResolvedValue({
      db,
      user: { id: 'u-1', isAnonymous: false, superAdmin: true },
      userRoles: [],
    })

    await expect(
      remote.hubForm(
        {
          meta: {
            id: 'hub-1',
            mode: 'update',
            updatedAt: '2026-02-23T00:00:00.000Z',
          },
          data: {
            code: 'core',
            domain: '',
            i18n: { en: {}, zhHans: {}, zhHant: {} },
            userRoles: [
              { userId: 'u-1', role: 'admin' },
              { userId: 'u-2', role: 'admin' },
            ],
            organisations: [],
          },
        },
        ((message: string) => {
          throw new Error(message)
        }),
      ),
    ).rejects.toThrow('INSUFFICIENT_ROLE')
    policyMatrix.recordValidation({
      flow: 'Role mutation',
      rule: 'actor lacks manageHubRoles',
      expected: 'Deny (invalid with authz code)',
      actual: 'Deny (invalid with authz code)',
      code: 'INSUFFICIENT_ROLE',
    })
  })

  it('denies unauthorized publish command with authz code', async () => {
    mockGuardedContext.mockResolvedValue({
      db: {},
      user: { id: 'u-1', isAnonymous: false, superAdmin: true },
      userRoles: [],
    })
    mockAuthorizeHubPublishForSubmission.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(
      remote.publishHub({ id: 'hub-1', state: true }),
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
