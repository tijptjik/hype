import { canonicalLocationSQL } from './locationRedirect'
// DRIZZLE
import { sql } from 'drizzle-orm'
// SCHEMA
import {
  locationTransition,
  locationTransitionParticipant,
} from '../schema/locationRelationships'
// DOMAIN
import {
  RelationshipInputSchema,
  TransitionInputSchema,
} from '#lib/locations/relationships.js'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'
import type {
  RelationshipInput,
  TransitionInput,
  RelationshipEvidence,
} from '#lib/locations/relationships.js'

// ═══════════════════════
// TABLE OF CONTENTS
// 1. ASSERTION VALIDATION AND WRITES
// 2. SCOPED GROUPING READS
// ---

const tables = ['locationAddress', 'locationMembership', 'locationOccupancy'] as const
export type RelationshipTable = (typeof tables)[number]

/** Resolve visibility of retained evidence before publishing a relationship.
 * @param db Request database. @param evidence Minimal immutable references.
 * @param scope Authorised assertion scope. @param fields Allowed assertion field paths.
 * @returns Nothing; rejects missing or privately scoped references.
 */
async function validateEvidence(
  db: Database,
  evidence: RelationshipEvidence[],
  scope: string | null,
  fields: string[],
): Promise<void> {
  for (const item of evidence) {
    if (item.supports.some(field => !fields.includes(field)))
      throw new Error('Evidence supports an unknown assertion field')
    if (item.source.kind === 'url') continue
    // Image evidence needs the image authorization and immutable content resolver before it can be asserted here.
    if (item.source.kind === 'image')
      throw new Error(
        'Use a retained record or source URL for this relationship evidence',
      )
    const { resourceType, revisionId } = item.source
    let guard: SQL
    if (resourceType === 'locationRevision')
      guard = sql`SELECT 1 FROM locationRevision r JOIN location l ON l.id=r.locationId WHERE r.id=${revisionId} AND (l.state!='manual' OR l.ownerOrganisationId IS ${scope})`
    else if (resourceType === 'addressRevision')
      guard = sql`SELECT 1 FROM addressRevision WHERE id=${revisionId}`
    else
      guard = sql`SELECT 1 FROM ${sql.identifier(resourceType)} WHERE id=${revisionId} AND (scopeOrganisationId IS NULL OR scopeOrganisationId IS ${scope})`
    if (!(await db.get(guard)))
      throw new Error('Evidence reference unavailable in this scope')
  }
}

/** Encode one validated row as a bounded insert (well below D1's 100 parameter limit).
 * @param db Request database. @param table Server-selected table. @param values Validated fields.
 * @returns Prepared single-row statement; database constraints provide the atomic head fence.
 */
function insertAssertion(db: Database, table: string, values: Record<string, unknown>) {
  const columns = Object.keys(values)
  return db.run(
    sql`INSERT INTO ${sql.identifier(table)} (${sql.join(
      columns.map(k => sql.identifier(k)),
      sql`,`,
    )}) VALUES (${sql.join(
      columns.map(
        k =>
          sql`${typeof values[k] === 'object' && values[k] !== null ? JSON.stringify(values[k]) : values[k]}`,
      ),
      sql`,`,
    )})`,
  )
}

/** Append a relationship in an already authorized authoring scope.
 * @param db Request database. @param raw Desired complete assertion and expected scoped head.
 * @param actorId Authenticated actor, never taken from the submitted assertion.
 * @returns Exact immutable revision ID. Retrying the same ID/content is a no-op.
 * @remarks Root/successor uniqueness rejects competing writes. No Feature is moved here.
 */
export async function appendLocationRelationship(
  db: Database,
  raw: RelationshipInput,
  actorId: string,
): Promise<string> {
  const input = RelationshipInputSchema.parse(raw)
  const { table, effectiveFrom, effectiveTo, ...fields } = input
  await validateEvidence(
    db,
    input.evidence,
    input.scopeOrganisationId,
    Object.keys(fields).concat(['effectiveFrom', 'effectiveTo']),
  )
  const values = {
    ...fields,
    effectiveFrom: effectiveFrom?.value ?? null,
    effectiveFromPrecision: effectiveFrom?.precision ?? null,
    effectiveTo: effectiveTo?.value ?? null,
    effectiveToPrecision: effectiveTo?.precision ?? null,
    actorId,
    provenance: { process: 'relationship-editor' },
  }
  const existing = await db.get<Record<string, unknown>>(
    sql`SELECT * FROM ${sql.identifier(table)} WHERE id=${input.id}`,
  )
  if (existing) {
    for (const [key, value] of Object.entries(values)) {
      let retained = ['evidence', 'provenance'].includes(key)
        ? JSON.parse(String(existing[key]))
        : existing[key]
      // Alias-equivalent endpoints replay without rewriting the retained historical assertion.
      let compared = value
      if (
        [
          'locationId',
          'childLocationId',
          'parentLocationId',
          'establishmentLocationId',
          'containerLocationId',
        ].includes(key) &&
        value &&
        retained
      ) {
        compared = (await db.get<{ id: string }>(
          sql`SELECT ${canonicalLocationSQL(sql`${value}`)} id`,
        ))!.id
        retained = (await db.get<{ id: string }>(
          sql`SELECT ${canonicalLocationSQL(sql`${retained}`)} id`,
        ))!.id
      }
      if (JSON.stringify(retained) !== JSON.stringify(compared))
        throw new Error('Revision ID already used for a different assertion')
    }
    return input.id
  }
  // New assertions use current identities; retained predecessor rows and replay content remain untouched.
  const endpointKeys =
    table === 'locationAddress'
      ? ['locationId']
      : table === 'locationMembership'
        ? ['childLocationId', 'parentLocationId']
        : ['establishmentLocationId', 'containerLocationId']
  for (const key of endpointKeys) {
    const record = values as Record<string, unknown>
    if (record[key])
      record[key] = (await db.get<{ id: string }>(
        sql`SELECT ${canonicalLocationSQL(sql`${record[key]}`)} id`,
      ))!.id
  }
  await insertAssertion(db, table, values)
  return input.id
}

/** Append a complete evidenced lineage event and participant set in one D1 transaction.
 * @param db Request database. @param raw Validated event and exact participants.
 * @param actorId Authenticated author. @returns Immutable event revision ID.
 * @remarks The event alone never redirects an identity or transfers occupants or Features.
 */
export async function appendLocationTransition(
  db: Database,
  raw: TransitionInput,
  actorId: string,
): Promise<string> {
  const input = TransitionInputSchema.parse(raw)
  const { relationshipId, before, after, effectiveFrom, effectiveTo, ...fields } = input
  await validateEvidence(
    db,
    input.evidence,
    input.scopeOrganisationId,
    Object.keys(fields).concat(['before', 'after', 'effectiveFrom', 'effectiveTo']),
  )
  const values = {
    ...fields,
    transitionId: relationshipId,
    effectiveFrom: effectiveFrom?.value ?? null,
    effectiveFromPrecision: effectiveFrom?.precision ?? null,
    effectiveTo: effectiveTo?.value ?? null,
    effectiveToPrecision: effectiveTo?.precision ?? null,
    actorId,
    provenance: { process: 'transition-editor' },
  }
  const existing = await db.get<Record<string, unknown>>(
    sql`SELECT * FROM locationTransition WHERE id=${input.id}`,
  )
  if (existing) {
    for (const [key, value] of Object.entries(values)) {
      const retained = ['evidence', 'provenance'].includes(key)
        ? JSON.parse(String(existing[key]))
        : existing[key]
      if (JSON.stringify(retained) !== JSON.stringify(value))
        throw new Error('Transition ID already used for different evidence')
    }
    const participants = await db.all<{ locationId: string; side: 'before' | 'after' }>(
      sql`SELECT locationId,side FROM locationTransitionParticipant WHERE transitionRevisionId=${input.id}`,
    )
    for (const side of ['before', 'after'] as const)
      if (
        JSON.stringify(
          participants
            .filter(p => p.side === side)
            .map(p => p.locationId)
            .sort(),
        ) !== JSON.stringify([...input[side]].sort())
      )
        throw new Error('Transition participant set differs from retained evidence')
    return input.id
  }
  // Each participant is its own three-parameter statement, avoiding unbounded bulk SQL.
  const queries: BatchItem<'sqlite'>[] = [db.insert(locationTransition).values(values)]
  for (const side of ['before', 'after'] as const)
    for (const id of input[side])
      queries.push(
        db
          .insert(locationTransitionParticipant)
          .values({ transitionRevisionId: input.id, locationId: id, side }),
      )
  await db.batch(queries as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  return input.id
}

/** Build a scope resolver before filtering endpoints, so scoped corrections fully replace baselines.
 * @param table Trusted table identifier. @param scope Authorized Organisation or shared-only view.
 * @returns SQL predicate for the current resolved assertion; suppression remains explicit.
 */
export function relationshipScopeSql(
  table: RelationshipTable | 'locationTransition',
  scope: string | null,
): SQL {
  const root = table === 'locationTransition' ? 'transitionId' : 'relationshipId'
  return sql`(r.scopeOrganisationId IS ${scope} OR (r.scopeOrganisationId IS NULL AND NOT EXISTS(SELECT 1 FROM ${sql.identifier(table + 'Head')} o WHERE o.${sql.identifier(root)}=r.${sql.identifier(root)} AND o.scopeOrganisationId IS ${scope} AND ${scope} IS NOT NULL)))`
}

/** Read bounded authorized groupings without exposing raw evidence or private endpoint counts.
 * @param db Request database. @param locationId Visible subject identity.
 * @param scope Authorized Organisation or shared-only view. @returns Resolved address, membership and tenancy assertions.
 */
export async function readLocationRelationships(
  db: Database,
  locationId: string,
  scope: string | null,
): Promise<Record<RelationshipTable, Record<string, unknown>[]>> {
  const result = {} as Record<RelationshipTable, Record<string, unknown>[]>
  for (const table of tables) {
    const endpoints =
      table === 'locationAddress'
        ? ['locationId']
        : table === 'locationMembership'
          ? ['childLocationId', 'parentLocationId']
          : ['establishmentLocationId', 'containerLocationId']
    const visible = endpoints.map(
      key =>
        sql`(r.${sql.identifier(key)} IS NULL OR EXISTS(SELECT 1 FROM location l WHERE l.id=${canonicalLocationSQL(sql`r.${sql.identifier(key)}`)} AND (l.state!='manual' OR l.ownerOrganisationId IS ${scope})))`,
    )
    const subject = sql.join(
      endpoints.map(
        key =>
          sql`${canonicalLocationSQL(sql`r.${sql.identifier(key)}`)}=${locationId}`,
      ),
      sql` OR `,
    )
    const labels = endpoints.map(
      key =>
        sql`(SELECT COALESCE(json_extract(v.facts,'$.common.names.en'),json_extract(v.facts,'$.names.en'),l.id) FROM location l LEFT JOIN locationRevision v ON v.locationId=l.id WHERE l.id=${canonicalLocationSQL(sql`r.${sql.identifier(key)}`)} ORDER BY v.sequence DESC LIMIT 1) AS ${sql.identifier(key + 'Label')}`,
    )
    const addressLabel =
      table === 'locationAddress'
        ? sql`,(SELECT trim(COALESCE(json_extract(a.components,'$.i18n.en.streetNumber'),'') || ' ' || COALESCE(json_extract(a.components,'$.i18n.en.streetName'),'')) FROM addressRevision a WHERE a.id=r.addressRevisionId) AS addressLabel`
        : sql``
    const rows = await db.all<Record<string, unknown>>(
      sql`SELECT r.*,${sql.join(labels, sql`,`)}${addressLabel} FROM ${sql.identifier(table + 'Head')} r WHERE ${relationshipScopeSql(table, scope)} AND (${subject}) AND ${sql.join(visible, sql` AND `)} ORDER BY ${table === 'locationAddress' ? sql`r.priority IS NULL,r.priority,` : sql``} r.relationshipId LIMIT 100`,
    )
    // Evidence is deliberately not included in catalogue reads; references need independent authorization.
    result[table] = rows.map(({ evidence, provenance, actorId, ...row }) => row)
  }
  return result
}
