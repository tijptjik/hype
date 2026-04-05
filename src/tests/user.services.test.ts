import { describe, expect, it } from 'vitest'
import { getUserFeaturesByUserId } from '$lib/db/services/user'

describe('getUserFeaturesByUserId', () => {
  it('returns an empty result when the userFeature schema is missing', async () => {
    const missingTableError = new Error('D1_ERROR: no such table: userFeature')
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => ({
                offset: async () => {
                  throw missingTableError
                },
              }),
            }),
          }),
        }),
      }),
    } as any

    await expect(
      getUserFeaturesByUserId(db, {
        userId: 'user-1',
      }),
    ).resolves.toEqual({
      data: [],
      totalCount: 0,
    })
  })
})
