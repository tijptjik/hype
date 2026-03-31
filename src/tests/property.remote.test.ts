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
  mockProbeProjectQuery,
  mockAuthorizeProjectReadForProbe,
  mockGuardedContext,
} = vi.hoisted(() => ({
  mockGetPrisms: vi.fn(() => ({ organisation: [], project: [], layer: [] })),
  mockGetPropertyQueryContext: vi.fn(() => ({ conditions: [] })),
  mockToPropertyPrismConditions: vi.fn(async ({ conditions }) => conditions),
  mockListProperties: vi.fn(async () => []),
  mockLoadProperty: vi.fn(async () => null),
  mockListResolvedProjectProperties: vi.fn(async () => []),
  mockProbeProjectQuery: vi.fn(async () => null),
  mockAuthorizeProjectReadForProbe: vi.fn(() => ({ allowed: true })),
  mockGuardedContext: vi.fn(),
}))

vi.mock('$lib/api/server/remote', () => ({
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
  toAuthMessage: (code: string) => code,
}))

vi.mock('$lib/db/services/property', () => ({
  listProperties: mockListProperties,
  listResolvedProjectProperties: mockListResolvedProjectProperties,
  getProperty: mockLoadProperty,
}))

vi.mock('$lib/db/services/project', () => ({
  probeProjectQuery: mockProbeProjectQuery,
}))

vi.mock('$lib/db/schema', async importOriginal => await importOriginal())

vi.mock('$lib/db/zod', () => ({
  ListQueryParamsSchema: {},
  ProjectPropertiesQuery: {},
}))

let remote: Awaited<typeof import('$lib/api/server/property.remote')>

describe('property.remote', () => {
  beforeEach(async () => {
    vi.resetModules()
    remote = await import('$lib/api/server/property.remote')
    vi.clearAllMocks()
    mockToPropertyResponseShape.mockImplementation((row: unknown) => ({ row }))
    mockGuardedContext.mockResolvedValue({
      db: {},
      user: { id: 'u-1', isAnonymous: false },
      userRoles: [],
      isAdminRequest: true,
      event: {
        request: new Request('https://example.test'),
        url: new URL('https://example.test/admin/properties'),
      },
    })
    mockAuthorizeProjectReadForProbe.mockReturnValue({ allowed: true })
  })

  it('filters getProperties rows to projects the actor can read', async () => {
    mockListProperties.mockResolvedValue([
      { id: 'prop-1', projectId: 'project-1' },
      { id: 'prop-2', projectId: 'project-2' },
      { id: 'prop-3', projectId: null },
    ])
    mockProbeProjectQuery.mockImplementation(async (_db: unknown, params: any) => ({
      id: params.ref,
      organisationId: 'org-1',
      hubId: 'hub-a',
      isPublished: true,
      isArchived: false,
    }))
    mockAuthorizeProjectReadForProbe.mockImplementation(({ probe }: any) =>
      probe.id === 'project-1' ? { allowed: true } : { allowed: false },
    )

    const result = await remote.getProperties({ conditions: {} })

    expect(result).toEqual({
      data: [{ row: { id: 'prop-1', projectId: 'project-1' } }],
    })
  })

  it('skips malformed property rows instead of failing the whole list', async () => {
    mockListProperties.mockResolvedValue([
      { id: 'prop-1', projectId: 'project-1' },
      { id: 'prop-2', projectId: 'project-1' },
    ])
    mockProbeProjectQuery.mockResolvedValue({
      id: 'project-1',
      organisationId: 'org-1',
      hubId: 'hub-a',
      isPublished: true,
      isArchived: false,
    })
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
