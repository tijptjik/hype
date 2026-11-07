// RUNTIME
import { Database } from 'bun:sqlite'
import { AwsClient } from 'aws4fetch'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
// SCOPE
import { scopedMediaRows, validateMediaScope } from './media-scope'
import { retainedMetadata } from './retained-media'
import type { RetainedMetadata } from './retained-media'
// TYPES
import type { LegacyMediaOptions } from './media-scope'
import type { ImageMetadataRecovery } from '../../src/lib/db/services/imageRevisionBaseline'
// VALIDATION
import { ImageMetadataFullSchema } from '../../src/lib/db/zod/schema/image'

export type MediaLocator = {
  id: string
  cdn: string
  env: string
  publicId: string
  version: number | null
  modifiedAt: string
  contentHash: string | null
}
export type MediaEvidence = {
  locator: MediaLocator
  status: 'verified' | 'blocked'
  reason?: string
  metadataRecovery?: ImageMetadataRecovery
  retainedImageRevisionId?: string
  contentHash?: string
  metadataHash?: string
  mediaType?: string
  byteSize?: number
}

/** Content-addresses the captured locator, including its mutation fence.
 * @param row Exact image row. @returns Safe local cache basename.
 */
export function mediaCacheKey(row: MediaLocator): string {
  return createHash('sha256').update(JSON.stringify(row)).digest('hex')
}

/** Reads a sidecar, permitting an explicitly authorized empty baseline only on HTTP 404.
 * @param response Exact versioned sidecar response. @param version Referenced positive version.
 * @param reason Optional scoped user authorization. @returns Bytes and explicit recovery provenance.
 */
export async function readMetadataEvidence(
  response: Response,
  version: number,
  reason?: string,
): Promise<{
  bytes: Uint8Array
  recovery?: ImageMetadataRecovery
}> {
  if (response.status === 404 && reason?.trim())
    return {
      bytes: new TextEncoder().encode('{}'),
      recovery: { kind: 'empty-missing-sidecar', missingVersion: version, reason },
    }
  if (!response.ok) throw new Error(`Exact metadata HTTP ${response.status}`)
  return { bytes: new Uint8Array(await response.arrayBuffer()) }
}

/** Downloads exact originals and versioned sidecars without remote mutations or implicit metadata fallback.
 * @param database Explicit source snapshot. @param directory Private resumable evidence directory.
 * @param options Explicit Feature scope and optional empty-sidecar recovery reason.
 * @returns Aggregate verification counts; individual failures remain in the receipt.
 * @remarks Credentials come from the caller environment. Missing or ambiguous evidence fails closed unless scoped empty-sidecar recovery is explicitly requested.
 */
export async function cacheRevisionMedia(
  database: string,
  directory: string,
  options: LegacyMediaOptions = {},
): Promise<{ verified: number; blocked: number }> {
  process.umask(0o077)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const db = new Database(database, { readonly: true })
  let rows: MediaLocator[]
  const retained = new Map<string, RetainedMetadata>()
  try {
    validateMediaScope(db, options)
    rows = scopedMediaRows(db, options.featureIds, options.baselineOnly)
    for (const row of rows) {
      const evidence = retainedMetadata(db, row)
      if (evidence) retained.set(row.id, evidence)
    }
  } finally {
    db.close()
  }
  for (const name of [
    'R2_S3_ACCESS_KEY_ID',
    'R2_S3_SECRET_ACCESS_KEY',
    'CLOUDFLARE_ACCOUNT_ID',
  ])
    if (!process.env[name]) throw new Error(`Missing ${name}`)
  const client = new AwsClient({
    accessKeyId: process.env.R2_S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_S3_SECRET_ACCESS_KEY!,
    service: 's3',
    region: 'auto',
  })
  const buckets: Record<string, string> = {
    local: 'hype-assets-raw-dev',
    preview: 'hype-assets-raw-preview',
    production: 'hype-assets-raw-prod',
  }
  const evidence: MediaEvidence[] = []
  let cursor = 0
  // A bounded worker pool keeps downloads resumable without flooding object storage.
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (cursor < rows.length) {
        const row = rows[cursor++],
          base = join(directory, mediaCacheKey(row))
        let result: MediaEvidence = { locator: row, status: 'blocked' }
        try {
          if (existsSync(base + '.receipt.json')) {
            const prior = JSON.parse(
              readFileSync(base + '.receipt.json', 'utf8'),
            ) as MediaEvidence
            if (
              prior.status === 'verified' &&
              (!prior.retainedImageRevisionId ||
                prior.retainedImageRevisionId ===
                  retained.get(row.id)?.imageRevisionId) &&
              JSON.stringify(prior.locator) === JSON.stringify(row) &&
              (!prior.metadataRecovery ||
                prior.metadataRecovery.reason === options.emptyMetadataReason) &&
              existsSync(base + '.image') &&
              existsSync(base + '.json')
            ) {
              const bytes = readFileSync(base + '.image'),
                metadata = readFileSync(base + '.json')
              if (
                createHash('sha256').update(bytes).digest('hex') ===
                  prior.contentHash &&
                createHash('sha256').update(metadata).digest('hex') ===
                  prior.metadataHash &&
                (!prior.retainedImageRevisionId ||
                  (metadata.toString() === retained.get(row.id)?.metadata &&
                    prior.contentHash === retained.get(row.id)?.contentHash))
              ) {
                evidence.push(prior)
                continue
              }
            }
          }
          if (
            row.cdn !== 'cloudflareR2' ||
            !buckets[row.env] ||
            !Number.isSafeInteger(row.version) ||
            (row.version ?? 0) < 1
          )
            throw new Error('Unsupported or incomplete exact locator')
          const url = (key: string): string =>
            `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com/${buckets[row.env]}/${key.split('/').map(encodeURIComponent).join('/')}`
          const metadataResponse = await client.fetch(
            url(`${row.publicId}.v${row.version}.json`),
            { method: 'GET', signal: AbortSignal.timeout(60000) },
          )
          // Exact immutable database evidence can replace a missing sidecar, never a failed authorization response.
          const source =
            metadataResponse.status === 404 ? retained.get(row.id) : undefined
          const { bytes: metadataBytes, recovery } = source
            ? { bytes: new TextEncoder().encode(source.metadata), recovery: undefined }
            : await readMetadataEvidence(
                metadataResponse,
                row.version!,
                options.emptyMetadataReason,
              )
          const metadata = ImageMetadataFullSchema.parse(
            JSON.parse(new TextDecoder().decode(metadataBytes)),
          )
          const original = await client.fetch(url(row.publicId), {
            method: 'GET',
            signal: AbortSignal.timeout(60000),
          })
          if (!original.ok) throw new Error(`Original HTTP ${original.status}`)
          const bytes = new Uint8Array(await original.arrayBuffer()),
            mediaType = original.headers.get('content-type')?.split(';')[0] ?? ''
          if (!bytes.length || !/^image\/(jpeg|png|webp|avif|gif)$/.test(mediaType))
            throw new Error('Unsupported original media')
          const contentHash = createHash('sha256').update(bytes).digest('hex')
          if (
            [row.contentHash, metadata.contentHash, source?.contentHash].some(
              hash => hash && hash.toLowerCase() !== contentHash,
            )
          )
            throw new Error('Recorded hash differs from original bytes')
          writeFileSync(base + '.image', bytes, { mode: 0o600 })
          writeFileSync(base + '.json', metadataBytes, { mode: 0o600 })
          result = {
            locator: row,
            status: 'verified',
            ...(recovery ? { metadataRecovery: recovery } : {}),
            ...(source ? { retainedImageRevisionId: source.imageRevisionId } : {}),
            contentHash,
            metadataHash: createHash('sha256').update(metadataBytes).digest('hex'),
            mediaType,
            byteSize: bytes.length,
          }
        } catch (error) {
          // Error text contains no credentials, request signatures or remote response bodies.
          result.reason =
            error instanceof Error
              ? error.message.replace(/https:\/\/\S+/g, '[remote object]')
              : 'Media read failed'
        }
        writeFileSync(base + '.receipt.json', JSON.stringify(result, null, 2) + '\n', {
          mode: 0o600,
        })
        evidence.push(result)
        if (evidence.length % 100 === 0)
          console.log(JSON.stringify({ checked: evidence.length, total: rows.length }))
      }
    }),
  )
  evidence.sort((a, b) => a.locator.id.localeCompare(b.locator.id))
  const counts = {
    verified: evidence.filter(row => row.status === 'verified').length,
    blocked: evidence.filter(row => row.status === 'blocked').length,
  }
  writeFileSync(
    join(directory, 'receipt.json'),
    JSON.stringify({ database: resolve(database), ...counts, evidence }, null, 2) +
      '\n',
    { mode: 0o600 },
  )
  return counts
}

if (import.meta.main) {
  const [database, directory] = process.argv.slice(2)
  if (!database || !directory)
    throw new Error('Usage: cache-media.ts DATABASE CACHE_DIRECTORY')
  console.log(JSON.stringify(await cacheRevisionMedia(database, directory)))
}
