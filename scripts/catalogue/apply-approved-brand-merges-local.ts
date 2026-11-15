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
const merges = await Bun.file('scripts/catalogue/approved-brand-merges.json').json()
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
  // Preflight every pair before creating any immutable revisions.
  for (const pair of merges) {
    const old = await readIdentityCatalogue(db, pair.from)
    const target = await readIdentityCatalogue(db, pair.to)
    if (
      !old ||
      !target ||
      old.kind !== 'brand' ||
      target.kind !== 'brand' ||
      target.isArchived
    )
      throw new Error('Merge pair unavailable: ' + pair.from)
    if (old.groupId && target.groupId && old.groupId !== target.groupId)
      throw new Error('Conflicting corporate parents: ' + pair.name)
  }
  for (const { from, to, name } of merges) {
    const old = (await readIdentityCatalogue(db, from))!
    let target = (await readIdentityCatalogue(db, to))!
    const names = { ...target.i18n, en: { name } }
    // Replace copied English fallback names while preserving real localized names.
    for (const [locale, value] of Object.entries(names)) {
      if (locale !== 'en' && value.name === target.i18n.en?.name)
        names[locale] = { name }
    }
    target = await save(target, {
      i18n: names,
      ...(target.groupId ? {} : old.groupId ? { groupId: old.groupId } : {}),
      ...(!target.logo && old.logo ? { logo: old.logo } : {}),
      artwork: { ...old.artwork, ...target.artwork },
      categories: [
        ...new Set([...(target.categories ?? []), ...(old.categories ?? [])]),
      ],
      evidence: [
        ...new Map(
          [...(target.evidence ?? []), ...(old.evidence ?? [])].map(e => [
            e.kind + ':' + e.url,
            e,
          ]),
        ).values(),
      ],
    })
    const selected = await db.all<{ locationId: string; sourceRevisionId: string }>(sql`
      SELECT h.locationId,(SELECT id FROM locationRevisionContent r WHERE r.locationId=h.locationId ORDER BY r.version DESC LIMIT 1) sourceRevisionId
      FROM locationSharedHead h WHERE json_extract(h.corrections,'$.brandId.choice.value')=${from} OR (json_extract(h.corrections,'$.brandId.choice.value')=${to} AND coalesce(json_extract(h.corrections,'$.brandId.catalogue.i18n.en.name'),'')<>${name})`)
    const mappings = await db.all(
      sql`SELECT source,sourceId FROM identityCatalogueSource WHERE catalogueId=${from}`,
    )
    receipts.push({
      action: 'merge',
      from,
      to,
      name,
      locations: selected.length,
      sourceMappings: mappings.length,
    })
    if (apply) {
      for (const row of selected) {
        const head = await readSharedLocationCorrection(db, row.locationId)
        const correction = await prepareSharedLocationCorrection(db, {
          locationId: row.locationId,
          sourceRevisionId: row.sourceRevisionId,
          expectedRevision: head?.id ?? null,
          actorId: DEV_PERSONAS.admin.id,
          draftWorkingCopy: true,
          rights: { canEdit: true, superAdmin: true },
          guard: sql`1`,
          patch: { brandId: { mode: 'override', value: to } },
          provenance: {
            kind: 'staff-correction',
            reason: 'User-approved duplicate brand merge',
            previousCatalogueId: from,
            catalogueId: to,
          },
        })
        await db.batch(correction.queries)
        const changed = await readSharedLocationCorrection(db, row.locationId)
        if (changed?.id === head?.id)
          throw new Error('Location update did not apply: ' + row.locationId)
      }
      await db.run(
        sql`UPDATE identityCatalogueSource SET catalogueId=${to} WHERE catalogueId=${from}`,
      )
    }
    await save(old, { isArchived: true })
  }
  await Bun.write(
    '.research/catalogue/approved-brand-merges-' +
      (apply ? 'apply' : 'dry-run') +
      '.json',
    JSON.stringify(receipts, null, 2),
  )
  console.log(JSON.stringify({ apply, receipts }, null, 2))
} finally {
  await proxy.dispose()
}
