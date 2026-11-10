// @vitest-environment node
// TESTS
import { describe, expect, it, vi } from 'vitest'
// AUTH
vi.mock('#lib/api/index.js', () => ({
  getSessionOrError: async (locals: { user: unknown }) => ({ user: locals.user }),
}))
// ROUTE
import { load } from '../routes/admin/docs/+page.server'

describe('internal docs access', () => {
  it.each([
    [false, false, false],
    [false, true, true],
    [true, true, false],
  ])(
    'checks anonymous=%s and superAdmin=%s',
    async (isAnonymous, superAdmin, allowed) => {
      const result = Promise.resolve(
        load({ locals: { user: { isAnonymous, superAdmin } } } as never),
      )
      if (allowed) await expect(result).resolves.toEqual({})
      else await expect(result).rejects.toMatchObject({ status: 403 })
    },
  )
})
