import { describe, expect, it } from 'vitest'

import { toCloudflareImagesTransformDimensions } from '$lib/images/cloudflare'

describe('Cloudflare Images transform dimensions', () => {
  it('preserves one-dimensional c_fit requests', () => {
    expect(toCloudflareImagesTransformDimensions('c_fit', 1024)).toEqual({
      width: 1024,
    })
    expect(toCloudflareImagesTransformDimensions('c_fit', undefined, 768)).toEqual({
      height: 768,
    })
  })

  it('keeps c_fit bounding boxes and fill-mode compatibility', () => {
    expect(toCloudflareImagesTransformDimensions('c_fit', 1024, 768)).toEqual({
      width: 1024,
      height: 768,
    })
    expect(toCloudflareImagesTransformDimensions('c_fill', 1024)).toEqual({
      width: 1024,
      height: 1024,
    })
  })
})
