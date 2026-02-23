import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockHubFormDataParse,
  mockToLocaleRecordFromOrganisationFormI18n,
  mockCreateHub,
  mockCreateI18n,
  mockCreateHubUserRoles,
  mockSyncHubOrganisations,
  mockUpdateI18n,
  mockUpdateHubUserRoles,
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
  mockUpdateI18n: vi.fn(async () => undefined),
  mockUpdateHubUserRoles: vi.fn(async () => undefined),
  mockGuardedContext: vi.fn(),
}))

vi.mock('$lib/api/server/remote', () => ({
  guardedQuery: (_schema: unknown, handler: unknown) => handler,
  guardedCommand: (_schema: unknown, handler: unknown) => handler,
  guardedForm:
    (_schema: unknown, handler: unknown) =>
    async (input: unknown, invalid: unknown) => {
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
  toLocaleRecordFromOrganisationFormI18n: mockToLocaleRecordFromOrganisationFormI18n,
}))

vi.mock('$lib/api', () => ({
  getValidQueryParams: (_table: unknown, params: unknown) => params,
}))

vi.mock('$lib/api/services/authz', () => ({
  isReservedCode: (_value: string) => false,
  toAuthMessage: (code: string) => code,
  toIssueDetailMessage: (code: string) => code,
  toHubSubmittedFields: (_data: unknown) => [],
  toHubUserRoleSignature: (roles: Array<{ userId: string; role: string }>) =>
    roles
      .map(role => `${role.userId}:${role.role}`)
      .sort()
      .join('|'),
  authorizeHubRead: () => ({ allowed: true }),
  authorizeHubList: () => ({ allowed: true }),
  authorizeHubCreate: () => ({ allowed: true }),
  authorizeHubUpdate: () => ({ allowed: true }),
  authorizeHubManageRoles: () => ({ allowed: true }),
  authorizeHubPublish: () => ({ allowed: true }),
  authorizeHubDelete: () => ({ allowed: true }),
}))

vi.mock('$lib/api/services/hub', () => ({
  hubCollectionWithRelations: {},
  hubEntityWithRelations: {},
  toHubEntityResponse: vi.fn((row: unknown) => ({ data: row })),
  toHubListResponse: vi.fn((value: unknown) => value),
  toHubProfile: vi.fn((value: unknown, fallback: string) =>
    typeof value === 'string' ? value : fallback,
  ),
  toLookupConditions: vi.fn(() => ({})),
  toRequestedListState: vi.fn(() => ({
    isPublished: undefined,
    isArchived: undefined,
  })),
}))

vi.mock('$lib/db/services/hub', () => ({
  createHub: mockCreateHub,
  createI18n: mockCreateI18n,
  createHubUserRoles: mockCreateHubUserRoles,
  updateHub: vi.fn(),
  updateI18n: mockUpdateI18n,
  updateHubUserRoles: mockUpdateHubUserRoles,
  listHubs: vi.fn(),
  getHub: vi.fn(),
  syncHubOrganisations: mockSyncHubOrganisations,
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
  current: { id: string; code: string; modifiedAt: string }
  existingRoles: Array<{ userId: string; role: string }>
  updated: { id: string; modifiedAt: string }
}) => {
  let hubSelectCall = 0
  let setPayload: Record<string, unknown> | null = null

  const db = {
    select: vi.fn((_shape: unknown) => ({
      from: vi.fn((table: unknown) => {
        const tableRecord = table as Record<string, unknown>
        if (tableRecord?.hubId === 'hubRole.hubId') {
          return {
            where: vi.fn(async () => params.existingRoles),
          }
        }

        return {
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              hubSelectCall += 1
              if (hubSelectCall === 1) return [params.current]
              return []
            }),
          })),
        }
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((payload: Record<string, unknown>) => {
        setPayload = payload
        return {
          where: vi.fn(() => ({
            returning: vi.fn(async () => [params.updated]),
          })),
        }
      }),
    })),
  }

  return { db, getSetPayload: () => setPayload }
}

describe('hub.remote form image handling', () => {
  beforeEach(async () => {
    vi.resetModules()
    remote = await import('$lib/api/server/hub.remote')
    vi.clearAllMocks()
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
      } as any,
      (() => undefined) as any,
    )

    expect(mockCreateHub).toHaveBeenCalledTimes(1)
    const createPayload = mockCreateHub.mock.calls[0]?.[1] as Record<string, unknown>
    expect(createPayload).not.toHaveProperty('imageId')
  })

  it('update mode ignores imageId from incoming form payload', async () => {
    const { db, getSetPayload } = buildDbForUpdate({
      current: { id: 'hub-1', code: 'core', modifiedAt: '2026-02-23T00:00:00.000Z' },
      existingRoles: [{ userId: 'u-1', role: 'admin' }],
      updated: { id: 'hub-1', modifiedAt: '2026-02-23T01:00:00.000Z' },
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
      } as any,
      (() => undefined) as any,
    )

    expect(getSetPayload()).toEqual({
      code: 'core',
      domain: 'example.org',
    })
    expect(getSetPayload()).not.toHaveProperty('imageId')
  })
})
