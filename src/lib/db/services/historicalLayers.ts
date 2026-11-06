// DRIZZLE
import { eq, sql, type SQL } from 'drizzle-orm'
// DB
import { layer } from '#lib/db/schema/layer.js'
// TYPES
import type { Database } from '#lib/types.js'

/** Public collection membership; historical status never grants publication access.
 * @returns Predicate for an authorized Feature query using the feature table.
 */
export function historicalFeatureVisibility(): SQL {
  return sql`("feature"."isIntangible"=0 OR EXISTS (
    SELECT 1 FROM layer h JOIN layer s ON s.id=h.historicalSourceLayerId
      JOIN project p ON p.id=h.projectId
    WHERE h.id="feature"."layerId" AND json_extract(p.flags,'$.showHistoricalLayers')=1
      AND h.isPublished=1 AND h.isArchived=0 AND s.isPublished=1 AND s.isArchived=0))`
}

/** Hide disabled derivatives without deleting their configuration.
 * @returns Predicate for an authorized public Layer query.
 */
export function historicalLayerVisibility(): SQL {
  return sql`("layer"."historicalSourceLayerId" IS NULL OR EXISTS (
    SELECT 1 FROM project p JOIN layer s ON s.id="layer"."historicalSourceLayerId"
    WHERE p.id="layer"."projectId" AND json_extract(p.flags,'$.showHistoricalLayers')=1
      AND s.isPublished=1 AND s.isArchived=0))`
}

/** Read system-managed ancestry after the caller has authorized the resource.
 * @param db Request database.
 * @param layerId Persisted layer identity.
 * @returns Source identity or null for an ordinary/missing layer.
 */
export async function historicalSourceLayerId(
  db: Database,
  layerId: string,
): Promise<string | null> {
  const row = await db
    .select({ source: layer.historicalSourceLayerId })
    .from(layer)
    .where(eq(layer.id, layerId))
    .get()
  return row?.source ?? null
}

/** Resolves the same derived layer as the database's status-routing trigger.
 * @param sourceLayerId Persisted layer inspected before a status change.
 * @param isIntangible Accepted resulting status.
 * @returns SQL scalar for verification after the trigger, preserving source project ancestry.
 * @remarks Use only when status changes; ordinary editorial writes retain their exact layer.
 */
export function featureLayerAfterStatus(
  sourceLayerId: string,
  isIntangible: boolean,
): SQL {
  return sql`(SELECT CASE WHEN ${Number(isIntangible)}=1 AND json_extract(p.flags,'$.showHistoricalLayers')=1
    THEN COALESCE((SELECT h.id FROM layer h WHERE h.historicalSourceLayerId=COALESCE(l.historicalSourceLayerId,l.id)
      AND h.projectId=l.projectId AND h.organisationId=l.organisationId),l.id)
    ELSE COALESCE(l.historicalSourceLayerId,l.id) END
    FROM layer l JOIN project p ON p.id=l.projectId WHERE l.id=${sourceLayerId})`
}
