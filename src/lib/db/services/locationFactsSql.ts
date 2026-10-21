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
  const result = sql`CASE json_extract(${column},'$.schemaVersion') WHEN 1 THEN json_extract(${column},${paths[field]}) ELSE CASE WHEN json_type(${column},'$.schemaVersion') IS NULL THEN json_extract(${column},${`$.${field}`}) END END`
  return field === 'brands' || field === 'phoneNumber'
    ? sql`COALESCE(${result},'[]')`
    : result
}
