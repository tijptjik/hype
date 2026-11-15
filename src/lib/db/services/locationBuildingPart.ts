// DRIZZLE
import { sql } from 'drizzle-orm'
// DOMAIN
import { readLocationFacts } from '#lib/locations/factsSnapshot.js'
import { currentLocationFacts } from './locationReadProjection'
import {
  emptyFeatureAddress,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
import { retryBusyRead } from './sqlite'
// TYPES
import type { Database } from '#lib/types.js'
import type { LocationResource } from '#lib/locations/resource.js'

/** Read explicit current containment and retained indoor polygon identity.
 * @param db Authorized request database.
 * @param id Authorized building-part Location ID.
 * @param organisationId Readable organisation scope.
 * @returns Public profile context, without source geometry or private parent facts.
 * @remarks Ambiguous parent assertions are not resolved by proximity or arbitrary ordering.
 */
export async function locationBuildingPartContext(
  db: Database,
  id: string,
  organisationId?: string,
): Promise<Pick<LocationResource, 'parentLocation' | 'indoorSource'>> {
  const parents = await retryBusyRead(() =>
    db.all<{ id: string; facts: string }>(sql`
    SELECT DISTINCT p.id, r.facts FROM locationMembershipHead h
    JOIN location p ON p.id=h.parentLocationId
    JOIN locationRevisionContent r ON r.locationId=p.id
      AND r.version=(SELECT max(version) FROM locationRevision WHERE locationId=p.id)
    WHERE h.childLocationId=${id} AND h.assertionState='asserted' AND h.membershipState='current'
      AND (h.scopeOrganisationId IS NULL OR h.scopeOrganisationId=${organisationId ?? null})
      AND (h.effectiveFrom IS NULL OR h.effectiveFrom<=date('now'))
      AND (h.effectiveTo IS NULL OR h.effectiveTo>date('now'))
      AND p.state!='redirect' AND (p.ownerOrganisationId IS NULL OR p.ownerOrganisationId=${organisationId ?? null})`),
  )
  let parentLocation: LocationResource['parentLocation'] = null
  if (parents.length === 1) {
    const parent = parents[0]
    const facts = await currentLocationFacts(
      db,
      parent.id,
      readLocationFacts(parent.facts),
      organisationId ?? null,
    )
    const address = facts.location.address
    const displayAddress = { ...address.fallbackDisplay }
    if (address.authored || address.status !== 'unresolved') {
      for (const [tag, locale] of [
        ['en', 'en'],
        ['zh-hant', 'zhHant'],
        ['zh-hans', 'zhHans'],
      ] as const) {
        const label = getAddressDisplay(
          {
            ...emptyFeatureAddress(),
            source: address,
            coordinates: facts.location.geometry.coordinates,
          },
          locale,
        )
        if (label) displayAddress[tag] = label
      }
    }
    parentLocation = {
      id: parent.id,
      names: facts.names,
      displayAddress,
    }
  }
  // Stable unit IDs survive source refreshes; only published maps receive public deep links.
  const sources = await retryBusyRead(() =>
    db.all<{
      mapId: string
      unitId: string
      kind: string
      publishedHash: string | null
      sourceKey: string | null
      category: string | null
    }>(sql`
    SELECT mu.mapId,mu.unitId,m.kind,m.publishedHash,
        json_extract(r.rawSource,'$.record.rawSource.properties.unit_category') category,
        coalesce(d.sourceKey,json_extract(r.rawSource,'$.canonicalDraft.sourceKey'),json_extract(r.rawSource,'$.record.ref')) sourceKey
    FROM premisesMapUnit mu JOIN premisesMap m ON m.id=mu.mapId
    LEFT JOIN locationCanonicalDraft d ON d.locationId=mu.locationId
      LEFT JOIN locationRevision r ON r.locationId=mu.locationId
        AND r.version=(SELECT max(version) FROM locationRevision WHERE locationId=mu.locationId)
    WHERE mu.locationId=${id}`),
  )
  const source = sources.length === 1 ? sources[0] : null
  const indoorSource =
    source && source.sourceKey === `landsd-mtr-unit:${source.unitId}`
      ? {
          category: source.category,
          provider: 'Lands Department',
          layer: 'mtr_unit_polygon',
          polygonId: source.unitId,
          sourceKey: source.sourceKey,
          mapId: source.mapId,
          href: source.publishedHash
            ? `/${source.kind === 'building' ? 'buildings' : 'premises'}/${encodeURIComponent(source.mapId)}/places/${encodeURIComponent(source.unitId)}`
            : null,
        }
      : null
  return { parentLocation, indoorSource }
}
