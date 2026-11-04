// TESTS
import { beforeEach, expect, it, vi } from 'vitest'
// CONTEXT
import { ImportCtx } from '#lib/context/import.svelte.js'
// API
import { getProjectProperties } from '#lib/api/property.remote.js'
// SERVICES
import { fetchAvailablePropertyKeys } from '#lib/client/services/import/features/property.js'

vi.mock('#lib/api/property.remote.js', () => ({ getProjectProperties: vi.fn() }))
beforeEach(() => {
  vi.mocked(getProjectProperties).mockReset()
})

it.each(['success', 'failure'])(
  'ignores old-project %s after newer properties arrive',
  async outcome => {
    const ctx = new ImportCtx()
    let finish!: (value: unknown) => void
    let fail!: (error: Error) => void
    vi.mocked(getProjectProperties)
      .mockReturnValueOnce(
        new Promise((resolve, reject) => {
          finish = resolve
          fail = reject
        }) as never,
      )
      .mockResolvedValueOnce({ data: [{ id: 'new', key: 'new-key' }] } as never)
    ctx.setSelectedProject({ id: 'old-project' } as never)
    const old = fetchAvailablePropertyKeys(ctx)
    ctx.setSelectedProject({ id: 'new-project' } as never)
    await fetchAvailablePropertyKeys(ctx)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      if (outcome === 'success') finish({ data: [{ id: 'old', key: 'old-key' }] })
      else fail(new Error('old failure'))
      await old
    } finally {
      log.mockRestore()
    }
    expect(ctx.getFetchedProperties().map(property => property.id)).toEqual(['new'])
    expect(ctx.state.availablePropertyKeys).toEqual(['new-key'])
  },
)

it('does not end a newer same-project request when an earlier request finishes', async () => {
  const ctx = new ImportCtx()
  ctx.setSelectedProject({ id: 'project' } as never)
  const finishes: ((value: unknown) => void)[] = []
  vi.mocked(getProjectProperties).mockImplementation(
    () => new Promise(resolve => finishes.push(resolve)) as never,
  )
  const old = fetchAvailablePropertyKeys(ctx)
  const current = fetchAvailablePropertyKeys(ctx)
  finishes[0]({ data: [{ id: 'old', key: 'old' }] })
  await old
  expect(ctx.state.isFetchingProperties).toBe(true)
  expect(ctx.getFetchedProperties()).toEqual([])
  finishes[1]({ data: [{ id: 'new', key: 'new' }] })
  await current
  expect(ctx.state.isFetchingProperties).toBe(false)
  expect(ctx.state.availablePropertyKeys).toEqual(['new'])
})

it('does not resurrect property state after reset and reselecting the same project', async () => {
  const ctx = new ImportCtx()
  ctx.setSelectedProject({ id: 'project' } as never)
  let finish!: (value: unknown) => void
  vi.mocked(getProjectProperties).mockReturnValueOnce(
    new Promise(resolve => {
      finish = resolve
    }) as never,
  )
  const pending = fetchAvailablePropertyKeys(ctx)
  ctx.reset()
  ctx.setSelectedProject({ id: 'project' } as never)
  finish({ data: [{ id: 'old', key: 'old' }] })
  await pending
  expect(ctx.getFetchedProperties()).toEqual([])
  expect(ctx.state.availablePropertyKeys).toEqual([])
})

it('clears choices and loading when the project selection is removed', async () => {
  const ctx = new ImportCtx()
  ctx.setFetchedProperties([{ id: 'old', key: 'old' }] as never)
  ctx.setAvailablePropertyKeys(['old'])
  ctx.setIsFetchingProperties(true)
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    await fetchAvailablePropertyKeys(ctx)
  } finally {
    warn.mockRestore()
  }
  expect(ctx.getFetchedProperties()).toEqual([])
  expect(ctx.state.availablePropertyKeys).toEqual([])
  expect(ctx.state.isFetchingProperties).toBe(false)
  expect(getProjectProperties).not.toHaveBeenCalled()
})

it('refreshes a retained property query before publishing import choices', async () => {
  const ctx = new ImportCtx()
  ctx.setSelectedProject({ id: 'project' } as never)
  const query = Object.assign(Promise.resolve({ data: [{ id: 'old', key: 'old' }] }), {
    current: { data: [{ id: 'old', key: 'old' }] },
    refresh: vi.fn(async () => {
      query.current = { data: [{ id: 'new', key: 'new' }] }
    }),
  })
  vi.mocked(getProjectProperties).mockReturnValue(query as never)
  await fetchAvailablePropertyKeys(ctx)
  expect(ctx.state.availablePropertyKeys).toEqual(['new'])
  expect(query.refresh).toHaveBeenCalledOnce()
})
