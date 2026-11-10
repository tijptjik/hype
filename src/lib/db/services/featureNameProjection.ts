// DRIZZLE
import { sql, type SQL } from 'drizzle-orm'

/** Read boolean and toggle values used by a reviewed name template, without loading property graphs.
 * @returns JSON values for an authorized Feature row.
 * @remarks Removed and incompatible fields evaluate as unset; configured internal fields may drive public naming text.
 */
export function featureNameValuesSQL(): SQL<string> {
  return sql<string>`(SELECT coalesce(json_group_object(fp.propertyId,fp.value),'{}')
    FROM featureProperty fp JOIN property p ON p.id=fp.propertyId
    WHERE fp.featureId="feature"."id" AND (p.dataType='boolean' OR p.component='ToggleField'))`
}
