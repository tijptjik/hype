// DRIZZLE
import { sql, type SQL, type SQLWrapper } from 'drizzle-orm'
// DOMAIN
import { resolveFeatureLocation } from '#lib/locations/resolve.js'
import type { LocationFacts, FeatureLocationOverrides } from '#lib/locations/model.js'
// SERVICES
import { locationFactsFieldSql } from './locationFactsSql'
import { sharedLocationFacts } from './locationShared'
import type { Database } from '#lib/types.js'

/** Build effective search expressions before pagination, using the same layer order as display.
 * @param db Database. @param id Trusted Location identity expression. @param facts Source facts column.
 * @param organisationId Authorized Organisation scope, or null for shared-only reads.
 * @returns Fixed-field SQL expressions; legacy fixtures without shared storage retain source reads.
 */
export async function locationReadFields(
  db: Database,
  id: SQLWrapper,
  facts: SQLWrapper,
  organisationId: SQLWrapper,
): Promise<Record<'names' | 'location' | 'operatingStatus' | 'buildingStatus', SQL>> {
  const storage = await db.get<{ n: number }>(
    sql`SELECT 1 n FROM sqlite_master WHERE name='locationSharedRevision' AND type='table' LIMIT 1`,
  )
  const overrides = sql`(SELECT overrides FROM organisationLocationHead WHERE locationId=${id} AND organisationId=${organisationId})`
  /** Resolve a fixed field below Organisation overrides. @param field Known field. @returns Hype effective value. */
  const shared = (
    field: 'names' | 'location' | 'operatingStatus' | 'buildingStatus',
  ): SQL => {
    const source = locationFactsFieldSql(facts, field)
    if (!storage?.n) return source
    const entry = sql`(SELECT json_extract(corrections,${`$.${field}`}) FROM locationSharedHead WHERE locationId=${id})`
    return sql`CASE WHEN json_extract(${entry},'$.supersededBy') IS NULL THEN CASE json_extract(${entry},'$.choice.mode') WHEN 'override' THEN json_extract(${entry},'$.choice.value') WHEN 'clear' THEN ${field === 'names' ? '{}' : null} ELSE ${source} END ELSE ${source} END`
  }
  /** Ignore follow-policy overrides when their underlying evidence changed. @param field Known field. @param value Hype value. @returns Applicable override object. */
  const applicable = (field: string, value: SQL): SQL =>
    sql`CASE WHEN json_extract(${overrides},${`$.freshness.${field}.mode`})='follow' AND json_extract(${overrides},${`$.freshness.${field}.original`}) IS NOT ${value} THEN NULL ELSE json_extract(${overrides},${`$.${field}`}) END`
  const names = shared('names'),
    choices = applicable('names', names)
  const result = {} as Record<
    'names' | 'location' | 'operatingStatus' | 'buildingStatus',
    SQL
  >
  // Union locale keys first so removed source names cannot remain searchable behind an override.
  result.names = sql`(SELECT json_group_object(locale,value) FROM (SELECT locale,CASE json_extract(${choices},'$.'||json_quote(locale)||'.mode') WHEN 'override' THEN json_extract(${choices},'$.'||json_quote(locale)||'.value') WHEN 'clear' THEN NULL ELSE json_extract(${names},'$.'||json_quote(locale)) END value FROM (SELECT key locale FROM json_each(${names}) UNION SELECT key locale FROM json_each(${choices}))) WHERE value IS NOT NULL)`
  for (const field of ['location', 'operatingStatus', 'buildingStatus'] as const) {
    const value = shared(field),
      choice = applicable(field, value)
    result[field] =
      sql`CASE json_extract(${choice},'$.mode') WHEN 'override' THEN json_extract(${choice},'$.value') WHEN 'clear' THEN NULL ELSE ${value} END`
  }
  return result
}

/** Read current Hype and scoped Organisation facts for discovery, never for historical acceptance.
 * @param db Database. @param locationId Accessible identity. @param facts Current source facts.
 * @param organisationId Authorized Organisation or null. @returns Effective current facts.
 */
export async function currentLocationFacts(
  db: Database,
  locationId: string,
  facts: LocationFacts,
  organisationId: string | null,
): Promise<LocationFacts> {
  const shared = (await sharedLocationFacts(db, locationId, facts)).facts
  const row = organisationId
    ? await db.get<{ overrides: string }>(
        sql`SELECT overrides FROM organisationLocationHead WHERE locationId=${locationId} AND organisationId=${organisationId}`,
      )
    : null
  const effective = resolveFeatureLocation(
    shared,
    shared.location,
    row ? (JSON.parse(row.overrides) as FeatureLocationOverrides) : {},
  )
  return {
    ...shared,
    ...effective,
    names: Object.fromEntries(
      Object.entries(effective.names).filter(
        (pair): pair is [string, string] => pair[1] !== null,
      ),
    ),
    branch: effective.branch ?? undefined,
    format: effective.format ?? undefined,
    branchId: effective.branchId ?? undefined,
    phoneNumber: effective.phoneNumber ?? [],
    brands: effective.brands ?? [],
    location: effective.location ?? shared.location,
  }
}
