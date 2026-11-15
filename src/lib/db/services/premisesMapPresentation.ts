// DRIZZLE
import { sql } from 'drizzle-orm'
// DOMAIN
import { readLocationFacts } from '#lib/locations/factsSnapshot.js'
import { currentLocationFacts } from './locationReadProjection'
import { readIdentityCatalogue } from './identityCatalogue'
import { catalogueGeneralLogo } from '#lib/locations/catalogueArtwork.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { ShopArtwork } from '#lib/indoor/artwork.js'

/** Resolve public current occupancy and approved brand artwork independently of geometry releases.
 * @param db Request database. @param mapId Map identity. @returns Unambiguous unit artwork.
 * @remarks Private/scoped and superseded assertions never contribute. A shared unit with conflicting brands has no arbitrary winner.
 */
export async function premisesMapArtwork(
  db: Database,
  mapId: string,
): Promise<Record<string, ShopArtwork>> {
  const rows = await db.all<{ unitId: string; locationId: string; facts: string }>(sql`
    SELECT mu.unitId, tenant.id locationId, r.facts
    FROM premisesMapUnit mu
    JOIN location unit ON unit.id=mu.locationId AND unit.ownerOrganisationId IS NULL AND unit.state!='redirect'
    JOIN locationOccupancyHead o ON o.containerLocationId=unit.id
      AND o.scopeOrganisationId IS NULL AND o.assertionState='asserted' AND o.occupancyState='current'
      AND (o.effectiveFrom IS NULL OR o.effectiveFrom <= date('now'))
      AND (o.effectiveTo IS NULL OR o.effectiveTo > date('now'))
    JOIN location tenant ON tenant.id=o.establishmentLocationId AND tenant.ownerOrganisationId IS NULL AND tenant.state!='redirect'
    JOIN locationRevisionContent r ON r.locationId=tenant.id
      AND r.version=(SELECT max(version) FROM locationRevision WHERE locationId=tenant.id)
    WHERE mu.mapId=${mapId}`)
  const candidates = new Map<string, Map<string, ShopArtwork>>()
  for (const row of rows) {
    const facts = await currentLocationFacts(
      db,
      row.locationId,
      readLocationFacts(row.facts),
      null,
    )
    if (!facts.brandId) continue
    const brand = await readIdentityCatalogue(db, facts.brandId)
    if (brand?.kind !== 'brand' || brand.isArchived) continue
    const src = catalogueGeneralLogo(brand)
    if (!src) continue
    const asset = Object.values(brand.artwork ?? {}).find(
      a => a.src === src && a.status === 'approved',
    )
    const byBrand = candidates.get(row.unitId) ?? new Map<string, ShopArtwork>()
    byBrand.set(`${brand.id}:${src}`, {
      src,
      aspect:
        asset?.sourceWidth && asset.sourceHeight
          ? asset.sourceWidth / asset.sourceHeight
          : 1,
      padding: 0.8,
      background: asset?.background ?? '#ffffff',
    })
    candidates.set(row.unitId, byBrand)
  }
  return Object.fromEntries(
    [...candidates].flatMap(([id, brands]) =>
      brands.size === 1 ? [[id, [...brands.values()][0]]] : [],
    ),
  )
}
