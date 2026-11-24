// DRIZZLE
import { sql, type SQL } from 'drizzle-orm'
// DOMAIN
import {
  buildingStreetContent,
  streetFromContent,
  type BuildingStreet,
  type BuildingStreetsEdit,
} from '#lib/locations/buildingStreetAddresses.js'
// DB
import {
  address,
  addressRevision,
  locationAddress,
} from '../schema/locationRelationships'
import { canonicalAddressDigest } from './addressCanonical'
import { currentAddressLinks } from './buildingAddressLinks'
import { canonicalLocationSQL } from './locationRedirect'
import { prepareRevisionCheck } from './revisionBatch'
import {
  readLocationCurationLocks,
  locationCurationLockFence,
} from './locationCurationLocks'
// TYPES
import type { Database } from '#lib/types.js'
import type { BatchItem } from 'drizzle-orm/batch'

// TABLE OF CONTENTS
// 1. Current profile addresses
// 2. Atomic profile edits

type StreetHead = {
  head: string
  root: string
  scope: string | null
  revisionId: string
  contentHash: string
  components: string
  priority: number | null
}

/** Select effective authored building designations independently of publisher evidence.
 * @param locationId Visible building. @param scope Effective relationship scope. @returns SQL following SELECT.
 */
function profileStreets(locationId: string, scope: string | null): SQL {
  return sql`${currentAddressLinks(scope)} AND ${canonicalLocationSQL(sql`r.locationId`)}=${locationId}
    AND EXISTS(SELECT 1 FROM address a WHERE a.id=ar.addressId AND a.sourceKey->>'provider'='hype'
      AND a.sourceKey->>'family'='building-street')`
}

/** Read immutable street heads and content in stable editor order.
 * @param db Request database. @param locationId Authorized building. @param scope Effective scope.
 * @returns Address content, stable relationship roots and exact revision pins.
 */
async function streetHeads(
  db: Database,
  locationId: string,
  scope: string | null,
): Promise<StreetHead[]> {
  return db.all<StreetHead>(
    sql`SELECT r.id head,r.relationshipId root,r.scopeOrganisationId scope,ar.id revisionId,ar.contentHash,ar.components,r.priority
      ${profileStreets(locationId, scope)} ORDER BY r.priority IS NULL,r.priority,r.relationshipId`,
  )
}

/** Read only building-level rows authored through Profile.
 * @param db Request database. @param locationId Authorized building. @param scope Relationship scope.
 * @returns Editable address rows with revision pins.
 */
export async function readBuildingStreets(
  db: Database,
  locationId: string,
  scope: string | null,
): Promise<(BuildingStreet & { head: string })[]> {
  return (await streetHeads(db, locationId, scope)).map(row => ({
    ...streetFromContent(JSON.parse(row.components)),
    head: row.head,
    priority: row.priority,
  }))
}

/** Prepare address content and relationship revisions for the enclosing Profile save.
 * @param db Request database. @param locationId Authorized building. @param scope Authenticated relationship scope.
 * @param edit Complete draft and original head set. @param actorId Authenticated editor.
 * @returns Ordered statements, with all concurrency and lock checks inside the same transaction.
 */
export async function prepareBuildingStreets(
  db: Database,
  locationId: string,
  scope: string | null,
  edit: BuildingStreetsEdit,
  actorId: string,
): Promise<BatchItem<'sqlite'>[]> {
  const current = await streetHeads(db, locationId, scope)
  const existing = new Map(current.map(row => [row.head, row]))
  const locks = await readLocationCurationLocks(db, locationId)
  if (locks.openFields['location.address'] === false)
    throw new Error('Location address is locked')
  const expected = JSON.stringify([...edit.expectedHeads].sort())
  const statements: BatchItem<'sqlite'>[] = [
    prepareRevisionCheck(
      db,
      sql`
    EXISTS(SELECT 1 FROM location WHERE id=${locationId} AND matchingType='building' AND state!='redirect'
      AND (state!='manual' OR ownerOrganisationId IS ${scope}))
    AND ${locationCurationLockFence(locationId, locks)}
    AND (SELECT json_group_array(id) FROM (SELECT r.id ${profileStreets(locationId, scope)} ORDER BY r.id))=${expected}`,
    ),
  ]
  // Removing a designation appends a suppression. Its canonical content and earlier links remain available.
  const retained = new Set(edit.rows.map(row => row.head))
  for (const old of current.filter(row => !retained.has(row.head))) {
    statements.push(
      db.insert(locationAddress).values({
        id: crypto.randomUUID(),
        relationshipId: old.root,
        previousRevisionId: old.scope === scope ? old.head : null,
        locationId,
        scopeOrganisationId: scope,
        assertionState: 'suppressed',
        addressState: 'current',
        addressRevisionId: old.revisionId,
        priority: old.priority,
        evidence: [],
        actorId,
        provenance: { process: 'building-profile' },
      }),
    )
  }
  for (const row of edit.rows) {
    const old = row.head ? existing.get(row.head) : undefined
    if (row.head && !old)
      throw new Error('Building street addresses changed. Reload the profile.')
    const content = buildingStreetContent(row)
    const contentHash = await canonicalAddressDigest({
      components: content,
      geometry: null,
    })
    if (old?.contentHash === contentHash && old.priority === row.priority) continue
    const id = crypto.randomUUID()
    const root = old?.root ?? id
    let revisionId: string
    // Content-addressed revisions allow an edit to return to an earlier spelling or range.
    if (!old || old.contentHash !== contentHash) {
      // A scoped spelling correction gets a local address identity even when the relationship began in the shared profile.
      const sourceKey = {
        provider: 'hype',
        family: 'building-street',
        id: JSON.stringify([root, scope]),
      }
      const addressId = `address:${await canonicalAddressDigest(sourceKey)}`
      revisionId = `${addressId}:${contentHash}`
      statements.push(
        db.insert(address).values({ id: addressId, sourceKey }).onConflictDoNothing(),
      )
      statements.push(
        db
          .insert(addressRevision)
          .values({
            id: revisionId,
            addressId,
            components: content,
            scope: 'building',
            contentHash,
            sourceReferences: [],
            rawSource: { process: 'building-profile', locationId, actorId },
          })
          .onConflictDoNothing(),
      )
    } else revisionId = old.revisionId
    statements.push(
      db.insert(locationAddress).values({
        id,
        relationshipId: root,
        previousRevisionId: old?.scope === scope ? old.head : null,
        scopeOrganisationId: scope,
        locationId,
        assertionState: 'asserted',
        addressState: 'current',
        addressRevisionId: revisionId,
        priority: row.priority,
        evidence: [],
        actorId,
        provenance: { process: 'building-profile' },
      }),
    )
  }
  return statements
}
