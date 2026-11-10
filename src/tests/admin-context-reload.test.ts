import { beforeEach, describe, expect, it, vi } from 'vitest'

const scope = vi.hoisted(() => ({ contexts: new Map<unknown, unknown>() }))

// Retain the mounted layout's context map while navigation reloads consumer modules.
vi.mock('svelte', async importOriginal => ({
  ...(await importOriginal<typeof import('svelte')>()),
  getContext: (key: unknown) => scope.contexts.get(key),
}))

beforeEach(() => {
  scope.contexts = new Map()
})

describe('admin context reloads', () => {
  it('keeps the mounted admin layout available to a newly loaded detail page', async () => {
    const provider = await import('#lib/context/admin.svelte.js')
    const setMainDimensions = vi.fn()
    const admin = { view: { layout: { setMainDimensions } } }
    scope.contexts.set(provider.ADMINCTX_KEY, admin)

    vi.resetModules()
    const consumer = await import('#lib/context/admin.svelte.js')
    const resolved = consumer.getAdminCtx()

    expect(resolved).toBe(admin)
    resolved.view.layout.setMainDimensions(1200, 800)
    expect(setMainDimensions).toHaveBeenCalledWith(1200, 800)
  })

  it('resolves each layout from its own context map', async () => {
    const { ADMINCTX_KEY, getAdminCtx } = await import('#lib/context/admin.svelte.js')
    const first = { view: { layout: {} } }
    const second = { view: { layout: {} } }
    scope.contexts.set(ADMINCTX_KEY, first)
    expect(getAdminCtx()).toBe(first)

    scope.contexts = new Map([[ADMINCTX_KEY, second]])
    expect(getAdminCtx()).toBe(second)
  })
})
