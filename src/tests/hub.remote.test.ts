import { mockedRemoteModule, type MockedRemoteModule } from './remote-function-mock'
// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('#lib/db/services/automaticTranslation.js', () => ({
  prepareAutomaticTranslationSubmission: vi.fn(async () => {}),
  preparePropertyTranslationSubmission: vi.fn(async () => {}),
}))
vi.mock('#lib/api/services/automaticTranslations.js', () => ({
  scheduleAutomaticTranslations: vi.fn(),
  schedulePropertyTranslations: vi.fn(),
  scheduleFeaturePropertyTranslations: vi.fn(),
}))
import { error as httpError } from '@sveltejs/kit'
import { createPolicyMatrixReporter } from './policy-matrix-report'
import { withRemoteMeta } from './remote-function-mock'

const {
  mockEnsureHubDomain,
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
  mockGetHubSubscriptionTarget,
  mockUpsertHubUserState,
  mockListOrganisations,
  mockGuardedContext,
} = vi.hoisted(() => ({
  mockEnsureHubDomain: vi.fn(async () => undefined),
  mockHubFormDataParse: vi.fn((input: unknown) => input),
  mockToLocaleRecordFromOrganisationFormI18n: vi.fn(() => ({})),
  mockCreateHub: vi.fn(async (_db: unknown, payload: Record<string, unknown>) => ({
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
  mockListHubRoleAssignments: vi.fn(async (): Promise<unknown[]> => []),
  mockProbeExistingHub: vi.fn(async (): Promise<unknown> => null),
  mockProbeHubForUpdate: vi.fn(async (): Promise<unknown> => null),
  mockUpdateHubByIdWithConcurrency: vi.fn(
    async (
      _db: unknown,
      _input: Parameters<
        typeof import('#lib/db/services/hub.js').updateHubByIdWithConcurrency
      >[1],
    ): Promise<unknown> => null,
  ),
  mockAuthorizeHubCreateForSubmission: vi.fn(
    (): { allowed: boolean; code?: string } => ({ allowed: true }),
  ),
  mockAuthorizeHubUpdateForSubmission: vi.fn(
    (): { allowed: boolean; code?: string } => ({ allowed: true }),
  ),
  mockAuthorizeHubManageRolesForSubmission: vi.fn(
    (): { allowed: boolean; code?: string } => ({ allowed: true }),
  ),
  mockAuthorizeHubPublishForSubmission: vi.fn(
    (): { allowed: boolean; code?: string } => ({ allowed: true }),
  ),
  mockAuthorizeHubDeleteForSubmission: vi.fn(
    (): { allowed: boolean; code?: string } => ({ allowed: true }),
  ),
  mockValidateUniqueNonReservedCode: vi.fn(async () => undefined),
  mockResolveHubCommandProbe: vi.fn(async () => ({ id: 'hub-1' })),
  mockUpdateHubPublishedStateById: vi.fn(async (): Promise<unknown> => null),
  mockUpdateHubArchivedStateById: vi.fn(async (): Promise<unknown> => null),
  mockHasInvalidHubOrganisationAssignmentsForSubmission: vi.fn(async () => false),
  mockGetHubSubscriptionTarget: vi.fn(async (): Promise<unknown> => null),
  mockUpsertHubUserState: vi.fn(async () => undefined),
  mockListOrganisations: vi.fn(async (): Promise<unknown[]> => []),
  mockGuardedContext: vi.fn(),
}))

vi.mock('#lib/server/hub-domains.js', () => ({ ensureHubDomain: mockEnsureHubDomain }))

vi.mock('#lib/api/server/guarded.js', () => ({
  guardedQuery: (_schema: unknown, handler: unknown) =>
    withRemoteMeta(async (input: unknown) => {
      return (handler as (payload: unknown, ctx: unknown) => Promise<unknown>)(
        input,
        await mockGuardedContext(),
      )
    }, 'query'),
  guardedCommand: (_schema: unknown, handler: unknown) =>
    withRemoteMeta(async (input: unknown) => {
      return (handler as (payload: unknown, ctx: unknown) => Promise<unknown>)(
        input,
        await mockGuardedContext(),
      )
    }, 'command'),
  guardedForm: (_schema: unknown, handler: unknown) =>
    withRemoteMeta(async (input: unknown, invalid: unknown) => {
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
            invalid: unknown
            issue: unknown
          },
        ) => Promise<unknown>
      )(input, {
        event: { locals: { platform: { env: { ENVIRONMENT: 'local' } } } },
        ...(await mockGuardedContext()),
        invalid,
        issue,
      })
    }, 'form'),
}))

vi.mock('#lib/db/zod/index.js', () => ({
  ListQueryParamsSchema: {},
  GetQueryParamsSchema: {},
  PublishHubSchema: {},
  RemoveHubSchema: {},
  DismissHubSubscriptionPromptSchema: {},
  JoinHubSubscriptionSchema: {},
  HubFormData: {
    parse: mockHubFormDataParse,
  },
}))

vi.mock('#lib/i18n.js', () => ({
  m: new Proxy(
    {},
    {
      get: () => () => '',
    },
  ),
  toLocaleRecordFromOrganisationFormI18n: mockToLocaleRecordFromOrganisationFormI18n,
}))

vi.mock('#lib/api/services/project.js', () => ({
  normalizeSubmittedPropertyRanks: <T>(properties: T[]) => properties,
}))

vi.mock('#lib/api/index.js', () => ({
  getValidQueryParams: (_table: unknown, params: unknown) => params,
}))

vi.mock('#lib/api/services/authz/index.js', () => ({
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
  isRelevantHubAdmin: (
    roles: Array<{ type: string; role: string; hubId?: string }>,
    hubId?: string | null,
  ) =>
    roles.some(
      role =>
        role.type === 'hub' &&
        role.role === 'admin' &&
        (role.hubId === hubId || role.hubId === 'core'),
    ),
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

vi.mock('#lib/api/services/hub.js', () => ({
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

vi.mock('#lib/db/services/hub.js', () => ({
  createHub: mockCreateHub,
  createI18n: mockCreateI18n,
  createUserRoles: mockCreateHubUserRoles,
  createHubUserRoles: mockCreateHubUserRoles,
  probeExistingHub: mockProbeExistingHub,
  probeHubForUpdate: mockProbeHubForUpdate,
  resolveHubCommandProbe: mockResolveHubCommandProbe,
  updateHubByIdWithConcurrency: mockUpdateHubByIdWithConcurrency,
  probeHubForCommand: vi.fn(async (): Promise<unknown> => null),
  updateHubPublishedStateById: mockUpdateHubPublishedStateById,
  updateHubArchivedStateById: mockUpdateHubArchivedStateById,
  updateI18n: mockUpdateI18n,
  syncUserRoles: mockSyncHubUserRoles,
  syncHubUserRoles: mockSyncHubUserRoles,
  syncOrganisations: mockSyncHubOrganisations,
  getHubSubscriptionTarget: mockGetHubSubscriptionTarget,
  upsertHubUserState: mockUpsertHubUserState,
  listOrganisations: mockListOrganisations,
  listUserRoles: mockListHubRoleAssignments,
  listHubRoleAssignments: mockListHubRoleAssignments,
  listHubOrganisationLookups: vi.fn(async (): Promise<unknown[]> => []),
  listHubs: vi.fn(),
  getHub: vi.fn(),
  syncHubOrganisations: mockSyncHubOrganisations,
  syncHubLayerDefaults: mockSyncHubLayerDefaults,
}))

const mockSubscribeToSubstack = vi.fn(
  async (): Promise<{
    ok?: boolean
    error?: string
    details?: string
    status?: number
  }> => ({ ok: true }),
)

vi.mock('#lib/api/external/substack.js', () => ({
  subscribeToSubstack: mockSubscribeToSubstack,
}))

vi.mock('#lib/api/services/index.js', () => ({
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

vi.mock('#lib/db/services/property.js', () => ({
  syncHubProperties: vi.fn(async () => undefined),
  syncHubGlobalProperties: vi.fn(async () => undefined),
}))

vi.mock('#lib/db/schema/index.js', () => ({
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

let remote: MockedRemoteModule<typeof import('#lib/api/hub.remote.js')>
const policyMatrix = createPolicyMatrixReporter('hub.remote')

const buildDbForCreate = () => ({
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async (): Promise<unknown[]> => []),
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
        return { where: vi.fn(async (): Promise<unknown[]> => []) }
      }),
    })),
  }
  return { db }
}

describe('hub.remote form image handling', () => {
  // Hoisted factories are stable; reset request mocks without reloading dependencies.
  beforeAll(async () => {
    remote = mockedRemoteModule(await import('#lib/api/hub.remote.js'))
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureHubDomain.mockResolvedValue(undefined)
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
    mockGetHubSubscriptionTarget.mockResolvedValue(null)
    mockUpsertHubUserState.mockResolvedValue(undefined)
    mockListOrganisations.mockResolvedValue([])
    mockSubscribeToSubstack.mockResolvedValue({ ok: true })
    mockProbeExistingHub.mockResolvedValue(null)
    mockListHubRoleAssignments.mockResolvedValue([])
  })

  afterAll(() => {
    policyMatrix.flush()
  })

  it('explains populated-field contract changes as a form validation issue', async () => {
    const message =
      'A field with saved feature values cannot change component or value format. Restore its existing component to save translations, or create a new field.'
    mockGuardedContext.mockResolvedValue({
      db: buildDbForUpdate({ existingRoles: [{ userId: 'u-1', role: 'admin' }] }),
      user: { id: 'u-1', isAnonymous: false, superAdmin: true },
      userRoles: [],
    })
    mockListHubRoleAssignments.mockResolvedValue([{ userId: 'u-1', role: 'admin' }])
    mockProbeHubForUpdate.mockResolvedValue({
      id: 'hub-1',
      code: 'core',
      modifiedAt: 'before',
    })
    mockUpdateHubByIdWithConcurrency.mockImplementationOnce(async () => {
      httpError(400, 'PROPERTY_CONTRACT_HAS_VALUES')
    })
    const invalid = vi.fn((issue: string) => {
      throw new Error(issue)
    })
    await expect(
      remote.hubForm(
        {
          meta: { id: 'hub-1', mode: 'update', updatedAt: 'before' },
          data: {
            code: 'core',
            domain: '',
            i18n: { en: {} },
            userRoles: [{ userId: 'u-1', role: 'admin' }],
            organisations: [],
            properties: [],
          },
        },
        invalid,
      ),
    ).rejects.toThrow(message)
    expect(invalid).toHaveBeenCalledWith(message)
  })

  it.each(['create', 'update'] as const)(
    'reads domain bindings from request locals in %s mode',
    async mode => {
      const env = { ENVIRONMENT: 'local' }
      mockGuardedContext.mockResolvedValue({
        db: buildDbForCreate(),
        user: { id: 'u-1', superAdmin: true },
        userRoles: [],
        event: { locals: { platform: { env } } },
      })
      mockProbeHubForUpdate.mockResolvedValue({
        id: 'hub-1',
        code: 'mappinghk',
        modifiedAt: '2026-02-23T00:00:00.000Z',
      })
      mockUpdateHubByIdWithConcurrency.mockResolvedValue({ id: 'hub-1' })

      await remote.hubForm(
        {
          meta:
            mode === 'create'
              ? { mode }
              : { mode, id: 'hub-1', updatedAt: '2026-02-23T00:00:00.000Z' },
          data: {
            code: 'mappinghk',
            domain: '',
            i18n: {},
            userRoles: [{ userId: 'u-1', role: 'admin' }],
          },
        },
        (message: string) => {
          throw new Error(String(message))
        },
      )

      if (mode === 'create') {
        expect(mockEnsureHubDomain).toHaveBeenCalledWith(env, 'mappinghk')
      } else {
        expect(mockEnsureHubDomain).toHaveBeenCalledWith(env, 'mappinghk', 'mappinghk')
      }
      expect(
        mode === 'create' ? mockCreateHub : mockUpdateHubByIdWithConcurrency,
      ).toHaveBeenCalledTimes(1)
    },
  )

  it('does not persist a hub when domain registration fails', async () => {
    mockGuardedContext.mockResolvedValue({
      db: buildDbForCreate(),
      user: { id: 'u-1', superAdmin: true },
      userRoles: [],
    })
    mockEnsureHubDomain.mockRejectedValueOnce(new Error('Cloudflare unavailable'))
    await expect(
      remote.hubForm(
        {
          meta: { mode: 'create' },
          data: {
            code: 'new-hub',
            domain: '',
            i18n: {},
            userRoles: [{ userId: 'u-1', role: 'admin' }],
          },
        },
        (message: string) => {
          throw new Error(String(message))
        },
      ),
    ).rejects.toThrow('Unable to register')
    expect(mockCreateHub).not.toHaveBeenCalled()
  })

  it('does not register a domain for unauthorized hub creation', async () => {
    mockGuardedContext.mockResolvedValue({
      db: buildDbForCreate(),
      user: { id: 'u-1' },
      userRoles: [],
    })
    mockAuthorizeHubCreateForSubmission.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })
    await expect(
      remote.hubForm(
        {
          meta: { mode: 'create' },
          data: {
            code: 'new-hub',
            domain: '',
            i18n: {},
            userRoles: [{ userId: 'u-1', role: 'admin' }],
          },
        },
        (message: string) => {
          throw new Error(String(message))
        },
      ),
    ).rejects.toThrow()
    expect(mockEnsureHubDomain).not.toHaveBeenCalled()
    expect(mockCreateHub).not.toHaveBeenCalled()
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
          legalContactAddress: 'legal@new-hub.hk',
          subscriptionSessionCookie:
            'substack.sid=substack-session; Path=/; HttpOnly; Secure',
          imageId: 'img-123',
          i18n: {
            en: { subscriptionBenefits: 'Subscriber-only updates' },
            zhHans: {},
            zhHant: {},
          },
          userRoles: [{ userId: 'u-1', role: 'admin' }],
          organisations: [],
        },
      },
      () => undefined,
    )

    expect(mockCreateHub).toHaveBeenCalledTimes(1)
    const createPayload = mockCreateHub.mock.calls[0]?.[1] as Record<string, unknown>
    expect(createPayload).not.toHaveProperty('imageId')
    expect(createPayload.legalContactAddress).toBe('legal@new-hub.hk')
    expect(createPayload.subscriptionSessionCookie).toBe(
      'substack.sid=substack-session',
    )
    expect(createPayload).not.toHaveProperty('subscriptionBenefits')
    expect(mockCreateHub).toHaveBeenCalledWith(
      db,
      expect.any(Object),
      expect.objectContaining({
        i18n: expect.objectContaining({
          en: expect.objectContaining({
            subscriptionBenefits: 'Subscriber-only updates',
          }),
        }),
        userRoles: [{ userId: 'u-1', role: 'admin' }],
        organisations: [],
        layerDefaults: [],
        properties: [],
      }),
      { actorId: 'u-1', reason: 'Hub created with organisation assignments' },
    )
    expect(mockCreateI18n).not.toHaveBeenCalled()
    expect(mockCreateHubUserRoles).not.toHaveBeenCalled()
    expect(
      (await import('#lib/db/services/property.js')).syncHubProperties,
    ).not.toHaveBeenCalled()
    expect(mockSyncHubOrganisations).not.toHaveBeenCalled()
    expect(mockSyncHubLayerDefaults).not.toHaveBeenCalled()
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
          legalContactAddress: 'legal@example.org',
          imageId: 'img-999',
          i18n: { en: {}, zhHans: {}, zhHant: {} },
          userRoles: [{ userId: 'u-1', role: 'admin' }],
          organisations: [],
        },
      },
      () => undefined,
    )

    expect(mockUpdateHubByIdWithConcurrency).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        data: expect.objectContaining({
          code: 'core',
          domain: 'example.org',
          legalContactAddress: 'legal@example.org',
        }),
      }),
    )
    expect(
      mockUpdateHubByIdWithConcurrency.mock.calls[0]?.[1]?.data,
    ).not.toHaveProperty('imageId')
  })

  it('update mode normalizes substack session tokens before persistence', async () => {
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
          legalContactAddress: 'legal@example.org',
          subscriptionSessionCookie:
            'substack.sid=normalized-session-token; Path=/; HttpOnly',
          i18n: {
            en: { subscriptionBenefits: 'Subscriber-only invites' },
            zhHans: {},
            zhHant: {},
          },
          userRoles: [{ userId: 'u-1', role: 'admin' }],
          organisations: [],
        },
      },
      () => undefined,
    )

    expect(mockUpdateHubByIdWithConcurrency).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionSessionCookie: 'substack.sid=normalized-session-token',
        }),
      }),
    )
    expect(
      mockUpdateHubByIdWithConcurrency.mock.calls[0]?.[1]?.data,
    ).not.toHaveProperty('subscriptionBenefits')
    expect(mockUpdateHubByIdWithConcurrency).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        i18n: expect.objectContaining({
          en: expect.objectContaining({
            subscriptionBenefits: 'Subscriber-only invites',
          }),
        }),
        userRoles: expect.any(Array),
        organisations: expect.any(Array),
      }),
    )
    expect(mockUpdateI18n).not.toHaveBeenCalled()
    expect(mockSyncHubUserRoles).not.toHaveBeenCalled()
    expect(mockSyncHubOrganisations).not.toHaveBeenCalled()
    expect(mockSyncHubLayerDefaults).not.toHaveBeenCalled()
  })

  it('update mode tolerates submissions that omit legalContactAddress', async () => {
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
          domain: 'hype.hk',
          i18n: { en: {}, zhHans: {}, zhHant: {} },
          userRoles: [{ userId: 'u-1', role: 'admin' }],
          organisations: [],
        },
      },
      () => undefined,
    )

    expect(mockUpdateHubByIdWithConcurrency).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        data: expect.objectContaining({
          legalContactAddress: null,
        }),
      }),
    )
  })

  it('reports duplicate property API names before persistence', async () => {
    mockGuardedContext.mockResolvedValue({
      db: buildDbForCreate(),
      user: { id: 'u-1', isAnonymous: false, superAdmin: true },
      userRoles: [],
    })
    const invalid = vi.fn(
      (...issues: Array<{ message: string; path: Array<string | number> }>) => {
        throw new Error(issues[0].message)
      },
    )
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
            properties: ['first', 'unrelated', 'second'].map((id, index) => ({
              id,
              rank: 2 - index,
              key: id === 'unrelated' ? 'other' : 'hits',
              type: 'classifier',
              component: 'SelectField',
              isTranslatable: true,
              i18n: { en: { label: 'Hits' } },
              values: [],
            })),
          },
        },
        invalid,
      ),
    ).rejects.toThrow('Name in API must be unique within this hub. Duplicate: hits')
    expect(invalid).toHaveBeenCalledExactlyOnceWith(
      {
        message: 'Name in API must be unique within this hub. Duplicate: hits',
        path: ['data', 'properties', 0, 'key'],
      },
      {
        message: 'Name in API must be unique within this hub. Duplicate: hits',
        path: ['data', 'properties', 2, 'key'],
      },
    )
    expect(mockCreateHub).not.toHaveBeenCalled()
    expect(mockUpdateHubByIdWithConcurrency).not.toHaveBeenCalled()
  })

  it('preserves hub admins when an update omits the members tab', async () => {
    const { db } = buildDbForUpdate({
      existingRoles: [{ userId: 'u-1', role: 'admin' }],
    })
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
          submittedTabs: ['location'],
        },
        data: {},
      },
      (message: string) => {
        throw new Error(String(message))
      },
    )
    expect(mockUpdateHubByIdWithConcurrency).toHaveBeenCalled()
    expect(mockUpdateHubByIdWithConcurrency.mock.calls[0][1]).not.toHaveProperty(
      'userRoles',
    )
    expect(mockSyncHubUserRoles).not.toHaveBeenCalled()
    const saved = mockUpdateHubByIdWithConcurrency.mock.calls[0][1]
    for (const field of ['properties', 'organisations', 'layerDefaults']) {
      expect(saved).not.toHaveProperty(field)
    }
    expect(saved.data).toEqual({})
    expect(saved.i18n).toBeUndefined()
    expect(mockValidateUniqueNonReservedCode).not.toHaveBeenCalled()
    expect(saved.featureIntentSettings).toBeUndefined()
    expect(saved.imageIntentSettings).toBeUndefined()
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
        (message: string) => {
          throw new Error(message)
        },
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
        (message: string) => {
          throw new Error(message)
        },
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
        (message: string) => {
          throw new Error(message)
        },
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
        (message: string) => {
          throw new Error(message)
        },
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
        (message: string) => {
          throw new Error(message)
        },
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

    await expect(remote.publishHub({ id: 'hub-1', state: true })).rejects.toThrow(
      'INSUFFICIENT_ROLE',
    )
    policyMatrix.recordValidation({
      flow: 'Unauthorized command',
      rule: 'actor lacks action permission',
      expected: 'Deny (403 + authz code)',
      actual: 'Deny (403 + authz code)',
      code: 'INSUFFICIENT_ROLE',
    })
  })

  it('allows a guest to dismiss a hub subscription prompt', async () => {
    mockGuardedContext.mockResolvedValue({
      db: {},
      user: { id: 'guest-1', isAnonymous: true },
      userRoles: [],
    })
    mockGetHubSubscriptionTarget.mockResolvedValue({ id: 'hub-1' })

    const result = await remote.dismissSubscriptionPrompt({ hubId: 'hub-1' })

    expect(mockUpsertHubUserState).toHaveBeenCalledWith(
      {},
      {
        hubId: 'hub-1',
        userId: 'guest-1',
        subscriptionPromptDismissed: true,
      },
    )
    expect(result).toEqual({
      data: {
        hubId: 'hub-1',
        dismissed: true,
      },
    })
  })

  it('requires explicit admin intent for organisation assignment lookups', async () => {
    mockGuardedContext.mockResolvedValue({
      db: {},
      user: { id: 'u-1', isAnonymous: false, superAdmin: true },
      userRoles: [],
      isAdminRequest: false,
    })

    await expect(
      remote.getOrganisationLookupsForHub({
        conditions: { organisation: ['org-1'] },
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect(mockListOrganisations).not.toHaveBeenCalled()
  })

  it('restricts organisation assignment lookups to the requested hub scope', async () => {
    mockGuardedContext.mockResolvedValue({
      db: {},
      user: { id: 'u-1', isAnonymous: false, superAdmin: false },
      userRoles: [{ type: 'hub', role: 'admin', hubId: 'hub-1' }],
      isAdminRequest: true,
    })
    mockListOrganisations.mockResolvedValue([
      {
        id: 'org-1',
        hubId: 'hub-2',
        isCoreInclusive: false,
        isHubExclusive: false,
      },
    ])

    await expect(
      remote.getOrganisationLookupsForHub({
        conditions: { organisation: ['org-1'] },
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('passes the stored session cookie to the Substack subscriber adapter', async () => {
    mockGuardedContext.mockResolvedValue({
      db: {},
      user: { id: 'u-1', email: 'person@example.com', isAnonymous: false },
      userRoles: [],
    })
    mockGetHubSubscriptionTarget.mockResolvedValue({
      id: 'hub-1',
      isSubscriptionAvailable: true,
      subscriptionService: 'substack',
      subscriptionId: 'example',
      subscriptionSessionCookie: 'substack.sid=normalized-session-token',
    })

    const result = await remote.joinSubscription({
      hubId: 'hub-1',
      hasAgreedToTerms: true,
    })

    expect(mockSubscribeToSubstack).toHaveBeenCalledWith(
      'person@example.com',
      'example',
      'substack.sid=normalized-session-token',
    )
    expect(mockUpsertHubUserState).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        hubId: 'hub-1',
        userId: 'u-1',
        subscriptionMember: true,
      }),
    )
    expect(result).toEqual({
      data: expect.objectContaining({
        hubId: 'hub-1',
        provider: 'substack',
        subscriptionMember: true,
      }),
    })
  })

  it('returns a Substack redirect URL when the provider API rejects the join request', async () => {
    mockGuardedContext.mockResolvedValue({
      db: {},
      user: { id: 'u-1', email: 'person@example.com', isAnonymous: false },
      userRoles: [],
    })
    mockGetHubSubscriptionTarget.mockResolvedValue({
      id: 'hub-1',
      isSubscriptionAvailable: true,
      subscriptionService: 'substack',
      subscriptionId: 'example',
      subscriptionSessionCookie: 'substack.sid=normalized-session-token',
    })
    mockSubscribeToSubstack.mockResolvedValueOnce({
      error: 'Error 403',
      details: 'forbidden',
      status: 403,
    })

    const result = await remote.joinSubscription({
      hubId: 'hub-1',
      hasAgreedToTerms: true,
    })

    expect(mockUpsertHubUserState).not.toHaveBeenCalled()
    expect(result).toEqual({
      data: {
        hubId: 'hub-1',
        subscriptionMember: false,
        subscriptionPromptDismissed: false,
        hasAgreedToTerms: true,
        provider: 'substack',
        providerResponse: {
          error: 'Error 403',
          details: 'forbidden',
          status: 403,
        },
        redirectUrl: 'https://example.substack.com/',
      },
    })
  })

  it('rejects subscription joins when the Substack session cookie is missing', async () => {
    mockGuardedContext.mockResolvedValue({
      db: {},
      user: { id: 'u-1', email: 'person@example.com', isAnonymous: false },
      userRoles: [],
    })
    mockGetHubSubscriptionTarget.mockResolvedValue({
      id: 'hub-1',
      isSubscriptionAvailable: true,
      subscriptionService: 'substack',
      subscriptionId: 'example',
      subscriptionSessionCookie: null,
    })

    await expect(
      remote.joinSubscription({
        hubId: 'hub-1',
        hasAgreedToTerms: true,
      }),
    ).rejects.toMatchObject({
      status: 400,
      body: { message: 'SUBSCRIPTION_PROVIDER_MISCONFIGURED' },
    })
    expect(mockSubscribeToSubstack).not.toHaveBeenCalled()
  })
})
