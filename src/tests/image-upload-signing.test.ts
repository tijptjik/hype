// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { AwsClient } from 'aws4fetch'
import { createPresignedR2UploadUrl, putR2ObjectViaApi } from '#lib/images/storage.js'

const credentials = {
  accessKeyId: 'test-access-key',
  secretAccessKey: 'test-secret-key',
}

describe('direct image upload signature', () => {
  it('cryptographically binds the create-only condition to the URL', async () => {
    const url = new URL(
      await createPresignedR2UploadUrl({
        ...credentials,
        accountId: 'test-account',
        bucket: 'test-bucket',
        objectKey: 'images/test-image',
        expiresInSeconds: 300,
      }),
    )
    expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toContain(
      'if-none-match',
    )
    const signature = url.searchParams.get('X-Amz-Signature')
    const unsigned = new URL(url)
    unsigned.searchParams.delete('X-Amz-Signature')
    const client = new AwsClient({ ...credentials, service: 's3', region: 'auto' })
    const sign = async (condition?: string): Promise<string | null> => {
      const request = await client.sign(unsigned.toString(), {
        method: 'PUT',
        headers: {
          'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
          ...(condition === undefined ? {} : { 'if-none-match': condition }),
        },
        aws: { signQuery: true },
      })
      return new URL(request.url).searchParams.get('X-Amz-Signature')
    }
    expect(await sign('*')).toBe(signature)
    expect(await sign()).not.toBe(signature)
    expect(await sign('different-etag')).not.toBe(signature)
  })
})

describe('conditional R2 API writes', () => {
  it('signs the condition and returns a collision without overwriting', async () => {
    let capturedHeaders: Headers | undefined
    const fetchFn = (async (_url: unknown, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers)
      return new Response(null, { status: 412 })
    }) as typeof fetch
    expect(
      await putR2ObjectViaApi({
        ...credentials,
        accountId: 'test-account',
        bucket: 'test-bucket',
        objectKey: 'metadata.json',
        body: '{}',
        contentType: 'application/json',
        createOnly: true,
        fetchFn,
      }),
    ).toBe(false)
    expect(capturedHeaders?.get('if-none-match')).toBe('*')
    expect(capturedHeaders?.get('authorization')).toContain('if-none-match')
    await expect(
      putR2ObjectViaApi({
        ...credentials,
        accountId: 'test-account',
        bucket: 'test-bucket',
        objectKey: 'metadata.json',
        body: '{}',
        contentType: 'application/json',
        fetchFn,
      }),
    ).rejects.toThrow('412')
  })
})
