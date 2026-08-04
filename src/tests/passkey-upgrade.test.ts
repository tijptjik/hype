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

import { completePasskeyAccountUpgrade } from '$lib/auth/passkey-upgrade'

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
})
