// DRIZZLE
import { sql } from 'drizzle-orm'
// TYPES
import type { SQL, SQLWrapper } from 'drizzle-orm'

const paths = {
  names: '$.common.names',
  phoneNumber: '$.common.phoneNumber',
  brands: '$.details.brands',
  location: '$.common.location',
  operatingStatus: '$.details.operatingStatus',
  buildingStatus: '$.details.buildingStatus',
  successorLocationId: '$.common.successorLocationId',
} as const

/** Inline an escaped code-owned projection constant without spending a D1 binding.
 * @param value Fixed field name, JSON path or empty fallback, never request data.
 * @returns A SQL literal escaped by Drizzle.
 */
function projectionConstant(value: string | null): SQL {
  return sql`${value}`.inlineParams()
}

/** Read one fixed projection field without deserializing complete revision histories.
 * @param column Trusted revision facts column/expression, never client SQL.
 * @param field A known projection field; paths cannot be supplied by clients.
 * @returns A version-aware SQLite JSON expression.
 * @remarks Legacy paths serve retained fixtures/evidence only. Explicit unknown versions yield null.
 */
export function locationFactsFieldSql(
  column: SQLWrapper,
  field: keyof typeof paths,
): SQL {
  const result = sql`CASE json_extract(${column},'$.schemaVersion') WHEN 1 THEN json_extract(${column},${projectionConstant(paths[field])}) ELSE CASE WHEN json_type(${column},'$.schemaVersion') IS NULL THEN json_extract(${column},${projectionConstant(`$.${field}`)}) END END`
  return field === 'brands' || field === 'phoneNumber'
    ? sql`COALESCE(${result},'[]')`
    : result
}

/** Read a Feature's accepted shared field, including field-specific direct-save pins.
 * @param field Fixed facts field. @returns Accepted Hype value beneath Organisation overrides.
 * @remarks Requires the enclosing Feature projection aliases fp and pr. Never reads the shared head.
 */
export function acceptedLocationFactsFieldSql(field: keyof typeof paths): SQL {
  const source = locationFactsFieldSql(sql.raw('pr.facts'), field)
  const pin = sql`CASE WHEN EXISTS(SELECT 1 FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')=${projectionConstant(field)}) THEN (SELECT json_extract(j.value,'$.revision') FROM json_each(json_extract(fp.acceptancePolicy,'$.factsSharedFields')) j WHERE json_extract(j.value,'$.field')=${projectionConstant(field)}) ELSE json_extract(fp.acceptancePolicy,'$.factsSharedRevision') END`
  const entry = sql`(SELECT json_extract(s.corrections,${projectionConstant(`$.${field}`)}) FROM locationSharedRevision s WHERE s.id=${pin} AND s.locationId=fp.locationId)`
  return sql`CASE WHEN json_extract(${entry},'$.supersededBy') IS NULL THEN CASE json_extract(${entry},'$.choice.mode') WHEN 'override' THEN json_extract(${entry},'$.choice.value') WHEN 'clear' THEN ${projectionConstant(field === 'names' ? '{}' : field === 'brands' || field === 'phoneNumber' ? '[]' : null)} ELSE ${source} END ELSE ${source} END`
}

/** Resolve a pinned Organisation choice against its explicitly captured follow policy.
 * @param field Known field. @returns Applicable override object, or null after changed accepted evidence.
 */
export function acceptedLocationOverrideFieldSql(
  field: keyof typeof paths,
  includeShared = true,
): SQL {
  const underlying = includeShared
    ? acceptedLocationFactsFieldSql(field)
    : locationFactsFieldSql(sql.raw('pr.facts'), field)
  return sql`CASE WHEN json_extract(fp.acceptedOverrides,${projectionConstant(`$.freshness.${field}.mode`)})='follow' AND json_extract(fp.acceptedOverrides,${projectionConstant(`$.freshness.${field}.original`)}) IS NOT ${underlying} THEN NULL ELSE json_extract(fp.acceptedOverrides,${projectionConstant(`$.${field}`)}) END`
}
