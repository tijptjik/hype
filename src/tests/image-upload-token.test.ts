// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUploadToken, verifyUploadToken } from '#lib/images/auth.js'

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

  it('authenticates the complete resource snapshot', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    const payload = {
      ...claims,
      ctxType: 'project',
      resourceSnapshot: {
        imageId: null,
        modifiedAt: '2026-01-01T00:00:00.000Z',
        organisationId: 'org',
        hubId: null,
      },
    }
    const token = await createUploadToken(payload, 'secret')
    await expect(verifyUploadToken(token, 'secret')).resolves.toEqual(payload)
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
    { ...claims, resourceSnapshot: null },
    { ...claims, resourceSnapshot: {} },
    {
      ...claims,
      resourceSnapshot: {
        imageId: null,
        modifiedAt: 'revision',
        organisationId: 42,
        hubId: null,
      },
    },
    {
      ...claims,
      resourceSnapshot: {
        imageId: null,
        modifiedAt: '',
        organisationId: null,
        hubId: null,
      },
    },
  ])('rejects malformed authenticated claims %j', async payload => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    const token = await createUploadToken(payload as never, 'secret')
    await expect(verifyUploadToken(token, 'secret')).resolves.toBeNull()
  })
  it('requires a matching signed replacement snapshot and source identity', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    const replacementSnapshot = {
      imageId: 'image',
      imageRevision: 'revision',
      assignmentRevision: 'assignment',
      scope: 'scope',
      source: { publicId: 'old-key', env: 'local', version: 123 },
    }
    const payload = { ...claims, replaceImageId: 'image', replacementSnapshot }
    await expect(
      verifyUploadToken(await createUploadToken(payload, 'secret'), 'secret'),
    ).resolves.toEqual(payload)
    await expect(
      verifyUploadToken(
        await createUploadToken({ ...payload, publicId: 'old-key' }, 'secret'),
        'secret',
      ),
    ).resolves.toBeNull()
    for (const altered of [
      undefined,
      {},
      { ...replacementSnapshot, imageId: 'different' },
      { ...replacementSnapshot, assignmentRevision: undefined },
      { ...replacementSnapshot, assignmentRevision: 42 },
      { ...replacementSnapshot, source: undefined },
      { ...replacementSnapshot, source: { publicId: '', env: 'local', version: 123 } },
    ]) {
      await expect(
        verifyUploadToken(
          await createUploadToken(
            { ...payload, replacementSnapshot: altered } as never,
            'secret',
          ),
          'secret',
        ),
      ).resolves.toBeNull()
    }
  })
})
