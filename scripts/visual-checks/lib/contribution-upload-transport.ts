// NODE
import { createHash } from 'node:crypto'
// STORAGE
import { AwsClient } from 'aws4fetch'
// TYPES
import type { Page } from 'playwright'

interface LocalBucket {
  put(
    key: string,
    bytes: Uint8Array,
    options: { httpMetadata: { contentType?: string } },
  ): Promise<unknown>
  head(key: string): Promise<unknown>
}
interface TestObject {
  key: string
  url: string
  sha256: string
  size: number
  verified: boolean
  deleted: boolean
}

/** Configure a bounded upload test with opt-in remote writes and exact-object cleanup.
 * @param options Transport, disposable local bucket and receipt directory.
 * @returns Browser route installation, verification and cleanup operations.
 * @remarks Remote mode permits only create-only writes to the development bucket.
 * Signed URLs and credentials never enter receipts. Remote cleanup checks the bytes first.
 */
export function createContributionUploadTransport(options: {
  mode: 'local' | 'remote'
  bucket: LocalBucket
  artifacts: string
}) {
  const remote = options.mode === 'remote'
  const objects = new Map<string, TestObject>()
  let failure: unknown
  let localPuts = 0
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const accessKeyId = process.env.R2_S3_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_S3_SECRET_ACCESS_KEY
  if (remote && (!accountId || !accessKeyId || !secretAccessKey))
    throw Error('Remote transport requires the existing R2 API environment')
  const client = remote
    ? new AwsClient({
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
        service: 's3',
        region: 'auto',
      })
    : null
  const receipt = () => ({
    transport: options.mode,
    localOnlyPuts: localPuts,
    remoteWrites: remote && objects.size > 0,
    objects: [...objects.values()],
  })
  const save = () =>
    Bun.write(options.artifacts + '/transport.json', JSON.stringify(receipt(), null, 2))

  /** Read back the exact uploaded bytes before recording success or deleting a test object.
   * @param object Object created by this invocation. @returns Nothing on a matching hash.
   */
  async function verifyObject(object: TestObject): Promise<void> {
    const response = await client!.fetch(object.url)
    if (!response.ok) throw Error(`Test object read failed (${response.status})`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (
      bytes.byteLength !== object.size ||
      createHash('sha256').update(bytes).digest('hex') !== object.sha256
    )
      throw Error(
        'Remote test object differs from the browser upload; leaving it untouched',
      )
    object.verified = true
    await save()
  }

  return {
    /** Intercept only storage requests; remote PUTs retain normal browser CORS enforcement.
     * @param page Dedicated contribution browser page. @returns Route installation completion.
     */
    async install(page: Page): Promise<void> {
      await page.route('https://*.r2.cloudflarestorage.com/**', async route => {
        try {
          const request = route.request()
          const url = new URL(request.url())
          if (['GET', 'HEAD'].includes(request.method())) return await route.continue()
          if (request.method() === 'OPTIONS') {
            if (remote) return await route.continue()
            return await route.fulfill({
              status: 204,
              headers: {
                'access-control-allow-origin': '*',
                'access-control-allow-methods': 'PUT',
                'access-control-allow-headers': '*',
              },
            })
          }
          const prefix = '/hype-assets-raw-dev/'
          if (request.method() !== 'PUT' || !url.pathname.startsWith(prefix))
            throw Error('Unexpected storage write blocked')
          const bytes = request.postDataBuffer()
          if (!bytes) throw Error('Missing upload bytes')
          const key = decodeURIComponent(url.pathname.slice(prefix.length))
          if (remote) {
            if (
              url.hostname !== `${accountId}.r2.cloudflarestorage.com` ||
              request.headers()['if-none-match'] !== '*'
            )
              throw Error(
                'Remote test requires the configured account and create-only upload',
              )
            if (objects.has(key)) throw Error('Unexpected repeated test upload')
            const unsignedUrl = url.origin + url.pathname
            const prior = await client!.fetch(unsignedUrl, { method: 'HEAD' })
            if (prior.status !== 404 || (await options.bucket.head(key)))
              throw Error('Test key must be absent in remote and local storage')
            objects.set(key, {
              key,
              url: unsignedUrl,
              sha256: createHash('sha256').update(bytes).digest('hex'),
              size: bytes.length,
              verified: false,
              deleted: false,
            })
            await save()
            return await route.continue()
          }
          await options.bucket.put(key, bytes, {
            httpMetadata: { contentType: request.headers()['content-type'] },
          })
          localPuts++
          await route.fulfill({
            status: 200,
            headers: { 'access-control-allow-origin': '*' },
          })
        } catch (cause) {
          failure = cause
          await route.abort('failed')
        }
      })
    },
    /** Verify one uploaded original and prove remote mode did not inject a local copy.
     * @returns Transport evidence without signed URLs or credentials.
     */
    async verify() {
      if (failure) throw failure
      if (remote) {
        if (objects.size !== 1) throw Error('Expected one remote original upload')
        for (const object of objects.values()) {
          await verifyObject(object)
          if (await options.bucket.head(object.key))
            throw Error('Remote upload unexpectedly has a local original copy')
        }
      } else if (localPuts !== 1) throw Error('Expected one local original upload')
      await save()
      return receipt()
    },
    /** Remove only originals created by this remote test after a fresh content-hash check.
     * @returns Completion after remote absence is verified.
     */
    async cleanup(): Promise<void> {
      if (!remote) return
      for (const object of objects.values()) {
        const before = await client!.fetch(object.url, { method: 'HEAD' })
        if (before.status === 404) {
          object.deleted = true
          continue
        }
        if (!before.ok) throw Error(`Test cleanup head failed (${before.status})`)
        await verifyObject(object)
        const removed = await client!.fetch(object.url, { method: 'DELETE' })
        if (!removed.ok) throw Error(`Test cleanup failed (${removed.status})`)
        const after = await client!.fetch(object.url, { method: 'HEAD' })
        if (after.status !== 404)
          throw Error('Remote test object still exists after cleanup')
        object.deleted = true
      }
      await save()
    },
  }
}
