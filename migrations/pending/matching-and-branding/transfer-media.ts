// NODE
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
// STORAGE
import { AwsClient } from 'aws4fetch'

type ObjectEntry = {
  bucket: string
  key: string
  sha256: string
  bytes: number
  httpMetadata: { contentType?: string; cacheControl?: string }
}

/** Check the immutable source manifest and read back each production object.
 * @param directory Private package containing media.json and objects/.
 * @param apply Create missing objects only when explicitly selected.
 * @returns Counts and a private, per-key verification receipt.
 */
async function transfer(directory: string, apply: boolean): Promise<void> {
  const { objects } = JSON.parse(
    await readFile(resolve(directory, 'media.json'), 'utf8'),
  ) as {
    objects: ObjectEntry[]
  }
  const account = process.env.CLOUDFLARE_ACCOUNT_ID
  const accessKeyId = process.env.R2_S3_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_S3_SECRET_ACCESS_KEY
  if (!account?.match(/^[a-f0-9]{32}$/) || !accessKeyId || !secretAccessKey)
    throw new Error('Production R2 read credentials are required')
  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: 's3',
    region: 'auto',
  })
  const receipt: Array<{ key: string; bucket: string; sha256: string; state: string }> =
    []
  const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
  // Refuse unrecognized namespaces, changed local bytes and conflicting production bytes before upload.
  async function check(entry: ObjectEntry): Promise<boolean> {
    const response = await client.fetch(url(entry))
    if (response.status === 404) {
      const body = await response.text()
      if (!body.includes('<Code>NoSuchKey</Code>'))
        throw new Error('Unexpected 404 for ' + entry.key)
      return false
    }
    if (!response.ok) throw new Error('R2 GET ' + response.status + ' for ' + entry.key)
    const data = new Uint8Array(await response.arrayBuffer())
    if (data.length !== entry.bytes || digest(data) !== entry.sha256)
      throw new Error('Conflicting production object ' + entry.key)
    return true
  }
  function url(entry: ObjectEntry): string {
    return (
      'https://' +
      account +
      '.r2.cloudflarestorage.com/' +
      entry.bucket +
      '/' +
      entry.key
    )
  }
  async function bytesFor(entry: ObjectEntry): Promise<Buffer> {
    const bytes = await readFile(resolve(directory, 'objects', entry.bucket, entry.key))
    if (bytes.length !== entry.bytes || digest(bytes) !== entry.sha256)
      throw new Error('Private object differs ' + entry.key)
    return bytes
  }
  // These namespaces use ASCII keys. Exhaust all pages before classifying an object as missing.
  const existing = new Set<string>()
  for (const [bucket, prefix] of [
    ['hype-assets-prod', 'identity-catalogue/'],
    ['hype-assets-raw-prod', 'premises-maps/'],
  ]) {
    const endpoint = new URL(
      'https://' + account + '.r2.cloudflarestorage.com/' + bucket,
    )
    endpoint.searchParams.set('list-type', '2')
    endpoint.searchParams.set('prefix', prefix!)
    for (;;) {
      const response = await client.fetch(endpoint)
      if (!response.ok) throw new Error('R2 inventory failed ' + response.status)
      const xml = await response.text()
      if (!xml.includes('<ListBucketResult') || !xml.includes('</ListBucketResult>'))
        throw new Error('Incomplete R2 inventory')
      for (const match of xml.matchAll(/<Key>([^<]+)<\/Key>/g))
        existing.add(bucket + '/' + match[1])
      if (xml.includes('<IsTruncated>false</IsTruncated>')) break
      const token = xml.match(
        /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/,
      )?.[1]
      if (!token) throw new Error('Missing R2 continuation token')
      endpoint.searchParams.set('continuation-token', token.replaceAll('&amp;', '&'))
    }
  }
  const missing: ObjectEntry[] = []
  const seen = new Set<string>()
  for (const entry of objects) {
    const valid =
      (entry.bucket === 'hype-assets-prod' &&
        /^identity-catalogue\/[a-f0-9-]{36}\.(png|svg)$/.test(entry.key)) ||
      (entry.bucket === 'hype-assets-raw-prod' &&
        /^premises-maps\/[a-z0-9-]+\/releases\/[a-f0-9]{64}\.json$/.test(entry.key))
    if (!valid || seen.has(entry.key))
      throw new Error('Invalid or duplicate key ' + entry.key)
    seen.add(entry.key)
    await bytesFor(entry)
    if (existing.has(entry.bucket + '/' + entry.key) && (await check(entry)))
      receipt.push({ ...pick(entry), state: 'verified' })
    else missing.push(entry)
  }
  for (const entry of missing) {
    if (apply) {
      const headers = new Headers({
        'If-None-Match': '*',
        'Content-Type': entry.httpMetadata.contentType ?? 'application/octet-stream',
      })
      if (entry.httpMetadata.cacheControl)
        headers.set('Cache-Control', entry.httpMetadata.cacheControl)
      const response = await client.fetch(url(entry), {
        method: 'PUT',
        headers,
        body: new Uint8Array(await bytesFor(entry)),
      })
      if (!response.ok && response.status !== 412)
        throw new Error('R2 PUT ' + response.status + ' for ' + entry.key)
      if (!(await check(entry))) throw new Error('Failed readback ' + entry.key)
    }
    receipt.push({ ...pick(entry), state: apply ? 'verified-after-create' : 'missing' })
  }
  await writeFile(
    resolve(
      directory,
      apply ? 'production-media-verified.json' : 'production-media-preflight.json',
    ),
    JSON.stringify(receipt, null, 2) + '\n',
    { mode: 0o600 },
  )
  console.log(
    JSON.stringify({
      total: objects.length,
      initiallyMissing: missing.length,
      verified: apply ? objects.length : objects.length - missing.length,
    }),
  )
}

function pick(entry: ObjectEntry) {
  return { key: entry.key, bucket: entry.bucket, sha256: entry.sha256 }
}

const [directory, flag, ...extra] = process.argv.slice(2)
if (!directory || (flag && flag !== '--apply-production') || extra.length)
  throw new Error('Usage: transfer-media.ts PRIVATE_PACKAGE [--apply-production]')
await transfer(directory, flag === '--apply-production')
