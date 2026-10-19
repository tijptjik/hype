import { beforeEach, describe, expect, it, vi } from 'vitest'

const scope = vi.hoisted(() => ({ contexts: new Map<unknown, unknown>() }))

// Model Svelte's per-render context map while allowing module re-evaluation.
vi.mock('svelte', async importOriginal => ({
  ...(await importOriginal<typeof import('svelte')>()),
  getContext: (key: unknown) => scope.contexts.get(key),
  hasContext: (key: unknown) => scope.contexts.has(key),
  setContext: (key: unknown, value: unknown) => {
    scope.contexts.set(key, value)
    return value
  },
}))

beforeEach(() => {
  scope.contexts = new Map()
})

describe('root context reloads', () => {
  it('resolves the original root and viewport after consumers reload', async () => {
    const provider = await import('#lib/context/root.svelte.js')
    const viewportProvider = await import('#lib/context/responsive.svelte.js')
    const viewport = viewportProvider.setResponsiveCtx()
    const root = provider.setRootCTX(viewport)

    vi.resetModules()
    const consumer = await import('#lib/context/root.svelte.js')
    const viewportConsumer = await import('#lib/context/responsive.svelte.js')

    expect(consumer.getRootCTX()).toBe(root)
    expect(viewportConsumer.getResponsiveCtx()).toBe(viewport)
    expect(consumer.getRootCTX().responsive).toBe(viewport)
  })

  it('requires a provider in each render and keeps separate roots isolated', async () => {
    const { setRootCTX, getRootCTX } = await import('#lib/context/root.svelte.js')
    const { setResponsiveCtx, getResponsiveCtx } = await import(
      '#lib/context/responsive.svelte.js'
    )
    const first = setRootCTX(setResponsiveCtx())
    const firstContexts = scope.contexts

    scope.contexts = new Map()
    expect(() => getRootCTX()).toThrow('RootCTX is missing from the root layout')
    expect(() => getResponsiveCtx()).toThrow('ResponsiveCtx is not set')
    const second = setRootCTX(setResponsiveCtx())
    expect(second).not.toBe(first)
    expect(second.account).not.toBe(first.account)
    expect(second.cacheCtx).not.toBe(first.cacheCtx)
    expect(second.responsive).not.toBe(first.responsive)

    scope.contexts = firstContexts
    expect(getRootCTX()).toBe(first)
    expect(getResponsiveCtx()).toBe(first.responsive)
  })
})
