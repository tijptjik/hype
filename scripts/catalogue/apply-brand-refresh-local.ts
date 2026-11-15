/** Local catalogue refresh. TOC: inputs; revision saves; artwork; hierarchy; merges. */
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
  readIdentityCatalogueByCode,
  saveIdentityCatalogue,
} from '../../src/lib/db/services/identityCatalogue'
import {
  prepareSharedLocationCorrection,
  readSharedLocationCorrection,
} from '../../src/lib/db/services/locationShared'
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
const assets = await Bun.file('scripts/catalogue/brand-refresh-artwork.json').json()
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
    const record =
      asset.code === 'maxims-cakes'
        ? await readIdentityCatalogue(db, '32a36c45-4f5a-40b5-9fc4-b2570c8c4511')
        : await readIdentityCatalogueByCode(
            db,
            asset.code === 'jardine-matheson' ? 'group' : 'brand',
            asset.code,
          )
    if (!record) throw new Error(`Missing catalogue: ${asset.code}`)
    const bytes = new Uint8Array(await Bun.file(asset.file).arrayBuffer())
    const hash = createHash('sha256').update(bytes).digest('hex')
    if (hash !== asset.sha256) throw new Error(`Changed artwork: ${asset.code}`)
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
      code: _code,
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
  // Repair the requested parent link without creating a second Jardine Matheson identity.
  const dfi = await readIdentityCatalogueByCode(db, 'group', 'dfi')
  const jardines = await readIdentityCatalogueByCode(db, 'group', 'jardine-matheson')
  if (!dfi || !jardines) throw new Error('Missing DFI or Jardines')
  await save(dfi, { groupId: jardines.id })

  // Approved duplicate pairs retain history; current shared selections and import mappings move.
  const merges = [
    ['71fafb3e-e657-40d2-9df7-194aec8d9de2', 'tko-brand-circle-k', 'Circle K'],
    ['f56918bb-25c6-4df8-8519-9f1b87327b4a', 'tko-brand-chateraise', 'Chateraise'],
    [
      'a1ba1198-3f7b-42aa-bde2-ea38ef2fb23f',
      'bl-brand-0299cfcba06f95cb6b30a27f',
      'Maison Kayser',
    ],
    [
      'bl-brand-f92a296e7ea8ebb1653c2f7e',
      '32a36c45-4f5a-40b5-9fc4-b2570c8c4511',
      "Maxim's Cakes",
    ],
  ] as const
  for (const [from, to, name] of merges) {
    const old = await readIdentityCatalogue(db, from)
    let target = await readIdentityCatalogue(db, to)
    if (!old || !target) throw new Error(`Missing merge pair: ${from}`)
    target = await save(target, {
      i18n: { ...target.i18n, en: { name } },
      ...(name === "Maxim's Cakes"
        ? { groupId: 'bl-group-maxims-group', code: 'maxims-cakes' }
        : {}),
      evidence: [
        ...new Map(
          [...(target.evidence ?? []), ...(old.evidence ?? [])].map(e => [
            `${e.kind}:${e.url}`,
            e,
          ]),
        ).values(),
      ],
    })
    const selected = await db.all<{ locationId: string; sourceRevisionId: string }>(sql`
      SELECT h.locationId,(SELECT id FROM locationRevisionContent r WHERE r.locationId=h.locationId ORDER BY r.version DESC LIMIT 1) sourceRevisionId
      FROM locationSharedHead h WHERE json_extract(h.corrections,'$.brandId.choice.value')=${from}`)
    receipts.push({ action: 'merge', from, to, locations: selected.length })
    if (apply) {
      for (const row of selected) {
        const head = await readSharedLocationCorrection(db, row.locationId)
        const correction = await prepareSharedLocationCorrection(db, {
          locationId: row.locationId,
          sourceRevisionId: row.sourceRevisionId,
          expectedRevision: head?.id ?? null,
          actorId: DEV_PERSONAS.admin.id,
          rights: { canEdit: true, superAdmin: true },
          guard: sql`1`,
          patch: { brandId: { mode: 'override', value: to } },
          provenance: {
            kind: 'staff-correction',
            reason: 'User-approved catalogue brand consolidation',
            previousCatalogueId: from,
            catalogueId: to,
          },
        })
        await db.batch(correction.queries)
      }
      await db.run(
        sql`UPDATE identityCatalogueSource SET catalogueId=${to} WHERE catalogueId=${from}`,
      )
    }
    await save(old, { isArchived: true })
  }
  await Bun.write(
    '.research/catalogue/refresh/' + (apply ? 'apply-receipt' : 'dry-run') + '.json',
    JSON.stringify(receipts, null, 2) + '\n',
  )
  console.log(JSON.stringify({ apply, receipts }, null, 2))
} finally {
  await proxy.dispose()
}
