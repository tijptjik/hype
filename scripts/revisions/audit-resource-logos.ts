// RUNTIME
import { Database } from 'bun:sqlite'
import { AwsClient } from 'aws4fetch'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
// VALIDATION
import { ImageMetadataFullSchema } from '../../src/lib/db/zod/schema/image'
import { mediaCacheKey } from './cache-media'
import type { MediaLocator } from './cache-media'

type LogoOwner = { resource: string; id: string; code: string; imageId: string }
type LogoAuditEvidence = {
  locator: MediaLocator
  owners: LogoOwner[]
  status: 'blocked' | 'verified'
  originalStatus?: number
  metadataStatus?: number
  contentHash?: string
  byteSize?: number
  mediaType?: string
  metadataHash?: string
  reason?: string
}
type LogoAuditReceipt = {
  database: string
  checked: number
  verified: number
  blocked: number
  remoteWrites: false
  evidence: LogoAuditEvidence[]
}

/** Audits current resource logos against exact storage objects, without remote writes or metadata recovery.
 * @param database Consistent local database snapshot.
 * @param directory Private evidence directory.
 * @returns Per-image evidence, including missing original and metadata status independently.
 */
export async function auditResourceLogos(
  database: string,
  directory: string,
): Promise<LogoAuditReceipt> {
  process.umask(0o077)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const db = new Database(database, { readonly: true })
  const owners = db
    .query(
      `SELECT 'organisation' resource,id,code,imageId FROM organisation WHERE imageId IS NOT NULL
    UNION ALL SELECT 'project',id,code,imageId FROM project WHERE imageId IS NOT NULL
    UNION ALL SELECT 'hub',id,code,imageId FROM hub WHERE imageId IS NOT NULL`,
    )
    .all() as LogoOwner[]
  const rows = db
    .query(
      `SELECT id,cdn,env,publicId,version,modifiedAt,contentHash FROM image WHERE id IN (
    SELECT imageId FROM organisation UNION SELECT imageId FROM project UNION SELECT imageId FROM hub) ORDER BY id`,
    )
    .all() as MediaLocator[]
  db.close()
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
  const results: LogoAuditEvidence[] = []
  for (const locator of rows) {
    const base = join(directory, mediaCacheKey(locator))
    const result: LogoAuditEvidence = {
      locator,
      owners: owners.filter(o => o.imageId === locator.id),
      status: 'blocked',
    }
    try {
      if (
        locator.cdn !== 'cloudflareR2' ||
        !buckets[locator.env] ||
        !Number.isSafeInteger(locator.version) ||
        Number(locator.version) < 1
      )
        throw new Error('Incomplete exact image locator')
      const url = (key: string) =>
        `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com/${buckets[locator.env]}/${key.split('/').map(encodeURIComponent).join('/')}`
      const [original, sidecar] = await Promise.all([
        client.fetch(url(locator.publicId), {
          method: 'GET',
          signal: AbortSignal.timeout(25000),
        }),
        client.fetch(url(`${locator.publicId}.v${locator.version}.json`), {
          method: 'GET',
          signal: AbortSignal.timeout(25000),
        }),
      ])
      result.originalStatus = original.status
      result.metadataStatus = sidecar.status
      if (original.ok) {
        const bytes = new Uint8Array(await original.arrayBuffer())
        result.contentHash = createHash('sha256').update(bytes).digest('hex')
        result.byteSize = bytes.length
        result.mediaType = original.headers.get('content-type')?.split(';')[0] ?? ''
        writeFileSync(base + '.image', bytes)
      }
      if (sidecar.ok) {
        const bytes = new Uint8Array(await sidecar.arrayBuffer())
        result.metadataHash = createHash('sha256').update(bytes).digest('hex')
        writeFileSync(base + '.json', bytes)
        const metadata = ImageMetadataFullSchema.parse(
          JSON.parse(new TextDecoder().decode(bytes)),
        )
        if (
          [locator.contentHash, metadata.contentHash].some(
            hash => hash && hash.toLowerCase() !== result.contentHash,
          )
        )
          throw new Error('Original bytes conflict with recorded hash')
      }
      if (!original.ok) throw new Error(`Original HTTP ${original.status}`)
      if (!sidecar.ok) throw new Error(`Exact metadata HTTP ${sidecar.status}`)
      if (
        !result.byteSize ||
        !/^image\/(png|jpeg|webp|avif|gif)$/.test(result.mediaType ?? '')
      )
        throw new Error('Unsupported original image')
      result.status = 'verified'
    } catch (cause) {
      result.reason =
        cause instanceof Error
          ? cause.message.replace(/https:\/\/\S+/g, '[storage URL]')
          : 'Audit failed'
    }
    writeFileSync(base + '.receipt.json', JSON.stringify(result, null, 2) + '\n')
    results.push(result)
  }
  const receipt: LogoAuditReceipt = {
    database,
    checked: results.length,
    verified: results.filter(r => r.status === 'verified').length,
    blocked: results.filter(r => r.status !== 'verified').length,
    remoteWrites: false,
    evidence: results,
  }
  writeFileSync(
    join(directory, 'receipt.json'),
    JSON.stringify(receipt, null, 2) + '\n',
  )
  return receipt
}
if (import.meta.main) {
  const [database, directory] = process.argv.slice(2)
  if (!database || !directory)
    throw new Error('Usage: audit-resource-logos.ts DATABASE DIRECTORY')
  const result = await auditResourceLogos(database, directory)
  console.log(
    JSON.stringify({
      checked: result.checked,
      verified: result.verified,
      blocked: result.blocked,
      exceptions: result.evidence
        .filter(r => r.status !== 'verified')
        .map(r => ({
          owners: r.owners,
          reason: r.reason,
          originalStatus: r.originalStatus,
          metadataStatus: r.metadataStatus,
        })),
    }),
  )
}
