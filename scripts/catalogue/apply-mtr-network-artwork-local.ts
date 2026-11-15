/** Local MTR network artwork import. TOC: inputs; revision saves; artwork. */
// NODE
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
// CLOUDFLARE
import { getPlatformProxy } from 'wrangler'
// DRIZZLE
import { drizzle } from 'drizzle-orm/d1'
import { sql } from 'drizzle-orm'
// DOMAIN
import {
  readIdentityCatalogue,
  saveIdentityCatalogue,
} from '../../src/lib/db/services/identityCatalogue'
import { DEV_PERSONAS } from '../../src/lib/auth/dev-personas'
// TYPES
import type { Database } from '../../src/lib/types'
import type {
  IdentityCatalogueRecord,
  IdentityCatalogueContent,
} from '../../src/lib/locations/identityCatalogue'
import type { D1Database, R2Bucket } from '@cloudflare/workers-types'

const apply = process.argv.includes('--apply')
if (process.argv.slice(2).some(arg => arg !== '--apply'))
  throw new Error('Local-only: only --apply is supported')
const assets = await Bun.file('scripts/catalogue/mtr-network-artwork.json').json()
const proxy = await getPlatformProxy<{ DB: D1Database; ASSET_PUBLIC_DEV: R2Bucket }>({
  configPath: './wrangler.local.toml',
  remoteBindings: false,
})
const db = drizzle(proxy.env.DB) as Database
const receipts: unknown[] = []

/** Publish a revision using the reviewed head, preserving every prior revision.
 * @param record Current catalogue head. @param patch Reviewed changes.
 * @returns Updated record, or the proposed record in dry-run mode.
 */
async function save(
  record: IdentityCatalogueRecord,
  patch: Partial<IdentityCatalogueContent>,
): Promise<IdentityCatalogueRecord> {
  const { id, kind, version, wikidataId: _wiki, ...previous } = record
  const content = { ...previous, ...patch }
  if (isDeepStrictEqual(previous, content)) return record
  receipts.push({ action: 'save', id, version, fields: Object.keys(patch) })
  if (!apply) return { ...record, ...patch }
  const result = await saveIdentityCatalogue(db, {
    id,
    kind,
    expectedVersion: version,
    content,
    actorId: DEV_PERSONAS.admin.id,
    guard: sql`1`,
  })
  if (!result) throw new Error(`Concurrent catalogue change: ${id}`)
  return result
}

try {
  // Immutable artwork keys are derived from bytes, so reruns cannot overwrite an older asset.
  for (const asset of assets) {
    const record = await readIdentityCatalogue(db, asset.id)
    if (!record) throw new Error(`Missing catalogue: ${asset.id}`)
    const bytes = new Uint8Array(await Bun.file(asset.file).arrayBuffer())
    const hash = createHash('sha256').update(bytes).digest('hex')
    if (hash !== asset.sha256) throw new Error(`Changed artwork: ${asset.id}`)
    const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
    const key = `identity-catalogue/${id}.${asset.format}`
    if (apply) {
      const retained = await proxy.env.ASSET_PUBLIC_DEV.get(key)
      if (
        retained &&
        createHash('sha256')
          .update(new Uint8Array(await retained.arrayBuffer()))
          .digest('hex') !== hash
      )
        throw new Error('Immutable asset conflict')
      if (!retained)
        await proxy.env.ASSET_PUBLIC_DEV.put(key, bytes, {
          httpMetadata: {
            contentType: asset.format === 'svg' ? 'image/svg+xml' : 'image/png',
          },
        })
    }
    const src = `/api/identity-catalogue/logos/${id}`
    const {
      file: _file,
      sha256: _hash,
      id: _id,
      name: _name,
      slot = 'logo',
      ...metadata
    } = asset
    await save(record, {
      ...(slot === 'logo' ? { logo: src } : {}),
      artwork: {
        ...record.artwork,
        [slot]: {
          ...metadata,
          src,
          background: asset.background ?? '#ffffff',
          status: 'approved',
        },
      },
    })
  }
  console.log(JSON.stringify({ apply, updated: receipts.length, receipts }, null, 2))
} finally {
  await proxy.dispose()
}
