import { beforeEach, describe, expect, it, vi } from 'vitest'
// API
import {
  addUserFeatureToList,
  removeUserFeatureFromList,
} from '$lib/api/server/user.remote'
// SERVICES
import { updateUserFeature } from '$lib/client/services/userFeatures'

vi.mock('$lib/api/server/user.remote', () => ({
  addUserFeatureToList: vi.fn(),
  removeUserFeatureFromList: vi.fn(),
}))

describe('saved feature mutation results', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns deletion when clearing the final saved flag', async () => {
    vi.mocked(removeUserFeatureFromList)
      .mockResolvedValueOnce({
        data: {
          userId: 'user',
          featureId: 'feature',
          isWishlisted: false,
          isVisited: true,
          visitedAt: '2026-09-07T00:00:00.000Z',
        },
      } as Awaited<ReturnType<typeof removeUserFeatureFromList>>)
      .mockResolvedValueOnce({ data: null })

    expect(await updateUserFeature('user', 'feature', false, false)).toBeNull()
  })

  it('returns the remaining wishlist after clearing visited state', async () => {
    const remaining = {
      userId: 'user',
      featureId: 'feature',
      isWishlisted: true,
      isVisited: false,
      visitedAt: null,
    }
    vi.mocked(addUserFeatureToList).mockResolvedValue({
      data: { ...remaining, isVisited: true },
    } as Awaited<ReturnType<typeof addUserFeatureToList>>)
    vi.mocked(removeUserFeatureFromList).mockResolvedValue({
      data: remaining,
    } as Awaited<ReturnType<typeof removeUserFeatureFromList>>)

    expect(await updateUserFeature('user', 'feature', true, false)).toEqual(remaining)
  })
})
