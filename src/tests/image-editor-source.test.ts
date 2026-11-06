// TESTS
import { describe, expect, it } from 'vitest'
// IMAGE DELIVERY
import { getEditorViewerSrc, getURLfromImage } from '#lib/client/services/image.js'
// TYPES
import type { ImageCtxEnvelope } from '#lib/db/zod/schema/image.types.js'

const legacy = {
  ctxType: 'project',
  ctxId: 'YuSFnia9VOtG',
  image: {
    id: '04I-yUQhyJd3',
    cdn: 'cloudflareR2',
    env: 'production',
    publicId: 'h/hkghostsigns/hkghostsigns/wkux4dqsdoc804lcwsu8',
    version: 1749195460,
  },
} as ImageCtxEnvelope

describe('editor image sources', () => {
  it('uses the retained display derivative for legacy imports without requiring raw bytes', () => {
    const preview = getEditorViewerSrc(legacy)
    expect(preview).toContain('/image/upload/c_fit,h_1024,w_1024/')
    expect(preview).toContain('/v1749195460/h/hkghostsigns/')
    // Full-resolution downloads must still request their original source.
    expect(
      getURLfromImage({ image: legacy, raw: true, rawTransformation: null }),
    ).toContain('/image/raw/v1749195460/')
  })

  it('preserves existing bounded source routing for images declaring a revision', () => {
    const pinned = {
      ...legacy,
      ctxType: 'feature',
      ctxId: 'feature-id',
      image: { ...legacy.image, imageRevisionId: 'exact-image-revision' },
    } as ImageCtxEnvelope
    const preview = getEditorViewerSrc(pinned)
    expect(preview).toBe(
      getURLfromImage({
        image: pinned,
        raw: true,
        rawTransformation: 'h_2048,w_2048',
      }),
    )
    expect(preview).not.toContain('/image/upload/')
  })
})
