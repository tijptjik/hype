// DRIZZLE
import { sql } from 'drizzle-orm'
import { canonicalLocationSQL } from './locationRedirect.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { SQL } from 'drizzle-orm'

/** Build the scoped containment query so reads and the write fence use the same evidence.
 * @param root Location ID. @param organisationId Owning organisation. @param includeParts Whether to include building parts.
 * @returns Bounded query of current accessible descendants including the root.
 */
export function researchLocationDescendantsSQL(
  root: string,
  organisationId: string,
  includeParts: boolean,
): SQL {
  return sql`WITH RECURSIVE children(id,kind) AS (
    SELECT l.id,l.matchingType FROM location l WHERE l.id=${root}
    UNION
    SELECT child.id,child.matchingType FROM children parent JOIN locationMembershipHead m ON ${canonicalLocationSQL(sql`m.parentLocationId`)}=parent.id JOIN location child ON child.id=${canonicalLocationSQL(sql`m.childLocationId`)}
    WHERE m.assertionState='asserted' AND m.membershipState='current' AND (m.effectiveFrom IS NULL OR m.effectiveFrom<=date('now')) AND (m.effectiveTo IS NULL OR m.effectiveTo>date('now'))
    AND (m.scopeOrganisationId=${organisationId} OR (m.scopeOrganisationId IS NULL AND NOT EXISTS(SELECT 1 FROM locationMembershipHead own WHERE own.relationshipId=m.relationshipId AND own.scopeOrganisationId=${organisationId})))
    AND child.state!='redirect' AND (child.state!='manual' OR child.ownerOrganisationId=${organisationId})
    AND ((parent.kind='premises' AND child.matchingType='building') OR (${includeParts ? 1 : 0}=1 AND parent.kind IN ('building','building_part') AND child.matchingType='building_part'))
  ) SELECT id,kind FROM children LIMIT 5001`
}

/** Resolve the accessible, explicitly asserted containment tree for a field session.
 * @param db Request database. @param root Location ID. @param organisationId Owning organisation. @param includeParts Whether building parts are included.
 * @returns Root plus at most 5,000 descendants, or 5,001 rows when the selection is too large.
 * @remarks Organisation overrides suppress public counterparts; the caller authorizes the root.
 */
export async function researchLocationDescendants(
  db: Database,
  root: string,
  organisationId: string,
  includeParts: boolean,
): Promise<{ id: string; kind: string }[]> {
  return db.all<{ id: string; kind: string }>(
    researchLocationDescendantsSQL(root, organisationId, includeParts),
  )
}
