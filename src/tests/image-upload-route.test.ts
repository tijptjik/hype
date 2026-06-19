// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockVerifyUploadToken = vi.fn()

vi.mock('$lib/images/auth', () => ({
  verifyUploadToken: (...args: unknown[]) => mockVerifyUploadToken(...args),
}))

type BucketMock = {
  get: ReturnType<typeof vi.fn>
  put: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

const createBucketMock = (): BucketMock => ({
  get: vi.fn(async () => null),
  put: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
})

const createR2ObjectBodyMock = (params: {
  body: ArrayBuffer
  httpMetadata?: R2HTTPMetadata
  customMetadata?: Record<string, string>
}): R2ObjectBody =>
  ({
    arrayBuffer: vi.fn(async () => params.body),
    httpMetadata: params.httpMetadata,
    customMetadata: params.customMetadata,
  }) as unknown as R2ObjectBody

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
      request: createUploadRequest({
        file,
        metadata: JSON.stringify({ credit: 'Photographer' }),
      }),
      platform: {
        env: {
          AUTH_SECRET: 'secret',
          ASSET_RAW_DEV: bucket,
        },
      },
    } as never)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      cdn: 'cloudflareR2',
      env: 'local',
      publicId: 'gallery/photo',
    })
    expect(bucket.put.mock.calls.map(([key]) => key)).toEqual([
      expect.stringMatching(/^gallery\/photo\.v\d+\.json$/),
      'gallery/photo',
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
        request: createUploadRequest({
          file,
          metadata: '{invalid',
        }),
        platform: {
          env: {
            AUTH_SECRET: 'secret',
            ASSET_RAW_DEV: bucket,
          },
        },
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

  it('rolls back earlier writes when a later put fails', async () => {
    const bucket = createBucketMock()
    const file = new File(['abc'], 'photo.jpg', { type: 'image/jpeg' })

    mockVerifyUploadToken.mockResolvedValue({
      env: 'local',
      publicId: 'gallery/photo',
      contentType: file.type,
      size: file.size,
    })

    bucket.put
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('quota exceeded'))

    const { POST } = await import('../routes/api/images/upload/+server')

    await expect(
      POST({
        request: createUploadRequest({ file }),
        platform: {
          env: {
            AUTH_SECRET: 'secret',
            ASSET_RAW_DEV: bucket,
          },
        },
      } as never),
    ).rejects.toMatchObject({
      status: 500,
      body: {
        message: 'Failed to persist uploaded image',
      },
    })

    expect(bucket.delete).toHaveBeenCalledWith([
      expect.stringMatching(/^gallery\/photo\.v\d+\.json$/),
      'gallery/photo',
    ])
  })

  it('restores pre-existing replacement objects when a later put fails', async () => {
    const bucket = createBucketMock()
    const file = new File(['abc'], 'photo.jpg', { type: 'image/jpeg' })
    const previousOriginal = new ArrayBuffer(3)

    mockVerifyUploadToken.mockResolvedValue({
      env: 'local',
      publicId: 'gallery/photo',
      replaceImageId: 'img-1',
      contentType: file.type,
      size: file.size,
    })

    bucket.get.mockImplementation(async (key: string) => {
      if (key === 'gallery/photo') {
        return createR2ObjectBodyMock({
          body: previousOriginal,
          httpMetadata: { contentType: 'image/jpeg' },
          customMetadata: { source: 'previous' },
        })
      }

      return null
    })
    bucket.put
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('metadata write failed'))
      .mockResolvedValueOnce(undefined)

    const { POST } = await import('../routes/api/images/upload/+server')

    await expect(
      POST({
        request: createUploadRequest({ file }),
        platform: {
          env: {
            AUTH_SECRET: 'secret',
            ASSET_RAW_DEV: bucket,
          },
        },
      } as never),
    ).rejects.toMatchObject({
      status: 500,
      body: {
        message: 'Failed to persist uploaded image',
      },
    })

    expect(bucket.delete).toHaveBeenCalledWith([
      expect.stringMatching(/^gallery\/photo\.v\d+\.json$/),
    ])
    expect(bucket.put).toHaveBeenLastCalledWith('gallery/photo', previousOriginal, {
      httpMetadata: { contentType: 'image/jpeg' },
      customMetadata: { source: 'previous' },
    })
  })
})
