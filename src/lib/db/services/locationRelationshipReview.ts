import {
  locationAddress,
  locationRelationshipOperation,
  type locationTransition,
  type locationTransitionParticipant,
} from '../schema/locationRelationships'
import { canonicalLocationSQL, locationAliasIds } from './locationRedirect'
// DRIZZLE
import { getTableColumns, sql, type SQL } from 'drizzle-orm'
// DOMAIN
import { relationshipScopeSql, type RelationshipTable } from './locationRelationships'
// TYPES
import type { Database } from '#lib/types.js'
import type { BatchItem } from 'drizzle-orm/batch'

// ═══════════════════════
// TABLE OF CONTENTS
// 1. GUARDED WRITES
// 2. SCOPED RELATIONSHIP PAGES
// 3. ATOMIC ADDRESS ORDERING
// 4. LINEAGE PAGES
// ---

const endpoints = {
  locationAddress: ['locationId'],
  locationMembership: ['childLocationId', 'parentLocationId'],
  locationOccupancy: ['establishmentLocationId', 'containerLocationId'],
} as const

/** Match either canonical endpoint while respecting private counterpart visibility.
 * @param table Relationship kind. @param locationId Subject identity. @param scope Read scope.
 * @returns Predicate for a relationship row aliased as r.
 */
function visibleRelationshipSubject(
  table: RelationshipTable,
  locationId: string | SQL,
  scope: string | null | SQL,
): SQL {
  const keys = endpoints[table]
  const visible = keys.map(
    key =>
      sql`(r.${sql.identifier(key)} IS NULL OR EXISTS(SELECT 1 FROM location l WHERE l.id=${canonicalLocationSQL(sql`r.${sql.identifier(key)}`)} AND (l.state!='manual' OR l.ownerOrganisationId IS ${scope})))`,
  )
  const subject = sql.join(
    keys.map(key => sql`r.${sql.identifier(key)} IN ${locationAliasIds(locationId)}`),
    sql` OR `,
  )
  return sql`(${subject}) AND ${sql.join(visible, sql` AND `)}`
}

/** Match a lineage participant only when every participant is visible.
 * @param locationId Subject identity. @param scope Read scope. @returns Predicate for transition r.
 */
function visibleLineageSubject(
  locationId: string | SQL,
  scope: string | null | SQL,
): SQL {
  return sql`EXISTS(SELECT 1 FROM locationTransitionParticipant p WHERE p.transitionRevisionId=r.id AND p.locationId IN ${locationAliasIds(locationId)}) AND NOT EXISTS(SELECT 1 FROM locationTransitionParticipant p JOIN location l ON l.id=${canonicalLocationSQL(sql`p.locationId`)} WHERE p.transitionRevisionId=r.id AND l.state='manual' AND l.ownerOrganisationId IS NOT ${scope})`
}

/** Check the four editor sections for an asserted relationship in the selected scope.
 * @param locationId Subject identity. @param scope Authorised organisation. @returns Boolean SQL expression.
 */
export function hasLocationRelationshipsSQL(locationId: SQL, scope: SQL): SQL {
  const matches = (Object.keys(endpoints) as RelationshipTable[]).map(
    table =>
      sql`EXISTS(SELECT 1 FROM ${sql.identifier(table + 'Head')} r
      WHERE r.assertionState='asserted' AND ${relationshipScopeSql(table, scope)}
        AND ${visibleRelationshipSubject(table, locationId, scope)})`,
  )
  matches.push(sql`EXISTS(SELECT 1 FROM locationTransitionHead r WHERE r.assertionState='asserted'
    AND ${relationshipScopeSql('locationTransition', scope)} AND ${visibleLineageSubject(locationId, scope)})`)
  return sql`(${sql.join(matches, sql` OR `)})`
}

/** Prepare a guarded insert for a D1 atomic batch; do not execute raw db.run promises in a batch.
 * @param db Request database.
 * @param table Trusted relationship schema.
 * @param values Validated database values.
 * @param guard Transaction receipt.
 * @returns Deferred batch statement.
 */
export function guardedRelationshipInsert(
  db: Database,
  table:
    | typeof locationAddress
    | typeof locationRelationshipOperation
    | typeof locationTransition
    | typeof locationTransitionParticipant,
  values: Record<string, unknown>,
  guard: SQL,
): BatchItem<'sqlite'> {
  const columns = Object.values(getTableColumns(table))
  return db.insert(table).select(
    sql`SELECT ${sql.join(
      columns.map(c =>
        values[c.name] !== undefined
          ? sql`${values[c.name]}`
          : c.name === 'recordedAt'
            ? sql`strftime('%Y-%m-%dT%H:%M:%fZ','now')`
            : sql`NULL`,
      ),
      sql`,`,
    )} WHERE ${guard}`,
  )
}
/** Read one authorized page of current assertions or immutable versions.
 * @param db Request database.
 * @param input Subject, persisted scope and keyset cursor.
 *
 * @returns Visible rows and a cursor; neither private endpoints nor their counts leak.
 */
export async function readRelationshipPage(
  db: Database,
  input: {
    locationId: string
    scope: string | null
    table: RelationshipTable
    history?: boolean
    afterId?: string
    limit?: number
  },
): Promise<{ rows: Record<string, unknown>[]; nextCursor: string | null }> {
  const keys = endpoints[input.table]
  const limit = Math.min(100, Math.max(1, input.limit ?? 25))
  const scope = input.history
    ? sql`(r.scopeOrganisationId IS NULL OR r.scopeOrganisationId IS ${input.scope})`
    : relationshipScopeSql(input.table, input.scope)
  const labels = keys.map(
    key =>
      sql`(SELECT COALESCE(NULLIF(json_extract(v.facts,'$.i18n.en.name'),''),NULLIF(json_extract(v.facts,'$.i18n.en.displayAddressOverride'),''),NULLIF(json_extract(v.facts,'$.i18n.en.displayAddress'),''),NULLIF(json_extract(v.facts,'$.common.location.address.authored.i18n.en.formattedAddress'),''),trim(coalesce(json_extract(v.facts,'$.common.location.address.authored.i18n.en.buildingNumberExpression'),'')||' '||json_extract(v.facts,'$.common.location.address.authored.i18n.en.streetName')),l.id) FROM location l LEFT JOIN locationRevisionContent v ON v.locationId=l.id WHERE l.id=${canonicalLocationSQL(sql`r.${sql.identifier(key)}`)} ORDER BY v.version DESC LIMIT 1) AS ${sql.identifier(key + 'Label')}`,
  )
  // Read the street number separately so building names and unit numbers never affect ranking.
  const addressFields =
    input.table === 'locationAddress'
      ? sql`, COALESCE(json_extract(a.components,'$.i18n.en.formattedAddress'),a.id) AS addressLabel,
          (SELECT COALESCE(NULLIF(fields.value->>'buildingNumberExpression',''),
                           NULLIF(fields.value->>'streetNumber',''),
                           NULLIF(fields.value->>'buildingNumberFrom','') ||
                             COALESCE(COALESCE(NULLIF(fields.value->>'buildingNumberConnector',''),'-') ||
                                      NULLIF(fields.value->>'buildingNumberTo',''),''))
             AS number FROM json_each(a.components,'$.i18n') fields
           WHERE number IS NOT NULL ORDER BY fields.key != 'en', fields.key LIMIT 1) AS streetNumber`
      : sql``
  const outlineFields =
    input.table === 'locationMembership'
      ? sql`, json_extract(r.provenance,'$.outlineRole') outlineRole,
       EXISTS(SELECT 1 FROM locationMembership root JOIN location p ON p.id=r.parentLocationId WHERE root.id=r.relationshipId AND root.provenance->>'$.process'='physical-building-composition' AND p.ownerOrganisationId=${input.scope}) canReviewOutline`
      : sql``
  const addressJoin =
    input.table === 'locationAddress'
      ? sql`LEFT JOIN addressRevision a ON a.id=r.addressRevisionId`
      : sql``
  const rows = await db.all<Record<string, unknown>>(
    sql`SELECT r.*,${sql.join(labels, sql`,`)}${addressFields}${outlineFields} FROM ${sql.identifier(input.table + (input.history ? '' : 'Head'))} r ${addressJoin} WHERE ${visibleRelationshipSubject(input.table, input.locationId, input.scope)} AND ${scope} AND r.id>${input.afterId ?? ''} ORDER BY r.id LIMIT ${limit + 1}`,
  )
  return {
    rows: rows.slice(0, limit).map(({ evidence, provenance, actorId, ...row }) => row),
    nextCursor: rows.length > limit ? String(rows[limit - 1].id) : null,
  }
}

/** Atomically reprioritize an exact resolved address set, retaining all former versions.
 * @param db Request database.
 * @param input Authorized subject, scope and ordered immutable heads.
 * @param actorId Authenticated editor.
 * @returns New immutable IDs, or stale conflict without partial writes.
 * @remarks An empty order explicitly clears all priorities. The expected set still fences every head.
 */
export async function reorderLocationAddresses(
  db: Database,
  input: {
    locationId: string
    scope: string | null
    expectedIds: string[]
    orderedIds: string[]
    operationId: string
  },
  actorId: string,
): Promise<{ status: 'applied' | 'replayed' | 'conflict'; ids: string[] }> {
  if (
    !actorId ||
    !input.operationId ||
    input.expectedIds.length > 100 ||
    new Set(input.expectedIds).size !== input.expectedIds.length ||
    new Set(input.orderedIds).size !== input.orderedIds.length ||
    (input.orderedIds.length &&
      (input.orderedIds.length !== input.expectedIds.length ||
        input.orderedIds.some(id => !input.expectedIds.includes(id))))
  )
    throw new Error('Provide the exact address set once, in the desired order')
  // Scope must still be valid when the batch starts, including an empty ordering receipt.
  const visible = sql`EXISTS(SELECT 1 FROM location WHERE id=${input.locationId}
    AND (state!='manual' OR ownerOrganisationId IS ${input.scope}))`
  if (!(await db.get(sql`SELECT 1 WHERE ${visible}`)))
    return { status: 'conflict', ids: [] }
  const expected = JSON.stringify([...input.expectedIds].sort())
  const current = sql`(SELECT json_group_array(id) FROM (SELECT r.id FROM locationAddressHead r WHERE  ${canonicalLocationSQL(sql`r.locationId`)}=${input.locationId} AND r.assertionState='asserted' AND r.addressState='current' AND ${relationshipScopeSql('locationAddress', input.scope)} ORDER BY r.id))`
  const rows = await db.all<Record<string, unknown>>(
    sql`SELECT * FROM locationAddress WHERE id IN(SELECT value FROM json_each(${expected})) ORDER BY id`,
  )
  if (
    rows.length !== input.expectedIds.length ||
    rows.some(
      r => r.scopeOrganisationId !== null && r.scopeOrganisationId !== input.scope,
    )
  )
    return { status: 'conflict', ids: [] }
  const ids = rows.map((_row, index) => input.operationId + ':' + index)
  const existing = await db.all<{ id: string; provenance: string }>(
    sql`SELECT id,provenance FROM locationAddress WHERE id IN(SELECT value FROM json_each(${JSON.stringify(ids)}))`,
  )
  const receipt = JSON.stringify({
    process: 'address-order',
    operationId: input.operationId,
    locationId: input.locationId,
    scope: input.scope,
    expectedIds: [...input.expectedIds].sort(),
    orderedIds: input.orderedIds,
    actorId,
  })
  const operation = await db.get<{ rawSource: string }>(
    sql`SELECT rawSource FROM locationRelationshipOperation WHERE id=${input.operationId}`,
  )
  if (operation)
    return operation.rawSource === receipt &&
      existing.length === ids.length &&
      existing.every(r => r.provenance === receipt)
      ? { status: 'replayed', ids }
      : { status: 'conflict', ids: [] }
  if (existing.length)
    return existing.length === ids.length &&
      existing.every(r => r.provenance === receipt)
      ? { status: 'replayed', ids }
      : { status: 'conflict', ids: [] }
  if (
    (await db.get<{ value: string }>(sql`SELECT ${current} value`))?.value !== expected
  )
    return { status: 'conflict', ids: [] }
  // A temporary transaction receipt makes the initial set guard apply once, before any head advances.
  const queries: BatchItem<'sqlite'>[] = [
    guardedRelationshipInsert(
      db,
      locationRelationshipOperation,
      {
        id: input.operationId,
        scopeOrganisationId: input.scope,
        locationId: input.locationId,
        rawSource: receipt,
      },
      sql`${visible} AND ${current}=${expected}`,
    ),
  ]
  for (const [i, row] of rows.entries()) {
    const { recordedAt: _recordedAt, ...copy } = row
    const sameScope = row.scopeOrganisationId === input.scope
    const values = {
      ...copy,
      locationId: input.locationId,
      id: ids[i],
      scopeOrganisationId: input.scope,
      previousRevisionId: sameScope ? row.id : null,
      priority: input.orderedIds.length
        ? input.orderedIds.indexOf(String(row.id))
        : null,
      actorId,
      provenance: receipt,
    }
    queries.push(
      guardedRelationshipInsert(
        db,
        locationAddress,
        values,
        sql`EXISTS(SELECT 1 FROM locationRelationshipOperation WHERE id=${input.operationId} AND rawSource=${receipt})`,
      ),
    )
  }
  await db.batch(queries as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  const done = await db.get(
    sql`SELECT id FROM locationRelationshipOperation WHERE id=${input.operationId} AND rawSource=${receipt}`,
  )
  return done ? { status: 'applied', ids } : { status: 'conflict', ids: [] }
}

/** Read lineage events and participants only when every endpoint is visible in this scope.
 * @param db Request database.
 * @param input Subject, scope and immutable cursor.
 *
 * @returns One bounded page of real-world or identity-correction lineage, without inferred redirects.
 */
export async function readLocationLineage(
  db: Database,
  input: {
    locationId: string
    scope: string | null
    afterId?: string
    history?: boolean
  },
): Promise<{
  rows: (Record<string, unknown> & {
    participants: { locationId: string; side: string; label?: string }[]
  })[]
  nextCursor: string | null
}> {
  const rows = await db.all<Record<string, unknown>>(
    sql`SELECT r.*,(SELECT json_group_array(json_object('locationId',p.locationId,'side',p.side,'label',(SELECT COALESCE(json_extract(v.facts,'$.i18n.en.name'),p.locationId) FROM locationRevisionContent v WHERE v.locationId=p.locationId ORDER BY v.version DESC LIMIT 1))) FROM locationTransitionParticipant p WHERE p.transitionRevisionId=r.id) participants FROM ${sql.identifier('locationTransition' + (input.history ? '' : 'Head'))} r WHERE ${input.history ? sql`(r.scopeOrganisationId IS NULL OR r.scopeOrganisationId IS ${input.scope})` : relationshipScopeSql('locationTransition', input.scope)} AND r.id>${input.afterId ?? ''} AND ${visibleLineageSubject(input.locationId, input.scope)} ORDER BY r.id LIMIT 26`,
  )
  return {
    rows: rows.slice(0, 25).map(({ provenance, actorId, ...r }) => ({
      ...r,
      evidence: JSON.parse(String(r.evidence)),
      participants: JSON.parse(String(r.participants)),
    })),
    nextCursor: rows.length > 25 ? String(rows[24].id) : null,
  }
}
