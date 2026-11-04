// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockVerifyUploadToken = vi.fn()

vi.mock('#lib/images/auth.js', () => ({
  verifyUploadToken: (...args: unknown[]) => mockVerifyUploadToken(...args),
}))

type BucketMock = {
  get: ReturnType<typeof vi.fn>
  put: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

const createBucketMock = (): BucketMock => ({
  get: vi.fn(async () => null),
  put: vi.fn(
    async (..._args: unknown[]): Promise<object | null> => ({ etag: 'created' }),
  ),
  delete: vi.fn(async () => undefined),
})

const createUploadRequest = (params?: {
  file?: File
  token?: string
  metadata?: string
}): Request => {
  const formData = new FormData()
  const file = params?.file ?? new File(['abc'], 'photo.jpg', { type: 'image/jpeg' })

  formData.set('file', file)
  formData.set('token', params?.token ?? 'upload-token')

  if (params?.metadata !== undefined) {
    formData.set('metadata', params.metadata)
  }

  return new Request('http://localhost/api/images/upload', {
    method: 'POST',
    body: formData,
  })
}

describe('api image upload route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('writes upload objects in a recoverable order', async () => {
    const bucket = createBucketMock()
    const file = new File(['abc'], 'photo.jpg', { type: 'image/jpeg' })

    mockVerifyUploadToken.mockResolvedValue({
      env: 'local',
      publicId: 'gallery/photo',
      contentType: file.type,
      size: file.size,
    })

    const { POST } = await import('../routes/api/images/upload/+server')
    const response = await POST({
      locals: {
        platform: {
          env: {
            AUTH_SECRET: 'secret',
            ASSET_RAW_DEV: bucket,
          },
        },
      },
      request: createUploadRequest({
        file,
        metadata: JSON.stringify({ credit: 'Photographer' }),
      }),
    } as never)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      cdn: 'cloudflareR2',
      env: 'local',
      publicId: 'gallery/photo',
    })
    expect(bucket.put.mock.calls.map(([key]) => key)).toEqual([
      'gallery/photo',
      expect.stringMatching(/^gallery\/photo\.v\d+\.json$/),
      'gallery/photo.json',
      'gallery/photo.manifest.json',
    ])
    expect(bucket.delete).not.toHaveBeenCalled()
  })

  it('rejects invalid metadata payloads before writing to storage', async () => {
    const bucket = createBucketMock()
    const file = new File(['abc'], 'photo.jpg', { type: 'image/jpeg' })

    mockVerifyUploadToken.mockResolvedValue({
      env: 'local',
      publicId: 'gallery/photo',
      contentType: file.type,
      size: file.size,
    })

    const { POST } = await import('../routes/api/images/upload/+server')

    await expect(
      POST({
        locals: {
          platform: {
            env: {
              AUTH_SECRET: 'secret',
              ASSET_RAW_DEV: bucket,
            },
          },
        },
        request: createUploadRequest({
          file,
          metadata: '{invalid',
        }),
      } as never),
    ).rejects.toMatchObject({
      status: 400,
      body: {
        message: 'Invalid metadata payload',
      },
    })

    expect(bucket.put).not.toHaveBeenCalled()
    expect(bucket.delete).not.toHaveBeenCalled()
  })

  it('retains earlier writes when a later put fails so concurrent confirmation stays valid', async () => {
    const bucket = createBucketMock()
    const file = new File(['abc'], 'photo.jpg', { type: 'image/jpeg' })

    mockVerifyUploadToken.mockResolvedValue({
      env: 'local',
      publicId: 'gallery/photo',
      contentType: file.type,
      size: file.size,
    })

    bucket.put
      .mockResolvedValueOnce({ etag: 'created' })
      .mockResolvedValueOnce({ etag: 'created' })
      .mockRejectedValueOnce(new Error('quota exceeded'))

    const { POST } = await import('../routes/api/images/upload/+server')

    await expect(
      POST({
        locals: {
          platform: {
            env: {
              AUTH_SECRET: 'secret',
              ASSET_RAW_DEV: bucket,
            },
          },
        },
        request: createUploadRequest({ file }),
      } as never),
    ).rejects.toMatchObject({
      status: 500,
      body: {
        message: 'Failed to persist uploaded image',
      },
    })

    expect(bucket.delete).not.toHaveBeenCalled()
    expect(bucket.put).toHaveBeenCalledTimes(3)
  })

  it.each([undefined, 'img-1'])(
    'rejects reused original destinations without writing sidecars (%s)',
    async replaceImageId => {
      const bucket = createBucketMock()
      bucket.put.mockResolvedValueOnce(null)
      mockVerifyUploadToken.mockResolvedValue({
        env: 'local',
        publicId: 'gallery/photo',
        replaceImageId,
        contentType: 'image/jpeg',
        size: 3,
      })
      const { POST } = await import('../routes/api/images/upload/+server')
      await expect(
        POST({
          locals: {
            platform: { env: { AUTH_SECRET: 'secret', ASSET_RAW_DEV: bucket } },
          },
          request: createUploadRequest(),
        } as never),
      ).rejects.toMatchObject({ status: 412 })
      expect(bucket.put).toHaveBeenCalledTimes(1)
      expect(bucket.put).toHaveBeenCalledWith(
        'gallery/photo',
        expect.any(ArrayBuffer),
        {
          onlyIf: { etagDoesNotMatch: '*' },
          httpMetadata: { contentType: 'image/jpeg' },
        },
      )
      expect(bucket.delete).not.toHaveBeenCalled()
    },
  )

  it('retains the original and stops when an existing sidecar wins the conditional write', async () => {
    const bucket = createBucketMock()
    bucket.put.mockResolvedValueOnce({ etag: 'original' }).mockResolvedValueOnce(null)
    mockVerifyUploadToken.mockResolvedValue({
      env: 'local',
      publicId: 'gallery/photo',
      contentType: 'image/jpeg',
      size: 3,
    })
    const { POST } = await import('../routes/api/images/upload/+server')
    await expect(
      POST({
        locals: { platform: { env: { AUTH_SECRET: 'secret', ASSET_RAW_DEV: bucket } } },
        request: createUploadRequest(),
      } as never),
    ).rejects.toMatchObject({ status: 412 })
    expect(bucket.put).toHaveBeenCalledTimes(2)
    expect(bucket.put.mock.calls[1][2]).toMatchObject({
      onlyIf: { etagDoesNotMatch: '*' },
    })
    expect(bucket.delete).not.toHaveBeenCalled()
  })

  it('allows only one concurrent upload and preserves its original and sidecars', async () => {
    const bucket = createBucketMock()
    const stored = new Map<string, unknown>()
    bucket.put.mockImplementation(async (...args: unknown[]) => {
      const [key, body, options] = args as [
        string,
        unknown,
        { onlyIf?: { etagDoesNotMatch?: string } },
      ]
      if (stored.has(key) && options.onlyIf?.etagDoesNotMatch === '*') return null
      stored.set(key, body)
      return { etag: 'created' }
    })
    mockVerifyUploadToken.mockResolvedValue({
      env: 'local',
      publicId: 'gallery/photo',
      contentType: 'image/jpeg',
      size: 3,
    })
    const { POST } = await import('../routes/api/images/upload/+server')
    const upload = (bytes: string) =>
      POST({
        locals: { platform: { env: { AUTH_SECRET: 'secret', ASSET_RAW_DEV: bucket } } },
        request: createUploadRequest({
          file: new File([bytes], 'photo.jpg', { type: 'image/jpeg' }),
        }),
      } as never)
    const results = await Promise.allSettled([upload('abc'), upload('xyz')])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toEqual([
      expect.objectContaining({ reason: expect.objectContaining({ status: 412 }) }),
    ])
    const original = stored.get('gallery/photo')
    await expect(upload('123')).rejects.toMatchObject({ status: 412 })
    expect(stored.get('gallery/photo')).toBe(original)
    expect(stored.size).toBe(4)
    expect(bucket.delete).not.toHaveBeenCalled()
  })
})
