// DRIZZLE
import { sql } from 'drizzle-orm'
// DOMAIN
import { readLocationFacts } from '#lib/locations/factsSnapshot.js'
// SERVICES
import { ensureImportedBrand } from './identityCatalogue'
import {
  prepareSharedLocationCorrection,
  readSharedLocationCorrection,
} from './locationShared'
import { executeRevisionBatch } from './revisionBatch'
// TYPES
import type { Database } from '#lib/types.js'

/** Register all imported brands and place the primary link only in community curation.
 * @param db Database. @param locationId Persisted shared Location. @param actorId Import attribution.
 * @returns Whether a previously unlinked Location gained a catalogue reference.
 * @remarks Explicit curations, clears and locks are respected. Source facts and raw upstream JSON remain byte-for-byte intact.
 */
export async function linkImportedLocationBrands(
  db: Database,
  locationId: string,
  actorId: string,
): Promise<boolean> {
  const storage = await db.get<{ n: number }>(
    sql`SELECT 1 n FROM sqlite_master WHERE name='identityCatalogue' AND type='table'`,
  )
  if (!storage) return false
  const source = await db.get<{ id: string; facts: string }>(
    sql`SELECT r.id,r.facts FROM locationRevisionContent r JOIN location l ON l.id=r.locationId WHERE l.id=${locationId} AND l.state IN ('linked','unresolved') ORDER BY r.version DESC LIMIT 1`,
  )
  if (!source) return false
  const brands = readLocationFacts(source.facts).brands
  const records = []
  for (const brand of brands)
    records.push(await ensureImportedBrand(db, brand, actorId))
  if (!records.length) return false
  const previous = await readSharedLocationCorrection(db, locationId)
  const corrections = previous ? JSON.parse(previous.corrections) : {}
  if (corrections.brandId || corrections.brands) return false
  const closed = await db.get<{ n: number }>(
    sql`SELECT 1 n FROM locationCurationLockHead WHERE locationId=${locationId} AND (json_extract(openFields,'$.brandId')=0 OR json_extract(openFields,'$.brands')=0)`,
  )
  if (closed) return false
  const prepared = await prepareSharedLocationCorrection(db, {
    locationId,
    sourceRevisionId: source.id,
    expectedRevision: previous?.id ?? null,
    actorId,
    rights: { canEdit: true, superAdmin: true },
    guard: sql`EXISTS(SELECT 1 FROM location WHERE id=${locationId} AND state IN ('linked','unresolved'))`,
    patch: { brandId: { mode: 'override', value: records[0].id } },
    provenance: { kind: 'import-brand-link' },
  })
  if (!(await executeRevisionBatch(db, prepared.guard, prepared.queries)))
    throw new Error('LOCATION_BRAND_LINK_CHANGED')
  return true
}

/** Backfill one bounded page, retaining a cursor even for Locations without brands.
 * @param db Database. @param after Last inspected identity. @param actorId Authenticated importer.
 * @returns Counts, retryable Location failures and a continuation cursor.
 */
export async function importLocationBrandPage(
  db: Database,
  after: string | null,
  actorId: string,
): Promise<{ linked: number; scanned: number; failed: string[]; next: string | null }> {
  const rows = await db.all<{ id: string }>(
    sql`SELECT id FROM location WHERE state IN ('linked','unresolved') AND matchingType='establishment' AND EXISTS(SELECT 1 FROM locationRevisionContent r WHERE r.locationId=location.id AND r.version=(SELECT max(version) FROM locationRevisionContent AS locationRevision WHERE locationId=location.id) AND json_array_length(coalesce(json_extract(r.facts,'$.details.brands'),json_extract(r.facts,'$.brands'),'[]'))>0) AND (${after} IS NULL OR id>${after}) ORDER BY id LIMIT 21`,
  )
  let linked = 0
  const failed: string[] = []
  for (const row of rows.slice(0, 20)) {
    try {
      if (await linkImportedLocationBrands(db, row.id, actorId)) linked++
    } catch {
      failed.push(row.id)
    }
  }
  return {
    linked,
    scanned: Math.min(rows.length, 20),
    failed,
    next: rows.length > 20 ? rows[19].id : null,
  }
}

/** Publish a catalogue version as community changes, leaving consumer adoption to policy.
 * @param db Database. @param id Catalogue identity. @param after Last inspected Location. @param actorId Editor attribution.
 * @returns Bounded progress and explicit failures; locked records are never forced.
 */
export async function publishCatalogueLocationPage(
  db: Database,
  id: string,
  after: string | null,
  actorId: string,
): Promise<{ linked: number; failed: string[]; next: string | null }> {
  const { readIdentityCatalogue } = await import('./identityCatalogue')
  const record = await readIdentityCatalogue(db, id)
  if (!record) throw new Error('CATALOGUE_IDENTITY_UNAVAILABLE')
  const field = record.kind === 'brand' ? 'brandId' : 'groupId'
  const rows = await db.all<{ id: string; revision: string; sourceRevisionId: string }>(
    sql`SELECT h.locationId id,h.id revision,(SELECT id FROM locationRevisionContent AS locationRevision WHERE locationId=h.locationId ORDER BY version DESC LIMIT 1) sourceRevisionId FROM locationSharedHead h JOIN location l ON l.id=h.locationId WHERE l.state IN ('linked','unresolved') AND json_extract(h.corrections,${`$.${field}.choice.value`})=${id} AND json_extract(h.corrections,${`$.${field}.choice.mode`})='override' AND coalesce(json_extract(h.corrections,${`$.${field}.catalogue.version`}),0)<${record.version} AND (${after} IS NULL OR h.locationId>${after}) ORDER BY h.locationId LIMIT 21`,
  )
  let linked = 0
  const failed: string[] = []
  for (const row of rows.slice(0, 20)) {
    try {
      const change = await prepareSharedLocationCorrection(db, {
        locationId: row.id,
        sourceRevisionId: row.sourceRevisionId,
        expectedRevision: row.revision,
        actorId,
        rights: { canEdit: true, superAdmin: false },
        guard: sql`1`,
        patch: { [field]: { mode: 'override', value: id } },
        provenance: {
          kind: 'catalogue-publication',
          catalogueId: id,
          version: record.version,
        },
      })
      if (!(await executeRevisionBatch(db, change.guard, change.queries)))
        throw new Error('CATALOGUE_CONSUMER_CHANGED')
      linked++
    } catch {
      failed.push(row.id)
    }
  }
  return { linked, failed, next: rows.length > 20 ? rows[19].id : null }
}
