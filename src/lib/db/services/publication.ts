// DRIZZLE
import { sql, type SQL, type SQLWrapper } from 'drizzle-orm'
// TYPES
import type { Database, Id } from '#lib/types.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. DESCENDANT PUBLICATION STATE
// 2. PROJECT IMAGE POLICIES
// ---

/**
 * Resolves descendant publication exactly as the parent publication command does.
 * @param row Persisted effective and saved local publication columns.
 * @param publishChildren Whether the user explicitly includes all draft descendants.
 * @returns A SQL boolean expression shared by publication writes and preview reads.
 * @remarks Archive state is independent and must still be enforced by preview queries.
 */
export function descendantPublicationState(
  row: { isPublished: SQLWrapper; localIsPublished: SQLWrapper },
  publishChildren = false,
): SQL<boolean> {
  return publishChildren
    ? sql<boolean>`1`
    : sql<boolean>`coalesce(${row.localIsPublished}, ${row.isPublished})`
}

/**
 * Applies project image policies to published, active features in one scope.
 * @param db Database receiving the publication command.
 * @param scope Feature or ancestor scope; identifiers are bound SQL parameters.
 * @param publisherId Actor responsible for publishing the image assignments.
 * @returns Resolves after classification and publication complete atomically.
 * @remarks Existing Featured choices and research-only images are preserved.
 * First means earliest uploaded eligible image, with image ID breaking ties.
 */
export async function publishScopedFeatureImages(
  db: Database,
  scope: { kind: 'feature' | 'layer' | 'project' | 'organisation'; id: Id },
  publisherId: Id | null = null,
): Promise<void> {
  const column = {
    feature: 'id',
    layer: 'layerId',
    project: 'projectId',
    organisation: 'organisationId',
  }[scope.kind]
  const eligible = sql`SELECT f.id FROM feature f
    JOIN project p ON p.id = f.projectId
    WHERE f.${sql.raw(column)} = ${scope.id}
      AND f.isPublished = 1 AND f.isArchived = 0`

  // Classify at most one eligible image per feature without replacing editorial choices.
  const classify = db.run(sql`UPDATE featureImage SET intent = 'canonical'
    WHERE featureId IN (${eligible}
      AND coalesce(json_extract(p.flags, '$.autoFeatureFirstImage'), 1) = 1)
      AND NOT EXISTS (SELECT 1 FROM featureImage existing
        WHERE existing.featureId = featureImage.featureId AND existing.intent = 'canonical')
      AND imageId = (SELECT candidate.imageId FROM featureImage candidate
        JOIN image i ON i.id = candidate.imageId
        WHERE candidate.featureId = featureImage.featureId AND i.isArchived = 0
          AND candidate.intent IN ('undefined', 'general', 'context', 'closeUp')
        ORDER BY i.createdAt ASC, i.id ASC LIMIT 1)`)

  // Publish only public classifications, retaining the original attribution on retries.
  const publish = db.run(sql`UPDATE featureImage SET isPublished = 1,
      localIsPublished = NULL, publishedAt = ${new Date().toISOString()}, publisherId = ${publisherId}
    WHERE featureId IN (${eligible}
      AND coalesce(json_extract(p.flags, '$.autoPublishClassifiedImages'), 1) = 1)
      AND isPublished = 0 AND intent IN ('canonical', 'general', 'context', 'closeUp')
      AND imageId IN (SELECT id FROM image WHERE isArchived = 0)`)
  await db.batch([classify, publish])
}
