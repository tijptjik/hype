import { describe, expect, it, vi } from 'vitest'

describe('public application context reloads', () => {
  it('retains the provider key when a consumer imports a reloaded module', async () => {
    const provider = await import('#lib/context/app.svelte.js')
    const instance = {}
    const contexts = new Map([[provider.APPCTX_KEY, instance]])

    vi.resetModules()
    const consumer = await import('#lib/context/app.svelte.js')

    expect(contexts.get(consumer.APPCTX_KEY)).toBe(instance)
  })
})
