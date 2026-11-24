// NODE
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
// STORAGE
import { AwsClient } from 'aws4fetch'
import manifest from './media-manifest.json'

/** Stage and verify only the pinned Revealing Arrow recording objects.
 * @param stage Allow create-only uploads of verified local bytes.
 * @returns A receipt of object keys, byte sizes and SHA-256 digests after remote readback.
 */
export async function verifyRecordingMedia(stage: boolean) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID
  const config = Bun.TOML.parse(readFileSync('wrangler.toml', 'utf8'))
  const accessKeyId = process.env.R2_S3_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_S3_SECRET_ACCESS_KEY
  if (!account || config.account_id !== account || !accessKeyId || !secretAccessKey)
    throw new Error('Production R2 credentials and matching account required')
  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: 's3',
    region: 'auto',
  })
  const receipt = []
  for (const item of manifest) {
    if (
      item.bucket !== 'hype-assets-raw-prod' ||
      !item.storageKey.startsWith('h/features/rx81h67xsLkz/') ||
      !/^[a-f0-9]{64}$/.test(item.sha256) ||
      item.source !== '.local/revealing-arrow/media/' + item.sha256
    )
      throw new Error('Unexpected recording manifest entry')
    const url =
      'https://' +
      account +
      '.r2.cloudflarestorage.com/' +
      item.bucket +
      '/' +
      item.storageKey.split('/').map(encodeURIComponent).join('/')
    const check = (bytes: Uint8Array) => {
      if (
        bytes.length !== item.byteSize ||
        createHash('sha256').update(bytes).digest('hex') !== item.sha256
      )
        throw new Error('Recording bytes differ at ' + item.storageKey)
    }
    let response = await client.fetch(url, { signal: AbortSignal.timeout(60000) })
    if (response.status === 404 && stage) {
      const bytes = readFileSync(item.source)
      check(bytes)
      const put = await client.fetch(url, {
        method: 'PUT',
        headers: { 'If-None-Match': '*', 'Content-Type': item.mediaType },
        body: new Uint8Array(bytes),
        signal: AbortSignal.timeout(60000),
      })
      if (!put.ok && put.status !== 412)
        throw new Error('Recording upload failed: ' + put.status)
      response = await client.fetch(url, { signal: AbortSignal.timeout(60000) })
    }
    if (!response.ok)
      throw new Error(
        'Recording readback failed: ' + response.status + ' ' + item.storageKey,
      )
    check(new Uint8Array(await response.arrayBuffer()))
    receipt.push({ key: item.storageKey, sha256: item.sha256, bytes: item.byteSize })
  }
  return receipt
}

if (import.meta.main) {
  const mode = process.argv.slice(2)
  if (mode.length !== 1 || !['--verify', '--stage'].includes(mode[0]!))
    throw new Error('Choose --verify or --stage')
  console.log(JSON.stringify(await verifyRecordingMedia(mode[0] === '--stage')))
}
