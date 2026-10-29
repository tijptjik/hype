// DRIZZLE
import { sql, type SQL } from 'drizzle-orm'

/** Include name ownership and resolved parent policy in the authorized Feature read.
 * @returns JSON authoring state computed in the same query as the Feature.
 * @remarks This is a read projection, not a second source of persisted policy.
 * Unlinked Features own their names; linked legacy records default to inheritance.
 */
export function featureAuthoringSQL(): SQL<string> {
  return sql<string>`json_object(
    'nameMode', COALESCE((SELECT CASE json_extract(fp.acceptancePolicy,'$.nameMode')
      WHEN 'independent' THEN 'independent' ELSE 'inherit' END
      FROM featureLocation fp WHERE fp.featureId="feature"."id"), 'independent'),
    'locationBasedNames', json(CASE WHEN COALESCE(
      (SELECT json_extract(l.metadata,'$.locationBasedFeatureNames') FROM layer l WHERE l.id="feature"."layerId"),
      (SELECT json_extract(p.flags,'$.locationBasedFeatureNames') FROM project p WHERE p.id="feature"."projectId"), 0)
      THEN 'true' ELSE 'false' END),
    'allowDescriptions', json(CASE WHEN COALESCE(
      (SELECT json_extract(l.metadata,'$.allowFeatureDescriptions') FROM layer l WHERE l.id="feature"."layerId"),
      (SELECT json_extract(p.flags,'$.allowFeatureDescriptions') FROM project p WHERE p.id="feature"."projectId"), 1)
      THEN 'true' ELSE 'false' END))`
}
