// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte/pure'
import { tick } from 'svelte'
import { ImportCtx } from '#lib/context/import.svelte.js'
import { translateText } from '#lib/api/translation.remote.js'
import { createProjectProperty } from '#lib/api/property.remote.js'
import Fixture from './fixtures/components/ImportPropertyLifecycleFixture.svelte'

const mocks = vi.hoisted(() => ({ ctx: null as unknown, cache: vi.fn() }))
vi.mock('#lib/context/import.svelte.js', async original => ({
  ...(await original<object>()),
  getImportCtx: () => mocks.ctx,
}))
vi.mock('#lib/context/resourceView.svelte.js', () => ({
  getSurfaceCtx: () => ({
    addToCache: mocks.cache,
    getRoleScopeQueryKey: () => 'account-a',
  }),
}))
vi.mock('#lib/context/responsive.svelte.js', async original => {
  const value = await original<typeof import('#lib/context/responsive.svelte.js')>()
  return { ...value, getResponsiveCtx: () => new value.ResponsiveCtx() }
})
vi.mock('#lib/api/property.remote.js', () => ({ createProjectProperty: vi.fn() }))
vi.mock('#lib/api/translation.remote.js', () => ({
  translateText: vi.fn().mockResolvedValue(['Label', 'Placeholder']),
}))
beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})
afterEach(cleanup)

it.each(['reset', 'unmount'])(
  'ignores property creation completion after %s',
  async action => {
    const ctx = new ImportCtx()
    mocks.ctx = ctx
    ctx.setSelectedProject({ id: 'project', organisationId: 'org' } as never)
    ctx.setData([['A note']])
    ctx.setHeaders(['note'])
    ctx.setCurrentStep('property-matching')
    const complete = vi.fn()
    let finish!: (value: unknown) => void
    vi.mocked(createProjectProperty).mockReturnValueOnce(
      new Promise(resolve => {
        finish = resolve
      }) as never,
    )
    const mounted = render(Fixture, { onComplete: complete })
    await fireEvent.click(screen.getByRole('button', { name: 'Create test property' }))
    await waitFor(() => expect(createProjectProperty).toHaveBeenCalledOnce())
    if (action === 'reset') ctx.reset()
    else await mounted.unmount()
    finish({ data: { id: 'old', key: 'note', type: 'specifier' } })
    await tick()
    await Promise.resolve()
    expect(ctx.getFetchedProperties()).toEqual([])
    expect(ctx.getPropertyEnrichedData('note')).toBeUndefined()
    expect(mocks.cache).not.toHaveBeenCalled()
    expect(complete).not.toHaveBeenCalled()
  },
)

it('does not dispatch property creation after unmount during its translation wait', async () => {
  const ctx = new ImportCtx()
  mocks.ctx = ctx
  ctx.setSelectedProject({ id: 'project', organisationId: 'org' } as never)
  ctx.setData([['A note']])
  ctx.setHeaders(['note'])
  ctx.setCurrentStep('property-matching')
  let finish!: (value: string[]) => void
  vi.mocked(translateText).mockReturnValueOnce(
    new Promise(resolve => {
      finish = resolve
    }) as never,
  )
  const mounted = render(Fixture, { onComplete: vi.fn(), translate: true })
  await waitFor(() => expect(translateText).toHaveBeenCalledOnce())
  try {
    await fireEvent.click(screen.getByRole('button', { name: 'Create test property' }))
    await mounted.unmount()
    finish(['Old label', 'Old placeholder'])
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(createProjectProperty).not.toHaveBeenCalled()
    expect(translateText).toHaveBeenCalledOnce()
  } finally {
    vi.useRealTimers()
  }
})
