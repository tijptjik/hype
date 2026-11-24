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
import { canonicalLocationSQL, locationAliasIds } from './locationRedirect'
import { relationshipScopeSql } from './locationRelationships'
import { createLocalLocation } from './locationLocal'
// DOMAIN
import { localIdentityFromAddress } from '#lib/locations/addressIdentity.js'
import { equalLocationValue } from '#lib/locations/baseline.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import { deriveLocationId } from '#lib/locations/id.server.js'
import {
  physicalBuildingProfile,
  type PhysicalBuildingMember,
} from '#lib/locations/physicalBuilding.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { LocationFactsSnapshot } from '#lib/locations/factsSnapshot.js'

// TOC: Source membership projection | Physical building creation and extension

/** Read published translations from the constituent revision pinned by the membership.
 * @param revisionId Verified child revision. @returns Localized names as a JSON object.
 */
function pinnedNames(revisionId: SQLWrapper): SQL<string> {
  return sql<string>`(SELECT json_group_object(locale,name) FROM locationRevisionI18n WHERE revisionId=${revisionId} AND name IS NOT NULL AND name!='')`
}

/** Read member events in review order, independently of subsequent Location edits.
 * @param locationId Physical HYPE identity. @param scope Organisation whose effective assertions to read. @returns JSON array of pinned SaanSeoi children.
 */
export function physicalBuildingMembers(
  locationId: SQLWrapper,
  scope: string | null = null,
): SQL<string> {
  return sql<string>`(SELECT json_group_array(json(member)) FROM (
    SELECT json_set(v.rawSource->'$.member','$.outlineRole',json_extract(r.provenance,'$.outlineRole'),'$.names',json(${pinnedNames(sql`json_extract(root.provenance,'$.childRevisionId')`)}),'$.childLocationId',${canonicalLocationSQL(sql`r.childLocationId`)},'$.childRevisionId',json_extract(root.provenance,'$.childRevisionId')) member
    FROM locationMembershipHead r JOIN locationMembership root ON root.id=r.relationshipId
    JOIN locationRevision v ON v.id=json_extract(root.provenance,'$.parentRevisionId')
    WHERE ${canonicalLocationSQL(sql`r.parentLocationId`)}=${locationId} AND r.assertionState='asserted' AND r.membershipState='current'
    AND ${relationshipScopeSql('locationMembership', scope)}
    AND (r.effectiveFrom IS NULL OR r.effectiveFrom<=date('now')) AND (r.effectiveTo IS NULL OR r.effectiveTo>date('now'))
    ORDER BY v.version))`
}

/** Identify a created or explicitly designated physical parent.
 * @param locationId Trusted Location identity expression. @returns A SQL predicate.
 */
export function isPhysicalBuildingParent(locationId: SQLWrapper): SQL {
  return sql`EXISTS(SELECT 1 FROM locationRevision v WHERE v.locationId=${locationId}
    AND ((v.version=1 AND v.rawSource->>'$.kind'='physical-building-member')
      OR (v.version=1 AND v.rawSource->>'$.kind'='reviewed-building-evidence'
        AND v.rawSource->>'$.buildingEvidence.review'='explicit-physical-building')
      OR v.rawSource->>'$.kind'='physical-building-designation'))`
}

/** Read both composition roles for an authorized building profile.
 * @param db Request-local database. @param locationId Current visible building identity.
 * @param scope Organisation whose effective memberships are visible, or null for shared reads.
 * @returns Independent parent and constituent flags. An unattached import has neither role.
 */
export async function readBuildingProfileRoles(
  db: Database,
  locationId: string,
  scope: string | null,
): Promise<{ physical: boolean; constituent: boolean }> {
  // Only effective building-to-building membership in a physical parent establishes a constituent role.
  const row = await db.get<{ physical: number; constituent: number }>(sql`SELECT
    ${isPhysicalBuildingParent(sql`${locationId}`)} physical,
    EXISTS(SELECT 1 FROM locationMembershipHead r
      JOIN location p ON p.id=${canonicalLocationSQL(sql`r.parentLocationId`)}
      WHERE r.childLocationId IN ${locationAliasIds(locationId)}
        AND p.matchingType='building' AND p.state!='redirect' AND (p.state!='manual' OR p.ownerOrganisationId IS ${scope})
        AND ${isPhysicalBuildingParent(sql`p.id`)} AND ${relationshipScopeSql('locationMembership', scope)}
        AND r.assertionState='asserted' AND r.membershipState='current'
        AND (r.effectiveFrom IS NULL OR r.effectiveFrom<=date('now')) AND (r.effectiveTo IS NULL OR r.effectiveTo>date('now'))
    ) constituent`)
  return { physical: Boolean(row?.physical), constituent: Boolean(row?.constituent) }
}

/** Save one verified catalogue member as a child of a new or existing physical building.
 * @param db Request-local database. @param organisationId Authorized owner. @param actorId Authenticated editor.
 * @param target Creation retry key or existing physical building ID. @param member Server-verified published record. Omit to refresh defaults from retained memberships.
 * @returns Stable parent identity. Replaying an action with the same source ID is idempotent.
 */
export async function savePhysicalBuildingMember(
  db: Database,
  organisationId: string,
  actorId: string,
  target: { requestId: string } | { parentId: string },
  member?: PhysicalBuildingMember,
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
  if ('requestId' in target && (!member || (head && head.seed !== member.source.id)))
    throw new Error('This creation request already belongs to another building.')
  const members: PhysicalBuildingMember[] = head ? JSON.parse(head.members) : []
  const duplicate =
    member && members.find(existing => existing.source.id === member.source.id)
  if (duplicate) return locationId
  // Import the child independently and pin its published names to the membership revision.
  let constituent: PhysicalBuildingMember | undefined
  if (member) {
    const child = await importBuildingLocation(
      db,
      organisationId,
      member.source,
      'shared',
      actorId,
    )
    const names = await db.get<{ names: string }>(
      sql`SELECT ${pinnedNames(sql`${child.revisionId}`)} names`,
    )
    constituent = {
      ...member,
      names: JSON.parse(names?.names ?? '{}'),
      childLocationId: child.locationId,
      childRevisionId: child.revisionId,
    }
  }
  const profile = physicalBuildingProfile(
    constituent ? [...members, constituent] : members,
  )
  if ('requestId' in target && !head && constituent) {
    const placement = emptyFeatureAddress()
    placement.coordinates = constituent.coordinates
    const value = localIdentityFromAddress('building', profile.names, placement)
    value.facts.location.address.authored = profile.content
    value.facts.location.address.fallbackDisplay = profile.display
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
  if (constituent && 'requestId' in target) {
    if (head.seed !== constituent.source.id)
      throw new Error('This creation request already belongs to another building.')
    return locationId
  }
  // Update generated defaults and preserve the parent's independent corrections and geometry.
  const snapshot: LocationFactsSnapshot = JSON.parse(head.facts)
  {
    const before = physicalBuildingProfile(members)
    for (const locale of new Set([
      ...Object.keys(before.names),
      ...Object.keys(profile.names),
      ...Object.keys(profile.display),
    ])) {
      snapshot.i18n[locale] ??= {}
      const row = snapshot.i18n[locale]
      if (
        snapshot.kind === 'building' &&
        !snapshot.details.confirmedUnnamed &&
        (!row.name || row.name === before.names[locale])
      ) {
        if (profile.names[locale]) row.name = profile.names[locale]
        else delete row.name
      }
      if (profile.display[locale]) row.displayAddress = profile.display[locale]
    }
    const address = snapshot.common.location.address
    if (
      address &&
      (!address.authored || equalLocationValue(address.authored, before.content))
    )
      address.authored = profile.content
  }
  if (!constituent && equalLocationValue(snapshot, JSON.parse(head.facts)))
    return locationId
  const raw = JSON.stringify({
    kind: constituent ? 'physical-building-member' : 'physical-building-profile',
    member: constituent,
    memberRevisionIds: constituent
      ? undefined
      : members.map(row => row.childRevisionId),
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
    AND (SELECT id FROM locationRevision WHERE locationId=l.id ORDER BY version DESC LIMIT 1)=${head.id}
    AND ${physicalBuildingMembers(sql`l.id`)}=${head.members})`,
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
      !constituent ||
      !(JSON.parse(latest.members) as PhysicalBuildingMember[]).some(
        row => row.source.id === constituent.source.id,
      )
    )
      throw new Error('The physical building changed. Retry adding this member.')
  }
  return locationId
}
