// TESTS
import { beforeEach, expect, it, vi } from 'vitest'
// CONTEXT
import { ImportCtx } from '#lib/context/import.svelte.js'
// API
import { createLayer, getLayer } from '#lib/api/layer.remote.js'
import { getProjectProperties } from '#lib/api/property.remote.js'
// SERVICES
import { submitLayerForm } from '#lib/client/services/import/features/layer.js'

vi.mock('#lib/api/layer.remote.js', () => ({
  createLayer: vi.fn(),
  getLayer: vi.fn(),
  getLayers: vi.fn(),
}))
vi.mock('#lib/api/property.remote.js', () => ({ getProjectProperties: vi.fn() }))
beforeEach(() => {
  vi.clearAllMocks()
})

it.each(['properties', 'create', 'reload'])(
  'stops old layer creation after reset during %s',
  async stage => {
    const ctx = new ImportCtx()
    ctx.setSelectedProject({ id: 'old-project', organisationId: 'org' } as never)
    ctx.setLayerForm({ i18n: { en: { name: 'Old layer' } } } as never)
    let finish!: (value: unknown) => void
    const pendingResult = new Promise(resolve => {
      finish = resolve
    })
    vi.mocked(getProjectProperties).mockReturnValue(
      (stage === 'properties' ? pendingResult : Promise.resolve({ data: [] })) as never,
    )
    vi.mocked(createLayer).mockReturnValue(
      (stage === 'create'
        ? pendingResult
        : Promise.resolve({ data: { id: 'old-layer' } })) as never,
    )
    vi.mocked(getLayer).mockReturnValue(
      (stage === 'reload'
        ? pendingResult
        : Promise.resolve({ data: { id: 'old-layer' } })) as never,
    )
    const pending = submitLayerForm(ctx, {
      preventDefault: vi.fn(),
    } as unknown as Event)
    // Wait until the selected remote boundary is actually pending.
    await vi.waitFor(() =>
      expect(
        stage === 'properties'
          ? getProjectProperties
          : stage === 'create'
            ? createLayer
            : getLayer,
      ).toHaveBeenCalledOnce(),
    )
    ctx.reset()
    ctx.setIsSubmittingLayer(true)
    finish(stage === 'properties' ? { data: [] } : { data: { id: 'old-layer' } })
    await pending
    if (stage === 'properties') expect(createLayer).not.toHaveBeenCalled()
    if (stage !== 'reload') expect(getLayer).not.toHaveBeenCalled()
    expect(ctx.getAllLayers()).toEqual([])
    expect(ctx.getSelectedLayer()).toBeNull()
    expect(ctx.getIsSubmittingLayer()).toBe(true)
  },
)

it('selects a successfully created layer and releases the current submission state', async () => {
  const ctx = new ImportCtx()
  ctx.setSelectedProject({ id: 'project', organisationId: 'org' } as never)
  ctx.setLayerForm({ i18n: { en: { name: 'Layer' } } } as never)
  ctx.setIsCreatingLayer(true)
  vi.mocked(getProjectProperties).mockResolvedValue({ data: [] } as never)
  vi.mocked(createLayer).mockResolvedValue({ data: { id: 'layer' } } as never)
  vi.mocked(getLayer).mockResolvedValue({ data: { id: 'layer' } } as never)
  await submitLayerForm(ctx, { preventDefault: vi.fn() } as unknown as Event)
  expect(ctx.getSelectedLayer()?.id).toBe('layer')
  expect(ctx.getLayerValidation().fallbackLayerId).toBe('layer')
  expect(ctx.getAllLayers()).toEqual([{ id: 'layer' }])
  expect(ctx.getLayerForm()).toBeNull()
  expect(ctx.getIsSubmittingLayer()).toBe(false)
  expect(ctx.getIsCreatingLayer()).toBe(false)
})

it('does not create an incomplete layer when project-property lookup fails', async () => {
  const ctx = new ImportCtx()
  ctx.setSelectedProject({ id: 'project', organisationId: 'org' } as never)
  ctx.setLayerForm({ i18n: { en: { name: 'Layer' } } } as never)
  vi.mocked(getProjectProperties).mockRejectedValue(
    new Error('property lookup unavailable'),
  )
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    await submitLayerForm(ctx, { preventDefault: vi.fn() } as unknown as Event)
  } finally {
    log.mockRestore()
  }
  expect(createLayer).not.toHaveBeenCalled()
  expect(ctx.getLayerForm()).not.toBeNull()
  expect(ctx.getIsSubmittingLayer()).toBe(false)
})

it('uses refreshed project properties and reloads the newly created layer', async () => {
  const ctx = new ImportCtx()
  ctx.setSelectedProject({ id: 'project', organisationId: 'org' } as never)
  ctx.setLayerForm({ i18n: { en: { name: 'Layer' } } } as never)
  const properties = Object.assign(
    Promise.resolve({ data: [{ id: 'old-property' }] }),
    {
      current: { data: [{ id: 'old-property' }] },
      refresh: vi.fn(async () => {
        properties.current = { data: [{ id: 'new-property' }] }
      }),
    },
  )
  const layer = Object.assign(Promise.resolve({ data: null }), {
    current: { data: null } as { data: { id: string } | null },
    refresh: vi.fn(async () => {
      layer.current = { data: { id: 'layer' } }
    }),
  })
  vi.mocked(getProjectProperties).mockReturnValue(properties as never)
  vi.mocked(createLayer).mockResolvedValue({ data: { id: 'layer' } } as never)
  vi.mocked(getLayer).mockReturnValue(layer as never)
  await submitLayerForm(ctx, { preventDefault: vi.fn() } as unknown as Event)
  expect(createLayer).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        properties: [
          { propertyId: 'new-property', isVisible: false, isUserContributable: false },
        ],
      }),
    }),
  )
  expect(ctx.getSelectedLayer()?.id).toBe('layer')
  expect(properties.refresh).toHaveBeenCalledOnce()
  expect(layer.refresh).toHaveBeenCalledOnce()
})
