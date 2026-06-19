import { describe, expect, it } from 'vitest'

import { extractVersionFromImageUrl } from '$lib/client/services/image'

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
