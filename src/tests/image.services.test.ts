import { describe, expect, it, vi } from 'vitest'

import { extractVersionFromImageUrl } from '$lib/client/services/image'
import { getFeatureCanonicalImageOccupancy } from '$lib/db/services/image'
import type { Database } from '$lib/types'

describe('image service helpers', () => {
  it('extracts version numbers from Cloudflare image URLs', () => {
    expect(
      extractVersionFromImageUrl(
        '/image/upload/c_fill,h_256,w_256/g_auto/f_webp/q_auto/v7/features/example.jpg',
      ),
    ).toBe(7)
    expect(
      extractVersionFromImageUrl('/image/raw/c_scale,w_2048/v42/features/example.jpg'),
    ).toBe(42)
  })

  it('returns null when the URL has no version segment', () => {
    expect(
      extractVersionFromImageUrl('/image/upload/c_fill/features/example.jpg'),
    ).toBe(null)
    expect(extractVersionFromImageUrl(null)).toBe(null)
  })
})

describe('getFeatureCanonicalImageOccupancy', () => {
  it('batches feature lookups below the D1 parameter limit', async () => {
    const whereCalls: unknown[] = []
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(async (condition: unknown) => {
            whereCalls.push(condition)

            return whereCalls.length === 1
              ? [{ featureId: 'feature-001' }, { featureId: 'feature-002' }]
              : [{ featureId: 'feature-002' }, { featureId: 'feature-003' }]
          }),
        })),
      })),
    } as unknown as Database

    const featureIds = Array.from(
      { length: 100 },
      (_value, index) => `feature-${index.toString().padStart(3, '0')}`,
    )

    await expect(getFeatureCanonicalImageOccupancy(db, featureIds)).resolves.toEqual([
      'feature-001',
      'feature-002',
      'feature-003',
    ])
    expect(whereCalls).toHaveLength(2)
  })
})
