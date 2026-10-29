// DRIZZLE
import { sql, type SQL } from 'drizzle-orm'

/** Include only record-owned naming state in the authorized Feature read.
 * @returns JSON naming state computed in the same query as the Feature.
 * @remarks Parent policy belongs to the shared Project/Layer cache, never each Feature payload.
 * Unlinked Features own their names; linked legacy records default to inheritance.
 */
export function featureAuthoringSQL(): SQL<string> {
  return sql<string>`json_object(
    'nameMode', COALESCE((SELECT CASE json_extract(fp.acceptancePolicy,'$.nameMode')
      WHEN 'independent' THEN 'independent' ELSE 'inherit' END
      FROM featureLocation fp WHERE fp.featureId="feature"."id"), 'independent'))`
}
