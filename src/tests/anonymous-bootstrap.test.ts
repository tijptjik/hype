import { describe, expect, it, vi } from 'vitest'
import {
  bootstrapAnonymousSession,
  isAuthEntryPath,
  shouldBootstrapAnonymous,
  waitForSession,
} from '#lib/auth/bootstrap.js'
import { AUTH_PROVIDER_REGISTRY } from '#lib/auth/providers.js'

describe('initial session readiness', () => {
  it('waits for a delayed authenticated session before allowing access decisions', async () => {
    let session = { isPending: true, userId: null as string | null }
    let waits = 0
    await waitForSession({
      getSession: () => session,
      wait: async () => {
        waits += 1
        session = { isPending: false, userId: 'admin-1' }
      },
    })
    expect(waits).toBe(1)
    expect(session.userId).toBe('admin-1')
  })

  it('accepts a settled missing session for the access guard to reject', async () => {
    const wait = vi.fn()
    await waitForSession({
      getSession: () => ({ isPending: false, userId: null }),
      wait,
    })
    expect(wait).not.toHaveBeenCalled()
  })

  it('fails bootstrap instead of treating a timed-out lookup as an unauthorised user', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValue(8_000)
    try {
      await expect(
        waitForSession({ getSession: () => ({ isPending: true }) }),
      ).rejects.toThrow('Session lookup did not finish')
    } finally {
      now.mockRestore()
    }
  })
})

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

  it('identifies auth entry routes that bypass the app readiness gate', () => {
    expect(isAuthEntryPath('/signin')).toBe(true)
    expect(isAuthEntryPath('/signup')).toBe(true)
    expect(isAuthEntryPath('/')).toBe(false)
    expect(isAuthEntryPath('/features/place-1')).toBe(false)
  })

  it('enables Facebook and keeps WeChat disabled', () => {
    expect(
      AUTH_PROVIDER_REGISTRY.find(provider => provider.id === 'facebook')?.enabled,
    ).toBe(true)
    expect(
      AUTH_PROVIDER_REGISTRY.find(provider => provider.id === 'wechat')?.enabled,
    ).toBe(false)
  })
})
