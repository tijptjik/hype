// DRIZZLE
import { sql, type SQL } from 'drizzle-orm'

/** Pick the first available layer in the same name order as the session editor.
 * @param projectId Owning project. @param organisationId Owning organisation.
 * @returns Scalar SQL subquery, returning null when no eligible layers exist.
 */
export function firstResearchLayerSQL(projectId: string, organisationId: string): SQL {
  return sql`(SELECT l.id FROM layer l
    WHERE l.projectId=${projectId} AND l.organisationId=${organisationId}
      AND l.isArchived=0 AND l.historicalSourceLayerId IS NULL
    ORDER BY COALESCE((SELECT name FROM layerI18n WHERE layerId=l.id ORDER BY locale='en' DESC LIMIT 1),l.id),l.id LIMIT 1)`
}

/** Seed all available layers immediately after a successful session insert.
 * @param sessionId New session identity. @param projectId Owning project. @param organisationId Owning organisation.
 * @returns Selection matching the session-layer table column order.
 * @remarks Run directly after INSERT ... ON CONFLICT DO NOTHING in the same transaction. changes() prevents retries from restoring excluded layers or defaults. INSERT SELECT uses a fixed parameter count regardless of project size.
 */
export function initialResearchLayersSQL(
  sessionId: string,
  projectId: string,
  organisationId: string,
): SQL {
  return sql`SELECT ${sessionId},l.id,l.id=(SELECT layerId FROM fieldResearchSession WHERE id=${sessionId}),
    '{"defaults":{},"fieldVisibility":{},"properties":{}}'
    FROM layer l WHERE changes()>0 AND l.projectId=${projectId} AND l.organisationId=${organisationId}
    AND l.isArchived=0 AND l.historicalSourceLayerId IS NULL`
}
