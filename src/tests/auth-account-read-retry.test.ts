// TESTS
import { afterEach, describe, expect, it, vi } from 'vitest'
// AUTH
import { requireAvailableAuthUser } from '#lib/auth/account-state.server.js'
// TYPES
import type { Database } from '#lib/types.js'

afterEach(() => vi.useRealTimers())

describe('account availability read recovery', () => {
  for (const archived of [false, true]) {
    it(`rechecks authoritative account state after a transient failure (archived=${archived})`, async () => {
      vi.useFakeTimers()
      const read = vi
        .fn()
        .mockRejectedValueOnce(
          new Error('Failed query', {
            cause: new Error(
              'D1_ERROR: Failed to get session commit token: internal error; reference = test',
            ),
          }),
        )
        .mockResolvedValue({ isArchived: archived, isUnclaimed: false })
      const db = { query: { user: { findFirst: read } } } as unknown as Database
      const result = requireAvailableAuthUser(db, 'actor')
      const assertion = archived
        ? expect(result).rejects.toMatchObject({ status: 'UNAUTHORIZED' })
        : expect(result).resolves.toBeUndefined()
      await vi.runAllTimersAsync()
      await assertion
      expect(read).toHaveBeenCalledTimes(2)
    })
  }
})
