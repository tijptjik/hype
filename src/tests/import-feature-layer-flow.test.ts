// @vitest-environment jsdom
// TESTS
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte/pure'
// CONTEXT
import { ImportCtx } from '#lib/context/import.svelte.js'
// API
import { getLayers } from '#lib/api/layer.remote.js'
// COMPONENTS
import ImportFeatureFlow from '#lib/bits/patterns/import/ImportFeatureFlow.svelte'

vi.mock('svelte/transition', () => ({ fade: () => ({ duration: 0 }) }))
vi.mock('#lib/context/responsive.svelte.js', async original => {
  const module = await original<typeof import('#lib/context/responsive.svelte.js')>()
  return { ...module, getResponsiveCtx: () => new module.ResponsiveCtx() }
})
vi.mock('#lib/api/layer.remote.js', () => ({
  getLayers: vi.fn(),
  getLayer: vi.fn(),
  createLayer: vi.fn(),
}))
beforeEach(() => {
  vi.useRealTimers()
  vi.mocked(getLayers).mockReset()
})
afterEach(cleanup)

it('blocks continuation after catalogue failure and retries into fallback selection', async () => {
  const ctx = new ImportCtx()
  ctx.setCurrentStep('user-matching')
  ctx.setSelectedProject({ id: 'project' } as never)
  ctx.setUserValidation({ results: [{ value: 'user', isValid: true, userId: 'user' }] })
  ctx.setLayerValidation({
    results: [{ value: 'old layer', isValid: true, layerId: 'old' }],
  })
  vi.mocked(getLayers)
    .mockRejectedValueOnce(new Error('unavailable'))
    .mockResolvedValue({
      data: [{ id: 'layer', i18n: { en: { name: 'Loaded layer' } } }],
      hasMore: false,
    } as never)
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    render(ImportFeatureFlow, {
      importCtx: ctx,
      appCtx: { getRoleScopeQueryKey: () => 'account' } as never,
      pendingDrop: null,
      onCancel: vi.fn(),
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Could not load layers'),
    )
    expect(ctx.getLayersLoaded()).toBe(false)
    expect(
      (screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    await fireEvent.click(screen.getByRole('button', { name: 'Retry loading layers' }))
    await waitFor(() => expect(ctx.getLayersLoaded()).toBe(true))
    expect(ctx.getAllLayers().map(layer => layer.id)).toEqual(['layer'])
    expect(ctx.getCurrentStep()).toBe('layer-matching')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByPlaceholderText('Search for layer...')).toBeTruthy()
  } finally {
    log.mockRestore()
  }
})

it.each(['input replacement', 'unmount'])(
  'discards pending catalogue results after %s',
  async action => {
    const ctx = new ImportCtx()
    ctx.setCurrentStep('user-matching')
    ctx.setSelectedProject({ id: 'project' } as never)
    ctx.setUserValidation({
      results: [{ value: 'user', isValid: true, userId: 'user' }],
    })
    ctx.setLayerValidation({
      results: [{ value: 'old layer', isValid: true, layerId: 'old' }],
    })
    let finish!: (value: unknown) => void
    vi.mocked(getLayers).mockReturnValueOnce(
      new Promise(resolve => {
        finish = resolve
      }) as never,
    )
    const mounted = render(ImportFeatureFlow, {
      importCtx: ctx,
      appCtx: { getRoleScopeQueryKey: () => 'account' } as never,
      pendingDrop: null,
      onCancel: vi.fn(),
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(getLayers).toHaveBeenCalledOnce())
    expect(
      (screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    if (action === 'unmount') await mounted.unmount()
    else ctx.setData([['new input']])
    finish({ data: [{ id: 'stale' }], hasMore: true, nextOffset: 1 })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(ctx.getLayersLoaded()).toBe(false)
    expect(ctx.getAllLayers()).toEqual([])
    expect(getLayers).toHaveBeenCalledOnce()
  },
)

it.each([false, true])(
  'uses one fresh catalogue for matching and choices when previously loaded is %s',
  async loaded => {
    const ctx = new ImportCtx()
    ctx.setCurrentStep('user-matching')
    ctx.setSelectedProject({ id: 'project' } as never)
    ctx.setData([['missing']])
    ctx.setHeaders(['layer'])
    ctx.setColumns([
      {
        header: 'layer',
        modelType: 'Layer',
        field: 'id',
        locale: 'None',
        sampleValues: ['missing'],
      },
    ] as never)
    ctx.setUserValidation({
      results: [{ value: 'user', isValid: true, userId: 'user' }],
    })
    ctx.setLayersLoaded(loaded)
    ctx.setAllLayers([{ id: 'retained' }] as never)
    vi.mocked(getLayers).mockResolvedValue({
      data: [{ id: 'current', i18n: { en: { name: 'Current layer' } } }],
      hasMore: false,
    } as never)
    render(ImportFeatureFlow, {
      importCtx: ctx,
      appCtx: { getRoleScopeQueryKey: () => 'account' } as never,
      pendingDrop: null,
      onCancel: vi.fn(),
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(ctx.getLayerValidation().results).toHaveLength(1))
    expect(ctx.getLayerValidation().results[0].isValid).toBe(false)
    expect(ctx.getAllLayers().map(layer => layer.id)).toEqual(['current'])
    expect(getLayers).toHaveBeenCalledOnce()
  },
)

it.each([false, true])(
  'reconciles retained fallback selection with refreshed availability %s',
  async available => {
    const ctx = new ImportCtx()
    ctx.setCurrentStep('user-matching')
    ctx.setSelectedProject({ id: 'project' } as never)
    ctx.setUserValidation({
      results: [{ value: 'user', isValid: true, userId: 'user' }],
    })
    ctx.setSelectedLayer({ id: 'chosen', i18n: { en: { name: 'Old name' } } } as never)
    ctx.setLayerValidation({ fallbackLayerId: 'chosen' })
    vi.mocked(getLayers).mockResolvedValue({
      data: available ? [{ id: 'chosen', i18n: { en: { name: 'Current name' } } }] : [],
      hasMore: false,
    } as never)
    render(ImportFeatureFlow, {
      importCtx: ctx,
      appCtx: { getRoleScopeQueryKey: () => 'account' } as never,
      pendingDrop: null,
      onCancel: vi.fn(),
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(ctx.getLayerValidation().showLayerSelection).toBe(true))
    expect(ctx.getLayerValidation().fallbackLayerId).toBe(
      available ? 'chosen' : undefined,
    )
    expect(ctx.getSelectedLayer()).toEqual(
      available
        ? expect.objectContaining({ i18n: { en: { name: 'Current name' } } })
        : null,
    )
    expect(
      (screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled,
    ).toBe(!available)
  },
)
