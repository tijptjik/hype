import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withRemoteMeta } from './remote-function-mock'

type ResourceBatch = (inputs: unknown[]) => unknown
type LayerBatchParams = {
  conditions: { id: string[] }
  meta: { isAdminRequest: boolean; profile?: string }
}

const mocks = vi.hoisted(() => ({
  organisations: vi.fn(),
  projects: vi.fn(),
  layers: vi.fn(),
  batch: null as ResourceBatch | null,
}))
vi.mock('#lib/api/server/guarded.js', () => ({
  guardedQuery: (
    schema: { parse: (input: unknown) => unknown },
    handler: (input: unknown, ctx: unknown) => unknown,
  ) => withRemoteMeta((input: unknown) => handler(schema.parse(input), {}), 'query'),
  guardedBatchQuery: (
    schema: { parse: (input: unknown) => unknown },
    handler: (inputs: unknown[], ctx: unknown) => unknown,
  ) => {
    mocks.batch = (inputs: unknown[]) =>
      handler(
        inputs.map(input => schema.parse(input)),
        {},
      )
    return withRemoteMeta(() => {}, 'query')
  },
}))
vi.mock('#lib/api/organisation.remote.js', () => ({
  getOrganisations: mocks.organisations,
  getOrganisationsWhichHaveLayers: mocks.organisations,
}))
vi.mock('#lib/api/project.remote.js', () => ({ getProjects: mocks.projects }))
vi.mock('#lib/api/layer.remote.js', () => ({ getLayers: mocks.layers }))
import { getDefaultLayerResources, getResourcePage } from '#lib/api/resources.remote.js'

const meta = { isAdminRequest: false, scope: 'user:hub:locale' }
describe('compact resource page boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  it('passes full-set search to the authorized service with a fixed 25 limit', async () => {
    mocks.projects.mockResolvedValue({ data: [{ id: '25' }], hasMore: true })
    const result = await getResourcePage({
      type: 'project',
      q: 'outside page one',
      meta,
    })
    expect(mocks.projects).toHaveBeenCalledWith(
      expect.objectContaining({
        q: 'outside page one',
        pagination: { limit: 25 },
        meta: { isAdminRequest: false, profile: 'compact' },
      }),
    )
    expect(result.nextCursor?.id).toBe('25')
  })
  it('advances with an ID cursor and rejects cursors from a different search', async () => {
    mocks.layers.mockResolvedValue({ data: [{ id: 'z' }], hasMore: true })
    const first = await getResourcePage({ type: 'layer', q: 'one', meta })
    await getResourcePage({ type: 'layer', q: 'one', meta, cursor: first.nextCursor })
    expect(mocks.layers).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pagination: { limit: 25, afterId: 'z', afterValue: 'z' },
        sorting: { sortBy: 'id', sortOrder: 'asc' },
      }),
    )
    await expect(
      getResourcePage({ type: 'layer', q: 'two', meta, cursor: first.nextCursor }),
    ).rejects.toMatchObject({ status: 400 })
    expect(mocks.layers).toHaveBeenCalledTimes(2)
  })
  it('partitions batched identities by admin intent and payload profile and bounds ID batches', async () => {
    mocks.layers.mockImplementation(async (params: LayerBatchParams) => ({
      data: params.conditions.id.map((id: string) => ({
        id,
        profile: params.meta.profile,
      })),
    }))
    const inputs = Array.from({ length: 51 }, (_, i) => ({
      type: 'layer',
      id: String(i),
      meta,
    }))
    inputs.push({ type: 'layer', id: 'admin', meta: { ...meta, isAdminRequest: true } })
    const resolve = await mocks.batch(inputs)
    expect(mocks.layers).toHaveBeenCalledTimes(4)
    for (const [params] of mocks.layers.mock.calls)
      expect(params.conditions.id.length).toBeLessThanOrEqual(25)
    expect(resolve(inputs[50]).id).toBe('50')
    expect(mocks.layers.mock.calls.at(-1)?.[0].meta.isAdminRequest).toBe(true)
  })
})

describe('default map selection boundary', () => {
  it('loads all authorized choices across pages, including optional layers and descriptions', async () => {
    mocks.layers.mockReset()
    mocks.layers
      .mockResolvedValueOnce({
        data: [{ id: 'a', isDefaultVisible: true }],
        hasMore: true,
      })
      .mockResolvedValueOnce({
        data: [{ id: 'z', isDefaultVisible: false }],
        hasMore: false,
      })
    const rows = await getDefaultLayerResources({ meta })
    expect(rows.map(row => row.id)).toEqual(['a', 'z'])
    expect(mocks.layers).toHaveBeenNthCalledWith(2, {
      conditions: { isArchived: false, isPublished: true },
      pagination: { limit: 250, afterId: 'a' },
      sorting: { sortBy: 'id', sortOrder: 'asc' },
      meta: { isAdminRequest: false, profile: 'default' },
    })
  })
})
