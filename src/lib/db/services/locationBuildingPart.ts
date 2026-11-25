// DRIZZLE
import { sql } from 'drizzle-orm'
// DOMAIN
import { readLocationFacts } from '#lib/locations/factsSnapshot.js'
import { currentLocationFacts } from './locationReadProjection'
import {
  emptyFeatureAddress,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
import { relationshipScopeSql } from './locationRelationships'
import { retryBusyRead } from './sqlite'
// TYPES
import type { Database } from '#lib/types.js'
import type { LocationResource } from '#lib/locations/resource.js'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. BUILDING PART IDENTITY
// - locationBuildingPartContext
// 2. CONTAINING BUILDING INTERIOR
// - buildingPartInterior
// ---
/********************
 *  1. BUILDING PART IDENTITY
 ************/
// +++ Building Part Identity

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
    db.all<{ id: string; facts: string; physical: number; class: string }>(sql`
    SELECT DISTINCT p.id, content.facts, p.matchingType class, (p.matchingType='building') physical FROM locationMembershipHead r
    JOIN location p ON p.id=r.parentLocationId
    JOIN locationRevisionContent content ON content.locationId=p.id
      AND content.version=(SELECT max(version) FROM locationRevision WHERE locationId=p.id)
    WHERE r.childLocationId=${id} AND r.assertionState='asserted' AND r.membershipState='current'
      AND ${relationshipScopeSql('locationMembership', organisationId ?? null)}
      AND (r.effectiveFrom IS NULL OR r.effectiveFrom<=date('now'))
      AND (r.effectiveTo IS NULL OR r.effectiveTo>date('now'))
      AND p.state!='redirect' AND (p.ownerOrganisationId IS NULL OR p.ownerOrganisationId=${organisationId ?? null})`),
  )
  let parentLocation: LocationResource['parentLocation'] = null
  // A floor and its building are complementary parents of the same polygon.
  const candidates = parents.length > 1 ? parents.filter(p => p.physical) : parents
  if (candidates.length === 1) {
    const parent = candidates[0]
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
    const subdivisions = parents.filter(
      p => p.class === 'building_part' && p.id !== parent.id,
    )
    const subdivision = subdivisions.length === 1 ? subdivisions[0] : null
    parentLocation = {
      ...(subdivision
        ? {
            subdivisionNames: (
              await currentLocationFacts(
                db,
                subdivision.id,
                readLocationFacts(subdivision.facts),
                organisationId ?? null,
              )
            ).names,
          }
        : {}),
      ...(parent.physical && (address.authored || address.canonical)
        ? { addressContent: address.authored ?? address.canonical?.content }
        : {}),
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

// ---
/********************
 *  2. CONTAINING BUILDING INTERIOR
 ************/
// +++ Containing Building Interior
/** Resolve an interior independently of other parents such as the part's floor.
 * @param db Authorized directory database.
 * @param id Building-part identity.
 * @param scope Authorized organisation or shared-only scope.
 * @param allowDrafts Whether the viewer has super-admin access to unpublished maps.
 * @returns The single containing building's readable map revision, when available.
 */
export async function buildingPartInterior(
  db: Database,
  id: string,
  scope: string | null,
  allowDrafts: boolean,
): Promise<NonNullable<LocationResource['buildingInterior']> | null> {
  // Count distinct current buildings before testing map availability to avoid guessing between parents.
  const rows = await retryBusyRead(() =>
    db.all<{ buildingId: string; mapId: string | null; hash: string | null }>(sql`
      SELECT DISTINCT p.id buildingId, m.id mapId,
        coalesce(${allowDrafts ? sql`m.draftHash` : sql`NULL`}, m.publishedHash) hash
      FROM locationMembershipHead r JOIN location p ON p.id=r.parentLocationId
      LEFT JOIN locationPremisesMap link ON link.locationId=p.id
      LEFT JOIN premisesMap m ON m.id=link.mapId
      WHERE r.childLocationId=${id} AND r.assertionState='asserted' AND r.membershipState='current'
        AND ${relationshipScopeSql('locationMembership', scope)}
        AND (r.effectiveFrom IS NULL OR r.effectiveFrom<=date('now'))
        AND (r.effectiveTo IS NULL OR r.effectiveTo>date('now'))
        AND p.kind='built' AND p.class='building' AND p.state!='redirect'
        AND (p.state!='manual' OR p.ownerOrganisationId IS ${scope})
        AND ${allowDrafts ? sql`1` : sql`NOT (p.state='unresolved' AND p.ssId IS NULL AND p.ownerOrganisationId IS NULL)`}
      LIMIT 2`),
  )
  const parent = rows.length === 1 ? rows[0] : null
  return parent?.mapId && parent.hash
    ? { buildingId: parent.buildingId, mapId: parent.mapId, hash: parent.hash }
    : null
}
