// DRIZZLE
import { sql, type SQL } from 'drizzle-orm'

/** Read public boolean values used by a reviewed name template, without loading property graphs.
 * @returns JSON values for an authorized Feature row.
 * @remarks Removed, changed-type and internal properties evaluate as unset and never leak into names.
 */
export function featureNameValuesSQL(): SQL<string> {
  return sql<string>`(SELECT coalesce(json_group_object(fp.propertyId,fp.value),'{}')
    FROM featureProperty fp JOIN property p ON p.id=fp.propertyId
    WHERE fp.featureId="feature"."id" AND p.dataType='boolean' AND p.audience='public')`
}
