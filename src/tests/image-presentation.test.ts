// TESTS
import { describe, expect, it } from 'vitest'
// IMAGE PRESENTATION
import {
  getImageEdgeGaps,
  getImageEdgeInset,
  getUploadImagePresentation,
  normalizeImagePresentation,
  resolveImagePresentation,
} from '#lib/images/presentation.js'
// SCHEMAS
import { ImageUpdate, UpdateImageSchema } from '#lib/db/zod/schema/image.js'

describe('image presentation policy', () => {
  it('defaults Feature uploads to blur and other resource uploads to cast edges', () => {
    expect(getUploadImagePresentation('feature')).toBe('contain')
    for (const ctxType of ['organisation', 'project', 'hub', 'user']) {
      expect(getUploadImagePresentation(ctxType)).toBe('cast-edges')
    }
  })

  it.each(['organisation', 'project', 'hub', 'feature'] as const)(
    'accepts edge casting through the %s metadata update contract',
    ctxType => {
      const payload = UpdateImageSchema.parse({
        id: 'image',
        ctxId: 'owner',
        ctxType,
        data: { presentationMode: 'cast-edges' },
      })
      expect(ImageUpdate.parse(payload.data).presentationMode).toBe('cast-edges')
      expect(() => ImageUpdate.parse({ presentationMode: 'unknown' })).toThrow()
    },
  )

  it('retains legacy cover, full and missing preferences', () => {
    expect(resolveImagePresentation('cover')).toEqual({
      fit: 'cover',
      backdrop: 'blur',
    })
    expect(resolveImagePresentation('contain')).toEqual({
      fit: 'fit',
      backdrop: 'blur',
    })
    expect(resolveImagePresentation('cast-edges')).toEqual({
      fit: 'fit',
      backdrop: 'edges',
    })
    expect(normalizeImagePresentation(null)).toBe('contain')
    expect(normalizeImagePresentation('unsupported')).toBe('contain')
  })
})

describe('cast-edge geometry', () => {
  it.each([1, 2, 3, 64, 1024])('keeps inset slices inside a %spx source', size => {
    const inset = getImageEdgeInset(size)
    expect(inset).toBeGreaterThanOrEqual(0)
    expect(size - inset - 1).toBeGreaterThanOrEqual(inset)
    if (size >= 3) expect(inset).toBeGreaterThan(0)
  })
  it.each([
    [100, 100, 600, 300, { x: 150, y: 0 }],
    [200, 100, 300, 300, { x: 0, y: 75 }],
    [100, 200, 300, 300, { x: 75, y: 0 }],
    [200, 100, 600, 300, { x: 0, y: 0 }],
    [100, 100, 301, 200, { x: 50.5, y: 0 }],
    [100, 100, 0, 300, { x: 0, y: 0 }],
    [0, 100, 600, 300, { x: 0, y: 0 }],
    [Infinity, 100, 600, 300, { x: 0, y: 0 }],
  ])('casts a %sx%s image into a %sx%s container', (iw, ih, w, h, expected) => {
    expect(getImageEdgeGaps(iw, ih, w, h)).toEqual(expected)
  })
})
