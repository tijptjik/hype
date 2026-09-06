import { describe, expect, it } from 'vitest'
import { authorizeImageList, authorizeImageRead } from '$lib/api/services/authz/image'

describe('guest image visibility', () => {
  it.each([authorizeImageList, authorizeImageRead])(
    'requires an account for admin-mode image access',
    authorize => {
      const guest = {
        userId: 'guest',
        isAuthenticated: true,
        isAnonymous: true,
        userRoles: [],
      }
      for (const ctxType of [
        'feature',
        'project',
        'organisation',
        'hub',
        'task',
        'user',
      ] as const) {
        for (const isPublished of [false, true]) {
          expect(
            authorize(
              guest,
              { ctxType, ctxId: 'context' },
              { isPublished, isArchived: false },
              { isAdminRequest: true },
            ),
          ).toEqual({ allowed: false, code: 'ACCOUNT_REQUIRED' })
        }
      }
      expect(
        authorize(
          guest,
          { ctxType: 'feature', ctxId: 'feature' },
          { isPublished: true, isArchived: false },
          { isAdminRequest: false },
        ),
      ).toEqual({ allowed: true })
      expect(
        authorize(
          guest,
          { ctxType: 'feature', ctxId: 'feature' },
          { isPublished: false, isArchived: false },
          { isAdminRequest: false },
        ),
      ).toEqual({ allowed: false, code: 'INSUFFICIENT_ROLE' })
    },
  )
})
