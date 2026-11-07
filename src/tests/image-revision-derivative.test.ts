// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { revisionDerivativeKey } from '#lib/images/revisionDerivative.js'
import type { PinnedImageDelivery } from '#lib/db/services/imageRevisionDelivery.js'

const pin: PinnedImageDelivery = {
  imageId: 'photo',
  revisionId: 'revision',
  storageNamespace: 'local',
  storageKey: 'uploads/photo',
  contentHash: 'a'.repeat(64),
  mediaType: 'image/jpeg',
  byteSize: 123,
  metadata: { version: 42 },
}
const url = (query = 't=c_fit,h_1024,w_1024') =>
  new URL(`https://example.test/?${query}`)
describe('exact revision derivative keys', () => {
  it('matches existing prerender keys regardless of dimension order', () => {
    expect(revisionDerivativeKey(pin, url())).toBe(
      'uploads/photo/v42/c_fit,w_1024,h_1024,g_auto,q_auto,f_webp',
    )
    expect(revisionDerivativeKey(pin, url('t=c_fill,w_256,h_256&format=jpeg'))).toBe(
      'uploads/photo/v42/c_fill,w_256,h_256,g_auto,q_auto,f_jpeg',
    )
  })
  it('uses the asset worker extensionless cache identity', () => {
    expect(
      revisionDerivativeKey({ ...pin, storageKey: 'uploads/photo.jpg' }, url()),
    ).toBe(revisionDerivativeKey(pin, url()))
  })
  it('never uses caller versions or latest manifests', () => {
    expect(revisionDerivativeKey(pin, url('t=c_fill,h_128,w_128&v=999'))).toContain(
      '/v42/',
    )
    expect(revisionDerivativeKey({ ...pin, metadata: {} }, url())).toBeNull()
  })
  it('keeps raw downloads and rotated reviews on exact source delivery', () => {
    expect(revisionDerivativeKey(pin, url(''))).toBeNull()
    expect(
      revisionDerivativeKey(
        { ...pin, metadata: { version: 43, renderRotation: 90 } },
        url(),
      ),
    ).toBeNull()
    expect(revisionDerivativeKey(pin, url('t=c_limit,w_256'))).toBeNull()
  })
  it('rejects invalid dimensions before any storage read', () => {
    expect(() => revisionDerivativeKey(pin, url('t=c_fill,w_99999'))).toThrow()
  })
})
