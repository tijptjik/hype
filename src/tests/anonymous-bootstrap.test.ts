import { describe, expect, it } from 'vitest'
import {
  bootstrapAnonymousSession,
  shouldBootstrapAnonymous,
} from '$lib/auth/bootstrap'
import { AUTH_PROVIDER_REGISTRY } from '$lib/auth/providers'

describe('guest session bootstrap', () => {
  it('coalesces concurrent bootstrap calls into one anonymous sign-in', async () => {
    let userId: string | null = null
    let signInCount = 0
    const options = {
      getSession: () => ({ isPending: false, userId }),
      signInAnonymous: async () => {
        signInCount += 1
        userId = 'guest-1'
      },
      refetchSession: async () => {},
      wait: async () => {},
    }

    await Promise.all([
      bootstrapAnonymousSession(options),
      bootstrapAnonymousSession(options),
      bootstrapAnonymousSession(options),
    ])

    expect(signInCount).toBe(1)
    expect(userId).toBe('guest-1')
  })

  it('boots only interactive application routes', () => {
    expect(shouldBootstrapAnonymous('/')).toBe(true)
    expect(shouldBootstrapAnonymous('/features/place-1?panel=stars')).toBe(true)
    expect(shouldBootstrapAnonymous('/admin/tasks')).toBe(false)
    expect(shouldBootstrapAnonymous('/signin')).toBe(false)
    expect(shouldBootstrapAnonymous('/screensaver')).toBe(true)
    expect(shouldBootstrapAnonymous('/api/health')).toBe(false)
    expect(shouldBootstrapAnonymous('/headless/map-layer-render/layer-1')).toBe(false)
    expect(shouldBootstrapAnonymous('/policy/privacy')).toBe(false)
  })

  it('keeps unavailable providers disabled', () => {
    expect(
      AUTH_PROVIDER_REGISTRY.find(provider => provider.id === 'facebook')?.enabled,
    ).toBe(true)
    expect(
      AUTH_PROVIDER_REGISTRY.find(provider => provider.id === 'wechat')?.enabled,
    ).toBe(false)
  })
})
