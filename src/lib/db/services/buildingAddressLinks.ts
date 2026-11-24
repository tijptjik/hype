// DRIZZLE
import { sql, type SQL, type SQLWrapper } from 'drizzle-orm'
// SERVICES
import { canonicalLocationSQL } from './locationRedirect'
import { relationshipScopeSql } from './locationRelationships'
import { guardedRelationshipInsert } from './locationRelationshipReview'
// SCHEMA
import { locationAddress, type addressRevision } from '../schema/locationRelationships'
// TYPES
import type { Database } from '#lib/types.js'
import type { BatchItem } from 'drizzle-orm/batch'

// TOC: Effective address reads | Reviewed address writes
/** Select currently effective address assertions and their exact canonical revisions.
 * @param scope Authorized organisation, or shared scope. @returns SQL following a SELECT projection.
 */
export function currentAddressLinks(scope: string | null): SQL {
  return sql`FROM locationAddressHead r JOIN addressRevision ar ON ar.id=r.addressRevisionId
    WHERE ${relationshipScopeSql('locationAddress', scope)} AND r.assertionState='asserted' AND r.addressState='current'
    AND (r.effectiveFrom IS NULL OR r.effectiveFrom<=date('now'))
    AND (r.effectiveTo IS NULL OR r.effectiveTo>date('now'))`
}

/** Find the published footprint reused by a shared Building import.
 * @param id Location identity. @param state Location visibility state. @returns Published building ID for grouping discovery results.
 */
export function sharedBuildingSourceId(
  id: SQLWrapper,
  state: SQLWrapper,
): SQL<string | null> {
  return sql`(SELECT json_extract(v.rawSource,'$.buildingSource.id') FROM locationRevision v
    WHERE v.locationId=${id} AND ${state}!='manual' AND json_extract(v.rawSource,'$.kind')='building-export-baseline'
    ORDER BY v.version DESC LIMIT 1)`
}

/** Read reviewed addresses for presentation without inventing an overall range.
 * @param locationId Current Location identity. @param scope Authorized organisation.
 * @returns JSON array of published address labels in presentation order.
 */
export function linkedAddressLabels(
  locationId: SQLWrapper,
  scope: string | null,
): SQL<string> {
  return sql<string>`(SELECT json_group_array(label) FROM (SELECT coalesce(json_extract(ar.components,'$.i18n.en.formattedAddress'),
    (SELECT json_extract(value,'$.formattedAddress') FROM json_each(ar.components,'$.i18n') LIMIT 1)) label
    ${currentAddressLinks(scope)} AND ${canonicalLocationSQL(sql`r.locationId`)}=${locationId}
    ORDER BY r.priority IS NULL,r.priority,label,r.relationshipId))`
}

/** Link a reviewed set together. Existing effective links are reused across retries and concurrent saves.
 * @param db Request database. @param locationId Existing building. @param scope Authorized assertion scope.
 * @param revisions Server-verified canonical addresses. @param actorId Authenticated editor. @returns Once every link is committed.
 */
export async function linkBuildingAddressRevisions(
  db: Database,
  locationId: string,
  scope: string | null,
  revisions: (typeof addressRevision.$inferSelect)[],
  actorId: string,
): Promise<void> {
  const statements = revisions.map(revision => {
    const id = crypto.randomUUID()
    // Resolve the effective scoped link inside the transaction, including retained merge aliases.
    const missing = sql`NOT EXISTS(SELECT 1 ${currentAddressLinks(scope)}
      AND ${canonicalLocationSQL(sql`r.locationId`)}=${locationId} AND ar.addressId=${revision.addressId})`
    return guardedRelationshipInsert(
      db,
      locationAddress,
      {
        id,
        relationshipId: id,
        locationId,
        scopeOrganisationId: scope,
        actorId,
        assertionState: 'asserted',
        addressState: 'current',
        addressRevisionId: revision.id,
        evidence: JSON.stringify([
          {
            source: {
              kind: 'record',
              resourceType: 'addressRevision',
              revisionId: revision.id,
            },
            supports: ['addressState'],
            description: 'Publisher address reviewed for this building.',
            quotedText: null,
            sourceDate: null,
          },
        ]),
        provenance: JSON.stringify({ process: 'reviewed-building-address' }),
      },
      missing,
    )
  })
  if (statements.length)
    await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
}
