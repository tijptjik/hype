import { beforeEach, describe, expect, it, vi } from 'vitest'

const scope = vi.hoisted(() => ({ contexts: new Map<unknown, unknown>() }))

// Retain the mounted layout's context while navigation reloads page modules.
vi.mock('svelte', async importOriginal => ({
  ...(await importOriginal<typeof import('svelte')>()),
  getContext: (key: unknown) => scope.contexts.get(key),
  setContext: (key: unknown, value: unknown) => {
    scope.contexts.set(key, value)
    return value
  },
}))

beforeEach(() => {
  scope.contexts = new Map()
})

describe('header context reloads', () => {
  it('retains the resource title through pending sidebar switches until the next name resolves', async () => {
    const { HeaderCtrl } = await import('#lib/context/header.svelte.js')
    const header = new HeaderCtrl()
    expect(header.resolveEntityTitle(undefined, 'Organisation')).toBe('Organisation')
    header.state.meta.title = 'Hong Kong Ghost Signs'
    for (const pending of [undefined, null, '']) {
      header.state.meta.title = header.resolveEntityTitle(pending, 'Organisation')
      expect(header.state.meta.title).toBe('Hong Kong Ghost Signs')
    }
    header.state.meta.title = header.resolveEntityTitle('City Recorder', 'Organisation')
    expect(header.state.meta.title).toBe('City Recorder')
    expect(header.resolveEntityTitle(undefined, 'Organisation')).toBe('City Recorder')
    header.clearMeta()
    expect(header.resolveEntityTitle(undefined, 'Organisation')).toBe('Organisation')
  })

  it('resolves the mounted header after a page consumer reloads', async () => {
    const provider = await import('#lib/context/header.svelte.js')
    const header = provider.setHeaderCtrl()

    vi.resetModules()
    const consumer = await import('#lib/context/header.svelte.js')

    expect(consumer.getHeaderCtrl()).toBe(header)
  })

  it('keeps nested headers isolated and still requires a provider', async () => {
    const { setHeaderCtrl, getHeaderCtrl } = await import(
      '#lib/context/header.svelte.js'
    )
    expect(() => getHeaderCtrl()).toThrow('HeaderCtrl context is missing')
    const parent = setHeaderCtrl()
    const parentContexts = scope.contexts

    scope.contexts = new Map(parentContexts)
    const child = setHeaderCtrl()
    expect(child).not.toBe(parent)
    expect(getHeaderCtrl()).toBe(child)

    scope.contexts = parentContexts
    expect(getHeaderCtrl()).toBe(parent)
    scope.contexts = new Map()
    expect(() => getHeaderCtrl()).toThrow('HeaderCtrl context is missing')
  })
})
