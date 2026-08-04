import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => {
  const refetch = vi.fn().mockResolvedValue(undefined)
  return {
    addPasskey: vi.fn(),
    changeEmail: vi.fn(),
    getSession: vi.fn(() => ({ refetch })),
    listUserPasskeys: vi.fn(),
    refetch,
    updateUser: vi.fn(),
  }
})

vi.mock('$lib/auth/client', () => ({
  authClient: {
    changeEmail: authMocks.changeEmail,
    passkey: {
      addPasskey: authMocks.addPasskey,
      listUserPasskeys: authMocks.listUserPasskeys,
    },
    updateUser: authMocks.updateUser,
  },
  useSession: () => ({ get: authMocks.getSession }),
}))

import {
  completePasskeyAccountUpgrade,
  PasskeySessionRefreshError,
} from '$lib/auth/passkey-upgrade'

describe('completePasskeyAccountUpgrade', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.listUserPasskeys.mockResolvedValue({ data: [{ id: 'passkey-1' }] })
    authMocks.updateUser.mockResolvedValue({})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  it('refetches the session atom after promoting the account', async () => {
    await completePasskeyAccountUpgrade({})

    expect(fetch).toHaveBeenCalledWith('/api/account/passkey', { method: 'POST' })
    expect(authMocks.refetch).toHaveBeenCalledOnce()
  })

  it('notifies callers after the passkey is ready and before profile updates', async () => {
    const steps: string[] = []
    authMocks.updateUser.mockImplementation(async () => {
      steps.push('profile')
      return {}
    })

    await completePasskeyAccountUpgrade({
      name: 'HYPE user',
      onPasskeyReady: () => steps.push('passkey'),
    })

    expect(steps).toEqual(['passkey', 'profile'])
  })

  it('refreshes the promoted session before saving optional profile fields', async () => {
    const steps: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        steps.push('session')
        return { ok: true }
      }),
    )
    authMocks.updateUser.mockImplementation(async () => {
      steps.push('profile')
      return {}
    })

    await completePasskeyAccountUpgrade({ name: 'HYPE user' })

    expect(steps).toEqual(['session', 'profile'])
  })

  it('reports a saved passkey whose session cache could not refresh', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

    await expect(completePasskeyAccountUpgrade({})).rejects.toBeInstanceOf(
      PasskeySessionRefreshError,
    )
    expect(authMocks.refetch).not.toHaveBeenCalled()
  })
})
