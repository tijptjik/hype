// TESTS
import { beforeEach, expect, it, vi } from 'vitest'
// API
import { getLayers } from '#lib/api/layer.remote.js'
// SERVICES
import { preloadLayers } from '#lib/client/services/import/features/layer.js'

vi.mock('#lib/api/layer.remote.js', () => ({
  getLayers: vi.fn(),
  getLayer: vi.fn(),
  createLayer: vi.fn(),
}))
vi.mock('#lib/api/property.remote.js', () => ({ getProjectProperties: vi.fn() }))
beforeEach(() => {
  vi.mocked(getLayers).mockReset()
})

it('loads subsequent layer pages using the server continuation offset', async () => {
  vi.mocked(getLayers)
    .mockResolvedValueOnce({
      data: [{ id: 'first' }],
      hasMore: true,
      nextOffset: 100,
      totalCount: 101,
    } as never)
    .mockResolvedValueOnce({
      data: [{ id: 'last' }],
      hasMore: false,
      totalCount: 101,
    } as never)
  expect((await preloadLayers('project')).map(layer => layer.id)).toEqual([
    'first',
    'last',
  ])
  expect(getLayers).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ pagination: { limit: 500, offset: 100 } }),
  )
})

it.each(['failure', 'stalled'])(
  'does not return a partial layer catalogue after %s pagination',
  async scenario => {
    vi.mocked(getLayers).mockResolvedValueOnce({
      data: [{ id: 'first' }],
      hasMore: true,
      nextOffset: 1,
    } as never)
    if (scenario === 'failure')
      vi.mocked(getLayers).mockRejectedValueOnce(new Error('next page failed'))
    else
      vi.mocked(getLayers).mockResolvedValueOnce({
        data: [{ id: 'first' }],
        hasMore: true,
        nextOffset: 1,
      } as never)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(preloadLayers('project')).rejects.toThrow()
    } finally {
      log.mockRestore()
    }
    expect(getLayers).toHaveBeenCalledTimes(2)
  },
)

it('refreshes retained native layer queries before matching an import', async () => {
  const query = Object.assign(
    Promise.resolve({ data: [{ id: 'old' }], hasMore: false }),
    {
      current: { data: [{ id: 'old' }], hasMore: false },
      refresh: vi.fn(async () => {
        query.current = { data: [{ id: 'current' }], hasMore: false }
      }),
    },
  )
  vi.mocked(getLayers).mockReturnValue(query as never)
  expect((await preloadLayers('project')).map(layer => layer.id)).toEqual(['current'])
  expect(query.refresh).toHaveBeenCalledOnce()
})

it('stops pagination without publishing a partial catalogue after cancellation', async () => {
  let current = true
  let finish!: (value: unknown) => void
  vi.mocked(getLayers)
    .mockReturnValueOnce(
      new Promise(resolve => {
        finish = resolve
      }) as never,
    )
    .mockResolvedValue({ data: [{ id: 'second' }], hasMore: false } as never)
  const pending = preloadLayers('project', () => current)
  current = false
  finish({ data: [{ id: 'first' }], hasMore: true, nextOffset: 1 })
  expect(await pending).toEqual([])
  expect(getLayers).toHaveBeenCalledOnce()
})
