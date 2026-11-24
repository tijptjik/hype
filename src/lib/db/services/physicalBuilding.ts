// SVELTEKIT
import { error } from '@sveltejs/kit'
// NODE
import { createHash } from 'node:crypto'
// DRIZZLE
import { sql, type SQL, type SQLWrapper } from 'drizzle-orm'
// IDENTITY
import { nanoid } from 'nanoid'
// DB
import { locationRevisionInput } from '../schema/location'
import { executeRevisionBatch } from './revisionBatch'
import { importBuildingLocation } from './locationBuilding'
import { canonicalLocationSQL } from './locationRedirect'
import { relationshipScopeSql } from './locationRelationships'
import { createLocalLocation } from './locationLocal'
// DOMAIN
import { localIdentityFromAddress } from '#lib/locations/addressIdentity.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import { deriveLocationId } from '#lib/locations/id.server.js'
import {
  physicalBuildingAddresses,
  type PhysicalBuildingMember,
} from '#lib/locations/physicalBuilding.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { LocationFactsSnapshot } from '#lib/locations/factsSnapshot.js'

// TOC: Source membership projection | Physical building creation and extension

/** Read member events in review order, independently of subsequent Location edits.
 * @param locationId Physical HYPE identity. @param scope Organisation whose effective assertions to read. @returns JSON array of pinned SaanSeoi children.
 */
export function physicalBuildingMembers(
  locationId: SQLWrapper,
  scope: string | null = null,
): SQL<string> {
  return sql<string>`(SELECT json_group_array(json(member)) FROM (
    SELECT json_set(v.rawSource->'$.member','$.childLocationId',${canonicalLocationSQL(sql`r.childLocationId`)},'$.childRevisionId',json_extract(root.provenance,'$.childRevisionId')) member
    FROM locationMembershipHead r JOIN locationMembership root ON root.id=r.relationshipId
    JOIN locationRevision v ON v.id=json_extract(root.provenance,'$.parentRevisionId')
    WHERE ${canonicalLocationSQL(sql`r.parentLocationId`)}=${locationId} AND r.assertionState='asserted' AND r.membershipState='current'
    AND ${relationshipScopeSql('locationMembership', scope)}
    AND (r.effectiveFrom IS NULL OR r.effectiveFrom<=date('now')) AND (r.effectiveTo IS NULL OR r.effectiveTo>date('now'))
    ORDER BY v.version))`
}

/** Save one verified catalogue member as a child of a new or existing physical building.
 * @param db Request-local database. @param organisationId Authorized owner. @param actorId Authenticated editor.
 * @param target Creation retry key or existing physical building ID. @param member Server-verified published record.
 * @returns Stable parent identity. Replaying an action with the same source ID is idempotent.
 */
export async function savePhysicalBuildingMember(
  db: Database,
  organisationId: string,
  actorId: string,
  target: { requestId: string } | { parentId: string },
  member: PhysicalBuildingMember,
): Promise<string> {
  const locationId =
    'parentId' in target
      ? target.parentId
      : deriveLocationId(
          'physical-building',
          JSON.stringify([organisationId, target.requestId]),
        )
  // Older databases accept an evidence revision without creating its required membership.
  if (
    !(await db.get(
      sql`SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='location_composition_member'`,
    ))
  )
    error(
      503,
      'Physical building membership requires database migration 0271. Ask an administrator to apply it, then retry.',
    )
  const eligible = sql`l.id=${locationId} AND l.ownerOrganisationId=${organisationId} AND l.matchingType='building'
    AND l.state='unresolved' AND l.ssId IS NULL`
  /** Read the current facts and recorded source IDs at one consistent revision.
   * @returns Editable head and reviewed member history, or undefined.
   */
  const read = () =>
    db.get<{
      id: string
      version: number
      facts: string
      members: string
      seed: string
    }>(sql`
    SELECT r.id,r.version,r.facts,(SELECT json_extract(rawSource,'$.member.source.id') FROM locationRevision WHERE locationId=l.id AND version=1) seed,${physicalBuildingMembers(sql`l.id`)} members
    FROM location l JOIN locationRevisionContent r ON r.locationId=l.id
    WHERE ${eligible} AND EXISTS(SELECT 1 FROM locationRevision first WHERE first.locationId=l.id
      AND first.version=1 AND json_extract(first.rawSource,'$.kind')='physical-building-member')
    ORDER BY r.version DESC LIMIT 1`)
  let head = await read()
  if ('parentId' in target && !head)
    throw new Error('Physical building unavailable for editing.')
  if (head && 'requestId' in target && head.seed !== member.source.id)
    throw new Error('This creation request already belongs to another building.')
  if (
    head &&
    (JSON.parse(head.members) as PhysicalBuildingMember[]).some(
      existing => existing.source.id === member.source.id,
    )
  )
    return locationId
  // Import the child independently. Retrying a parent write reuses its stable catalogue identity.
  const child = await importBuildingLocation(
    db,
    organisationId,
    member.source,
    'shared',
    actorId,
  )
  const constituent = {
    ...member,
    childLocationId: child.locationId,
    childRevisionId: child.revisionId,
  }
  if ('requestId' in target && !head) {
    const placement = emptyFeatureAddress()
    placement.coordinates = member.coordinates
    const value = localIdentityFromAddress('building', {}, placement)
    delete value.facts.location.address.authored
    value.facts.location.address.fallbackDisplay = physicalBuildingAddresses([member])
    // The first member and the separate HYPE identity are committed by the same creation batch.
    try {
      await createLocalLocation(db, organisationId, value, actorId, {
        locationId,
        physicalBuildingMember: constituent,
      })
      return locationId
    } catch (cause) {
      head = await read()
      if (!head) throw cause
    }
  }
  if (!head) throw new Error('Physical building unavailable for editing.')
  const members: PhysicalBuildingMember[] = JSON.parse(head.members)
  if ('requestId' in target && head.seed !== member.source.id)
    throw new Error('This creation request already belongs to another building.')
  if (members.some(existing => existing.source.id === member.source.id))
    return locationId
  // Only the generated default changes. Keep current names, authored address, explicit display overrides and geometry.
  const snapshot: LocationFactsSnapshot = JSON.parse(head.facts)
  for (const [locale, label] of Object.entries(
    physicalBuildingAddresses([...members, member]),
  )) {
    snapshot.i18n[locale] ??= {}
    snapshot.i18n[locale].displayAddress = label
  }
  const raw = JSON.stringify({
    kind: 'physical-building-member',
    member: constituent,
    actorId,
    organisationId,
  })
  const facts = JSON.stringify(snapshot)
  const hash = createHash('sha256')
    .update(JSON.stringify([raw, facts]))
    .digest('hex')
  const committed = await executeRevisionBatch(
    db,
    sql`EXISTS(SELECT 1 FROM location l WHERE ${eligible}
    AND (SELECT id FROM locationRevision WHERE locationId=l.id ORDER BY version DESC LIMIT 1)=${head.id})`,
    [
      db
        .insert(locationRevisionInput)
        .select(
          sql`SELECT ${nanoid(12)},${locationId},${head.version + 1},'local',NULL,NULL,NULL,NULL,${hash},${raw},${facts},strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
        ),
    ],
  )
  if (!committed) {
    const latest = await read()
    if (
      !latest ||
      !(JSON.parse(latest.members) as PhysicalBuildingMember[]).some(
        row => row.source.id === member.source.id,
      )
    )
      throw new Error('The physical building changed. Retry adding this member.')
  }
  return locationId
}
