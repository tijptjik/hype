// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withRemoteMeta } from './remote-function-mock'

const {
  mockGetPrisms,
  mockGetPropertyQueryContext,
  mockToPropertyPrismConditions,
  mockListProperties,
  mockLoadProperty,
  mockListResolvedProjectProperties,
  mockCreateBaseProperty,
  mockCreateI18n,
  mockCreatePropertyValues,
  mockCreatePropertyValueI18n,
  mockProbeProjectQuery,
  mockAuthorizeProjectReadForProbe,
  mockAuthorizeProjectUpdateForSubmission,
  mockAuthorizeOrganisationUpdateForSubmission,
  mockAuthorizeHubUpdateForSubmission,
  mockGuardedContext,
  mockProjectProbeRows,
  mockPropertyScopeRows,
  mockRetryBusyRead,
} = vi.hoisted(() => ({
  mockGetPrisms: vi.fn(() => ({ organisation: [], project: [], layer: [] })),
  mockGetPropertyQueryContext: vi.fn(() => ({ conditions: [] })),
  mockToPropertyPrismConditions: vi.fn(async ({ conditions }) => conditions),
  mockListProperties: vi.fn(async () => []),
  mockLoadProperty: vi.fn(async () => null),
  mockListResolvedProjectProperties: vi.fn(async () => []),
  mockCreateBaseProperty: vi.fn(async () => ({ id: 'property-created' })),
  mockCreateI18n: vi.fn(async () => undefined),
  mockCreatePropertyValues: vi.fn(async () => []),
  mockCreatePropertyValueI18n: vi.fn(async () => undefined),
  mockProbeProjectQuery: vi.fn(async () => null),
  mockAuthorizeProjectReadForProbe: vi.fn(() => ({ allowed: true })),
  mockAuthorizeProjectUpdateForSubmission: vi.fn(() => ({ allowed: true })),
  mockAuthorizeOrganisationUpdateForSubmission: vi.fn(() => ({ allowed: true })),
  mockAuthorizeHubUpdateForSubmission: vi.fn(() => ({ allowed: true })),
  mockGuardedContext: vi.fn(),
  mockProjectProbeRows: vi.fn(async () => []),
  mockPropertyScopeRows: vi.fn(async () => []),
  mockRetryBusyRead: vi.fn(async (operation: () => Promise<unknown>) => operation()),
}))

vi.mock('$lib/api/server/remote', () => ({
  guardedCommand: (_schema: unknown, handler: unknown) =>
    withRemoteMeta(async (input: unknown) => {
      return (handler as (payload: unknown, ctx: unknown) => Promise<unknown>)(
        input,
        await mockGuardedContext(),
      )
    }, 'command'),
  guardedQuery: (_schema: unknown, handler: unknown) =>
    withRemoteMeta(async (input: unknown) => {
      return (handler as (payload: unknown, ctx: unknown) => Promise<unknown>)(
        input,
        await mockGuardedContext(),
      )
    }, 'query'),
}))

vi.mock('@sveltejs/kit', () => ({
  error: (status: number, message: string) => {
    const err = new Error(message) as Error & { status: number }
    err.status = status
    throw err
  },
}))

vi.mock('$lib/api', () => ({
  getPrisms: mockGetPrisms,
  getValidQueryParams: (_table: unknown, params: unknown) => params,
}))

const mockToPropertyResponseShape = vi.fn((row: unknown) => ({ row }))

vi.mock('$lib/api/services/property', () => ({
  getPropertyQueryContext: mockGetPropertyQueryContext,
  propertyCollectionWithRelations: {},
  toPropertyPrismConditions: mockToPropertyPrismConditions,
  toPropertyResponseShape: mockToPropertyResponseShape,
}))

vi.mock('$lib/api/services/authz', () => ({
  authorizeProjectReadForProbe: mockAuthorizeProjectReadForProbe,
  authorizeProjectUpdateForSubmission: mockAuthorizeProjectUpdateForSubmission,
  authorizeOrganisationUpdateForSubmission:
    mockAuthorizeOrganisationUpdateForSubmission,
  authorizeHubUpdateForSubmission: mockAuthorizeHubUpdateForSubmission,
  toAuthMessage: (code: string) => code,
}))

vi.mock('$lib/db/services/property', () => ({
  createBaseProperty: mockCreateBaseProperty,
  createI18n: mockCreateI18n,
  createPropertyValues: mockCreatePropertyValues,
  createPropertyValueI18n: mockCreatePropertyValueI18n,
  listProperties: mockListProperties,
  listResolvedProjectProperties: mockListResolvedProjectProperties,
  getProperty: mockLoadProperty,
}))

vi.mock('$lib/db/services/project', () => ({
  probeProjectQuery: mockProbeProjectQuery,
}))

vi.mock('$lib/db/services/sqlite', () => ({
  retryBusyRead: mockRetryBusyRead,
}))

vi.mock('$lib/db/schema', async importOriginal => await importOriginal())

vi.mock('$lib/db/zod', () => ({
  ListQueryParamsSchema: {},
  ProjectPropertiesQuery: {},
  ProjectPropertyFormData: {},
  ProjectPropertyValueFormData: {},
}))

let remote: Awaited<typeof import('$lib/api/server/property.remote')>

describe('property.remote', () => {
  beforeEach(async () => {
    vi.resetModules()
    remote = await import('$lib/api/server/property.remote')
    vi.clearAllMocks()
    mockToPropertyResponseShape.mockImplementation((row: unknown) => ({ row }))
    mockGuardedContext.mockResolvedValue({
      db: {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({ limit: mockPropertyScopeRows })),
            innerJoin: vi.fn(() => ({
              where: mockProjectProbeRows,
            })),
          })),
        })),
      },
      user: { id: 'u-1', isAnonymous: false },
      userRoles: [],
      isAdminRequest: true,
      event: {
        request: new Request('https://example.test'),
        url: new URL('https://example.test/admin/properties'),
      },
    })
    mockAuthorizeProjectReadForProbe.mockReturnValue({ allowed: true })
    mockAuthorizeProjectUpdateForSubmission.mockReturnValue({ allowed: true })
    mockAuthorizeOrganisationUpdateForSubmission.mockReturnValue({ allowed: true })
    mockAuthorizeHubUpdateForSubmission.mockReturnValue({ allowed: true })
  })

  it('filters getProperties rows to projects the actor can read', async () => {
    mockListProperties.mockResolvedValue([
      { id: 'prop-1', projectId: 'project-1' },
      { id: 'prop-2', projectId: 'project-2' },
      { id: 'prop-3', projectId: null },
    ])
    mockProjectProbeRows.mockResolvedValue([
      {
        id: 'project-1',
        organisationId: 'org-1',
        hubId: 'hub-a',
        isPublished: true,
        isArchived: false,
      },
      {
        id: 'project-2',
        organisationId: 'org-1',
        hubId: 'hub-a',
        isPublished: true,
        isArchived: false,
      },
    ])
    mockAuthorizeProjectReadForProbe.mockImplementation(({ probe }: any) =>
      probe.id === 'project-1' ? { allowed: true } : { allowed: false },
    )

    const result = await remote.getProperties({ conditions: {} })

    expect(result).toEqual({
      data: [{ row: { id: 'prop-1', projectId: 'project-1' } }],
    })
  })

  it('chunks project probes for large property collections', async () => {
    mockProjectProbeRows.mockResolvedValue([])
    mockListProperties.mockResolvedValue(
      Array.from({ length: 205 }, (_, index) => ({
        id: `property-${index}`,
        projectId: `project-${index}`,
      })),
    )

    const result = await remote.getProperties({ conditions: {} })

    expect(result).toEqual({ data: [] })
    expect(mockProjectProbeRows).toHaveBeenCalledTimes(3)
  })

  it('skips malformed property rows instead of failing the whole list', async () => {
    mockListProperties.mockResolvedValue([
      { id: 'prop-1', projectId: 'project-1' },
      { id: 'prop-2', projectId: 'project-1' },
    ])
    mockProjectProbeRows.mockResolvedValue([
      {
        id: 'project-1',
        organisationId: 'org-1',
        hubId: 'hub-a',
        isPublished: true,
        isArchived: false,
      },
    ])
    mockToPropertyResponseShape.mockImplementation((row: any) => {
      if (row.id === 'prop-2') {
        throw new Error('bad property payload')
      }
      return { row }
    })

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await remote.getProperties({ conditions: {} })

    expect(result).toEqual({
      data: [{ row: { id: 'prop-1', projectId: 'project-1' } }],
    })
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Property list row failed response shaping',
      expect.objectContaining({
        propertyId: 'prop-2',
        projectId: 'project-1',
      }),
    )

    consoleErrorSpy.mockRestore()
  })

  it('returns null for getProperty when property is missing', async () => {
    mockLoadProperty.mockResolvedValue(null)

    await expect(remote.getProperty({ id: 'prop-1' })).resolves.toEqual({
      data: null,
    })
  })

  it('denies getProperty when linked project read authz denies', async () => {
    mockLoadProperty.mockResolvedValue({ id: 'prop-1', projectId: 'project-1' })
    mockProbeProjectQuery.mockResolvedValue({
      id: 'project-1',
      organisationId: 'org-1',
      hubId: 'hub-a',
      isPublished: true,
      isArchived: false,
    })
    mockAuthorizeProjectReadForProbe.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(remote.getProperty({ id: 'prop-1' })).rejects.toMatchObject({
      status: 403,
    })
  })

  it('checks append access from the property scope probe without loading relations', async () => {
    mockPropertyScopeRows.mockResolvedValue([
      {
        id: 'prop-1',
        scope: 'project',
        projectId: 'project-1',
        organisationId: null,
        hubId: null,
      },
    ])
    mockProbeProjectQuery.mockResolvedValue({
      id: 'project-1',
      organisationId: 'org-1',
      hubId: 'hub-a',
      isPublished: true,
      isArchived: false,
    })
    mockAuthorizeProjectUpdateForSubmission.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(
      remote.getPropertyValueAppendAccess({ id: 'prop-1' }),
    ).resolves.toEqual({
      data: { allowed: false, scope: 'project' },
    })

    expect(mockLoadProperty).not.toHaveBeenCalled()
  })

  it('denies append before hydrating property values', async () => {
    mockPropertyScopeRows.mockResolvedValue([
      {
        id: 'prop-1',
        scope: 'project',
        projectId: 'project-1',
        organisationId: null,
        hubId: null,
      },
    ])
    mockProbeProjectQuery.mockResolvedValue({
      id: 'project-1',
      organisationId: 'org-1',
      hubId: 'hub-a',
      isPublished: true,
      isArchived: false,
    })
    mockAuthorizeProjectUpdateForSubmission.mockReturnValue({
      allowed: false,
      code: 'INSUFFICIENT_ROLE',
    })

    await expect(
      remote.appendPropertyValues({
        data: {
          propertyId: 'prop-1',
          values: [{ value: 'new-value' }],
        },
      }),
    ).rejects.toMatchObject({ status: 403 })

    expect(mockLoadProperty).not.toHaveBeenCalled()
    expect(mockCreatePropertyValues).not.toHaveBeenCalled()
  })

  it('hydrates and appends values after scope authorization succeeds', async () => {
    mockPropertyScopeRows.mockResolvedValue([
      {
        id: 'prop-1',
        scope: 'project',
        projectId: 'project-1',
        organisationId: null,
        hubId: null,
      },
    ])
    mockProbeProjectQuery.mockResolvedValue({
      id: 'project-1',
      organisationId: 'org-1',
      hubId: 'hub-a',
      isPublished: true,
      isArchived: false,
    })
    mockLoadProperty.mockResolvedValue({ id: 'prop-1', scope: 'project' })
    mockCreatePropertyValues.mockResolvedValue([{ id: 'value-1' }])

    const result = await remote.appendPropertyValues({
      data: {
        propertyId: 'prop-1',
        values: [{ value: 'new-value' }],
      },
    })

    expect(result).toEqual({ data: { row: { id: 'prop-1', scope: 'project' } } })
    expect(mockLoadProperty).toHaveBeenCalledTimes(2)
    expect(mockCreatePropertyValues).toHaveBeenCalledWith(
      expect.anything(),
      [{ value: 'new-value', propertyId: 'prop-1' }],
      'prop-1',
    )
  })

  it('returns [] for getProjectProperties when project is missing', async () => {
    mockProbeProjectQuery.mockResolvedValue(null)

    await expect(
      remote.getProjectProperties({ projectId: 'project-1' }),
    ).resolves.toEqual({
      data: [],
    })
  })

  it('returns sorted resolved project properties when read is allowed', async () => {
    mockProbeProjectQuery.mockResolvedValue({
      id: 'project-1',
      organisationId: 'org-1',
      hubId: 'hub-a',
      isPublished: true,
      isArchived: false,
    })
    mockListResolvedProjectProperties.mockResolvedValue([
      { id: 'prop-b', rank: 2 },
      { id: 'prop-a', rank: 0 },
    ])

    const result = await remote.getProjectProperties({ projectId: 'project-1' })

    expect(result).toEqual({
      data: [
        { id: 'prop-a', rank: 0 },
        { id: 'prop-b', rank: 2 },
      ],
      meta: {
        isAdminRequest: true,
        projectId: 'project-1',
        requestPath: '/admin/properties',
      },
    })
  })
})
