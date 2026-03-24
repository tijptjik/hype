import { describe, expect, it } from 'vitest'

import { toCloudflareImageWorkerPath } from '$lib/images/delivery'

describe('image delivery helpers', () => {
  it('builds worker paths for transformed and raw image requests', () => {
    expect(
      toCloudflareImageWorkerPath({
        env: 'production',
        publicId: 'features/example.jpg',
        version: 3,
        transformation: 'c_fill,h_512,w_512',
        gravity: 'center',
        quality: '85',
        format: 'webp',
      }),
    ).toBe(
      '/production/image/upload/c_fill,h_512,w_512/g_center/f_webp/q_85/v3/features/example.jpg',
    )

    expect(
      toCloudflareImageWorkerPath({
        env: 'production',
        publicId: 'features/example.jpg',
        version: 3,
        raw: true,
      }),
    ).toBe('/production/image/upload/v3/features/example.jpg')
  })
})
