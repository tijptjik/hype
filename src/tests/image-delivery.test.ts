import { describe, expect, it } from 'vitest'

import {
  toCloudflareImageWorkerPath,
  toImagePrerenderWorkerPaths,
} from '$lib/images/delivery'

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

  it('omits the version segment when no version exists and returns prerender variants', () => {
    expect(
      toCloudflareImageWorkerPath({
        env: 'preview',
        publicId: 'features/example.jpg',
        transformation: 'c_fill,h_256,w_256',
      }),
    ).toBe(
      '/preview/image/upload/c_fill,h_256,w_256/g_auto/f_auto/q_auto/features/example.jpg',
    )

    expect(
      toImagePrerenderWorkerPaths({
        env: 'preview',
        publicId: 'features/example.jpg',
        version: 7,
      }),
    ).toEqual([
      '/preview/image/upload/c_fill,h_256,w_256/g_auto/f_auto/q_auto/v7/features/example.jpg',
      '/preview/image/upload/c_fill,h_128,w_128/g_auto/f_auto/q_auto/v7/features/example.jpg',
      '/preview/image/upload/c_fit,h_1024,w_1024/g_auto/f_auto/q_auto/v7/features/example.jpg',
    ])
  })
})
