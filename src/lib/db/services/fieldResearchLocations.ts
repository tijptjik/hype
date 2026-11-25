// DRIZZLE
import { sql } from 'drizzle-orm'
import { canonicalLocationSQL, locationAliasIds } from './locationRedirect.js'
import { relationshipScopeSql } from './locationRelationships.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { SQL } from 'drizzle-orm'

/** Build the scoped containment query so reads and the write fence use the same evidence.
 * @param root Location ID. @param organisationId Owning organisation. @param includeParts Whether to include building parts.
 * @returns Bounded query of current accessible descendants including the root.
 */
export function researchLocationDescendantsSQL(
  root: string | SQL,
  organisationId: string | SQL,
  includeParts: boolean,
): SQL {
  // Unary + excludes the two low-selectivity states from index selection so SQLite seeks each parent's aliases.
  return sql`WITH RECURSIVE children(id,kind) AS (
    SELECT l.id,l.matchingType FROM location l WHERE l.id=${root}
    UNION
    SELECT child.id,child.matchingType FROM children parent
    JOIN locationMembershipHead r ON r.parentLocationId IN ${locationAliasIds(sql`parent.id`)}
    JOIN location endpoint ON endpoint.id=r.childLocationId
    JOIN location child ON child.id=CASE WHEN endpoint.redirectTargetId IS NULL THEN endpoint.id ELSE ${canonicalLocationSQL(sql`r.childLocationId`)} END
    WHERE +r.assertionState='asserted' AND +r.membershipState='current' AND (r.effectiveFrom IS NULL OR r.effectiveFrom<=date('now')) AND (r.effectiveTo IS NULL OR r.effectiveTo>date('now'))
    AND ${relationshipScopeSql('locationMembership', organisationId)}
    AND child.state!='redirect' AND (child.state!='manual' OR child.ownerOrganisationId=${organisationId})
    AND ((parent.kind='premises' AND child.matchingType='building') OR (${includeParts ? 1 : 0}=1 AND parent.kind IN ('building','building_part') AND child.matchingType='building_part'))
  ) SELECT id,kind FROM children LIMIT 5001`
}

/** Count the expansion targets already included in this session, excluding the root.
 * @param root Outer Location ID. @param organisationId Session scope. @param sessionId Session identity.
 * @returns JSON object with the eligible and already included counts.
 */
export function researchLocationInclusionSQL(
  root: SQL,
  organisationId: string | SQL,
  sessionId: SQL,
): SQL {
  return sql`(SELECT json_object('total',count(*),'included',count(selected.locationId))
    FROM (${researchLocationDescendantsSQL(root, organisationId, true)}) target
    LEFT JOIN fieldResearchSessionLocation selected ON selected.sessionId=${sessionId} AND selected.locationId=target.id
    WHERE target.id!=${root})`
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
