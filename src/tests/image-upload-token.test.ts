// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUploadToken, verifyUploadToken } from '$lib/images/auth'

afterEach(() => vi.restoreAllMocks())

const claims = {
  publicId: 'h/features/feature/image',
  env: 'local',
  ctxType: 'feature',
  ctxId: 'feature',
  filename: 'image.jpg',
  contentType: 'image/jpeg',
  size: 100,
  uploaderUserId: 'user',
  exp: 2000,
}

describe('upload token verification', () => {
  it('accepts valid signatures and rejects wrong secrets, extra segments, and expired tokens', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    const token = await createUploadToken(claims, 'secret')
    await expect(verifyUploadToken(token, 'secret')).resolves.toEqual(claims)
    await expect(verifyUploadToken(token, 'wrong')).resolves.toBeNull()
    await expect(verifyUploadToken(`${token}.extra`, 'secret')).resolves.toBeNull()
    vi.spyOn(Date, 'now').mockReturnValue(2000)
    await expect(verifyUploadToken(token, 'secret')).resolves.toBeNull()
  })

  it.each(['', '.', 'bad', 'a.a', '%.%', 'aa.aa.aa'])(
    'returns null for malformed input %j',
    async token => {
      await expect(verifyUploadToken(token, 'secret')).resolves.toBeNull()
    },
  )

  it.each([
    null,
    {},
    { ...claims, exp: undefined },
    { ...claims, exp: '2000' },
    { ...claims, size: -1 },
    { ...claims, size: 1.5 },
    { ...claims, publicId: '' },
    { ...claims, replaceImageId: 42 },
  ])('rejects malformed authenticated claims %j', async payload => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    const token = await createUploadToken(payload as never, 'secret')
    await expect(verifyUploadToken(token, 'secret')).resolves.toBeNull()
  })
})
