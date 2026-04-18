import { describe, expect, it } from 'vitest'

import { AuthImageUploadSchema } from '$lib/db/zod/schema/image'
import {
  SUPPORTED_UPLOAD_IMAGE_ACCEPT,
  SUPPORTED_UPLOAD_IMAGE_ACCEPT_ATTRIBUTE,
  isSupportedUploadImageContentType,
} from '$lib/images/accept'

describe('image upload accept rules', () => {
  it('excludes gif and svg from upload accept values', () => {
    expect(SUPPORTED_UPLOAD_IMAGE_ACCEPT).not.toContain('image/gif')
    expect(SUPPORTED_UPLOAD_IMAGE_ACCEPT).not.toContain('image/svg+xml')
    expect(SUPPORTED_UPLOAD_IMAGE_ACCEPT).not.toContain('.gif')
    expect(SUPPORTED_UPLOAD_IMAGE_ACCEPT).not.toContain('.svg')
    expect(SUPPORTED_UPLOAD_IMAGE_ACCEPT_ATTRIBUTE).not.toContain('image/gif')
    expect(SUPPORTED_UPLOAD_IMAGE_ACCEPT_ATTRIBUTE).not.toContain('image/svg+xml')
  })

  it('rejects gif and svg content types during upload auth validation', () => {
    expect(isSupportedUploadImageContentType('image/gif')).toBe(false)
    expect(isSupportedUploadImageContentType('image/svg+xml')).toBe(false)

    expect(() =>
      AuthImageUploadSchema.parse({
        cdn: 'cloudflareR2',
        env: 'local',
        ctxType: 'feature',
        ctxId: 'feature-1',
        filename: 'test.gif',
        contentType: 'image/gif',
        size: 1,
        meta: {},
      }),
    ).toThrow('Unsupported image content type')

    expect(() =>
      AuthImageUploadSchema.parse({
        cdn: 'cloudflareR2',
        env: 'local',
        ctxType: 'feature',
        ctxId: 'feature-1',
        filename: 'test.svg',
        contentType: 'image/svg+xml',
        size: 1,
        meta: {},
      }),
    ).toThrow('Unsupported image content type')
  })
})
