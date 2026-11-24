// DRIZZLE
import { and, desc, eq } from 'drizzle-orm'
// SCHEMA
import { location, locationRevision } from '../schema/location'
// SOURCES
import { loadBuildingNames, loadBuildingDetails } from '#lib/sources/saanseoi.js'
import { sharedBuildingImportId } from './buildingImportIdentity'
import { buildingLocationId } from '#lib/locations/buildingLocationId.js'
// ADDRESS
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import { fillBuildingDetails } from '#lib/addresses/buildingSelection.js'
import { localIdentityFromAddress } from '#lib/locations/addressIdentity.js'
import { createLocalLocation, updateLocalLocationAddress } from './locationLocal'
import { LocationNamesEditSchema } from '#lib/locations/validation.js'
import {
  BuildingSourceSchema,
  type BuildingSource,
} from '#lib/locations/buildingSource.js'
// TYPES
import type { Database } from '#lib/types.js'

/** Import or reuse a verified published building without treating its ID as a Places ssID.
 * @param db Request-local database, after Organisation management has been authorised.
 * @param organisationId Authorised owner; private visibility stays scoped to that owner.
 * @param source Release-pinned building and optional spatial address alternative.
 * @param visibility Explicit shared or exclusive choice.
 * @param actorId Authenticated author retained in immutable provenance.
 * @param reviewedNames Optional editor corrections, recorded separately from the verified catalogue baseline.
 * @returns Reusable Hype Location and latest baseline revision for association.
 * @remarks Public exports are verified server-side. The catalogue reference lives in
 * immutable provenance; it does not claim support for Places refresh or identity matching.
 */
export async function importBuildingLocation(
  db: Database,
  organisationId: string,
  source: BuildingSource,
  visibility: 'shared' | 'exclusive',
  actorId: string,
  reviewedNames?: Record<string, string>,
): Promise<{ locationId: string; revisionId: string }> {
  source = BuildingSourceSchema.parse(source)
  const locationId =
    visibility === 'shared'
      ? await sharedBuildingImportId(db, source.id)
      : await buildingLocationId(source.id, visibility, organisationId)
  /** Preserve reviewed name edits through the existing Organisation correction writer.
   * @param identity Verified or reused building identity.
   * @returns Its corrected revision, without changing retained export provenance.
   */
  const withReviewedNames = async (identity: {
    locationId: string
    revisionId: string
  }): Promise<{ locationId: string; revisionId: string }> => {
    if (!reviewedNames) return identity
    const revision = await updateLocalLocationAddress(db, {
      locationId: identity.locationId,
      organisationId,
      expectedRevisionId: identity.revisionId,
      names: LocationNamesEditSchema.parse(reviewedNames),
      actorId,
    })
    if (!revision) throw new Error('BUILDING_IDENTITY_CHANGED')
    return { locationId: identity.locationId, revisionId: revision.revisionId }
  }
  /** Read only this importer-owned identity, preserving edits to an existing baseline.
   * @returns The reusable identity, or null before its first import.
   */
  const existing = async (): Promise<{
    locationId: string
    revisionId: string
  } | null> => {
    const row = await db
      .select({
        revisionId: locationRevision.id,
        kind: location.kind,
        state: location.state,
        owner: location.ownerOrganisationId,
        rawSource: locationRevision.rawSource,
      })
      .from(location)
      .innerJoin(locationRevision, eq(locationRevision.locationId, location.id))
      .where(
        and(
          eq(location.id, locationId),
          visibility === 'exclusive'
            ? eq(location.ownerOrganisationId, organisationId)
            : undefined,
        ),
      )
      .orderBy(desc(locationRevision.version))
      .get()
    if (!row) return null
    if (
      row.kind !== 'building' ||
      row.state === 'redirect' ||
      (visibility === 'exclusive') !== (row.state === 'manual')
    )
      throw new Error('BUILDING_IDENTITY_REVIEW_REQUIRED')
    return { locationId, revisionId: row.revisionId }
  }
  const reusable = await existing()
  if (reusable) return withReviewedNames(reusable)
  // Verify source identity and its release before constructing any persisted facts.
  const bundle = await loadBuildingNames()
  if (bundle.release !== source.release) throw new Error('BUILDING_PUBLICATION_CHANGED')
  const record = bundle.records.find(row => row.id === source.id)
  if (!record) throw new Error('BUILDING_NOT_FOUND')
  const details = await loadBuildingDetails(source.id, source.release)
  const candidate = source.addressId
    ? details.addresses.find(row => row.id === source.addressId)
    : details.addresses[0]
  if (source.addressId && !candidate) throw new Error('BUILDING_ADDRESS_NOT_FOUND')
  const names = Object.fromEntries(
    Object.entries(record.names).filter((entry): entry is [string, string] =>
      Boolean(entry[1]),
    ),
  )
  if (!Object.keys(names).length && record.name) names.und = record.name
  const building = { ...record, names, release: bundle.release }
  const address = fillBuildingDetails(
    emptyFeatureAddress(),
    building,
    details,
    candidate,
    false,
    'en',
  )
  const input = localIdentityFromAddress('building', names, address, visibility)
  let identity: { locationId: string; revisionId: string }
  try {
    identity = await createLocalLocation(db, organisationId, input, actorId, {
      locationId,
      buildingSource: source,
    })
  } catch (cause) {
    // A concurrent import wins the unique Location ID; failed batches cannot leave duplicate baselines.
    const winner = await existing()
    if (!winner) throw cause
    identity = winner
  }
  return withReviewedNames(identity)
}
