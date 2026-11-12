// DRIZZLE
import { sql } from 'drizzle-orm'
// TYPES
import type { SQL, SQLWrapper } from 'drizzle-orm'

const paths = {
  brandId: '$.details.brandId',
  names: '$.i18n',
  phoneNumber: '$.common.phoneNumber',
  brands: '$.details.brands',
  location: '$.common.location',
  operatingStatus: '$.details.operatingStatus',
  buildingStatus: '$.details.buildingStatus',
  successorLocationId: '$.common.successorLocationId',
} as const

/** Inline an escaped code-owned projection constant without spending a D1 binding.
 * @param value Fixed field name, JSON path or empty fallback, never request data.
 * @returns An escaped SQL string literal, or SQL NULL.
 * @remarks Relational query aliasing clones SQL nodes and drops inlineParams flags.
 * Store code-owned constants as literal chunks so they survive that transformation.
 */
function projectionConstant(value: string | null): SQL {
  return sql.raw(value === null ? 'NULL' : `'${value.replaceAll("'", "''")}'`)
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
  if (field === 'names')
    return sql`CASE WHEN json_type(${column},'$.schemaVersion') IS NULL THEN json_extract(${column},'$.names') WHEN json_extract(${column},'$.schemaVersion')=1 THEN (SELECT json_group_object(n.key,json_extract(n.value,'$.name')) FROM json_each(${column},'$.i18n') n WHERE json_type(n.value,'$.name')='text') END`
  if (field === 'location') {
    const location = sql`json_extract(${column},'$.common.location')`
    const address = sql`json_set(${location},'$.address.fallbackDisplay',json((SELECT json_group_object(n.key,json_extract(n.value,'$.displayAddress')) FROM json_each(${column},'$.i18n') n WHERE json_type(n.value,'$.displayAddress')='text')))`
    return sql`CASE WHEN json_type(${column},'$.schemaVersion') IS NULL THEN json_extract(${column},'$.location') WHEN json_extract(${column},'$.schemaVersion') IS NOT 1 THEN NULL WHEN EXISTS(SELECT 1 FROM json_each(${column},'$.i18n') n WHERE json_type(n.value,'$.displayAddressOverride')='text') THEN json_set(${address},'$.address.displayOverrides',json((SELECT json_group_object(n.key,json_extract(n.value,'$.displayAddressOverride')) FROM json_each(${column},'$.i18n') n WHERE json_type(n.value,'$.displayAddressOverride')='text'))) ELSE ${address} END`
  }
  if (field === 'brands')
    return sql`CASE WHEN json_type(${column},'$.schemaVersion') IS NULL THEN coalesce(json_extract(${column},'$.brands'),'[]') WHEN json_extract(${column},'$.schemaVersion')=1 THEN (SELECT json_group_array(json_patch(json_object('identifiers',json_extract(b.value,'$.identifiers'),'names',json((SELECT json_group_object(n.key,json_extract(n.value,'$.name')) FROM json_each(b.value,'$.i18n') n))),json_object('logo',json_extract(b.value,'$.logo')))) FROM json_each(${column},'$.details.brands') b) END`
  const result = sql`CASE json_extract(${column},'$.schemaVersion') WHEN 1 THEN json_extract(${column},${projectionConstant(paths[field])}) ELSE CASE WHEN json_type(${column},'$.schemaVersion') IS NULL THEN json_extract(${column},${projectionConstant(`$.${field}`)}) END END`
  return field === 'phoneNumber' ? sql`COALESCE(${result},'[]')` : result
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
