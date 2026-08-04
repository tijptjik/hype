import { describe, expect, it, vi } from 'vitest'
import { markEmailVerifiedAfterPasswordReset } from '$lib/auth'
import { user } from '$lib/db/schema/user'

describe('password-reset email verification', () => {
  it('marks the reset-token owner email as verified', async () => {
    const where = vi.fn().mockResolvedValue(undefined)
    const set = vi.fn().mockReturnValue({ where })
    const update = vi.fn().mockReturnValue({ set })

    await markEmailVerifiedAfterPasswordReset({ update } as never, 'user-1')

    expect(update).toHaveBeenCalledWith(user)
    expect(set).toHaveBeenCalledWith({ emailVerified: true })
    expect(where).toHaveBeenCalledOnce()
  })
})
