import { describe, expect, it } from 'vitest'

import { getImageWarmupPlan, normalizeWarmupExtension } from '$lib/images/warmup'

describe('image warmup planning', () => {
  it('skips all warmup targets for gif uploads', () => {
    const plan = getImageWarmupPlan({
      job: {
        env: 'production',
        publicId: 'h/features/example/gif-image',
        version: 7,
      },
      metadata: {
        originalExtension: 'gif',
        originalWidth: 2500,
        originalHeight: 2500,
        metadata: null,
      },
    })

    expect(plan.shouldWarm).toBe(false)
    expect(plan.derivativesSupported).toBe(false)
    expect(plan.skipReason).toBe('unsupported-source-format')
    expect(plan.targets).toEqual([])
  })

  it('prioritizes raw intermediate for resized raster uploads', () => {
    const plan = getImageWarmupPlan({
      job: {
        env: 'production',
        publicId: 'h/features/example/raster-image',
        version: 9,
      },
      metadata: {
        originalExtension: 'png',
        originalWidth: 6000,
        originalHeight: 4000,
        metadata: {
          uploadedWidth: '2048',
          uploadedHeight: '1365',
          clientResizeApplied: 'true',
        },
      },
    })

    expect(plan.shouldWarm).toBe(true)
    expect(plan.normalizedIntermediateExpected).toBe(true)
    expect(plan.targets[0]).toMatchObject({
      kind: 'rawIntermediate',
      required: true,
      path: '/image/raw/h_2048,w_2048/v9/h/features/example/raster-image',
    })
    expect(plan.targets.slice(1).map(target => target.kind)).toEqual([
      'prerender',
      'prerender',
      'prerender',
      'prerender',
      'prerender',
      'prerender',
    ])
  })

  it('warms only prerenders for small raster uploads', () => {
    const plan = getImageWarmupPlan({
      job: {
        env: 'preview',
        publicId: 'h/features/example/small-image',
        version: 4,
      },
      metadata: {
        originalExtension: 'webp',
        originalWidth: 1000,
        originalHeight: 1000,
        metadata: {
          uploadedWidth: '1000',
          uploadedHeight: '1000',
        },
      },
    })

    expect(plan.shouldWarm).toBe(true)
    expect(plan.normalizedIntermediateExpected).toBe(false)
    expect(plan.targets.every(target => target.kind === 'prerender')).toBe(true)
  })

  it('normalizes extension aliases used by metadata sidecars', () => {
    expect(normalizeWarmupExtension('.JPEG')).toBe('jpg')
    expect(normalizeWarmupExtension('tif')).toBe('tiff')
    expect(normalizeWarmupExtension(null)).toBeNull()
  })
})
