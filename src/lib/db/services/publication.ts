// DRIZZLE
import { eq, sql, type SQL, type SQLWrapper } from 'drizzle-orm'
// DB
import { featureImage } from '#lib/db/schema/image.js'
import { feature, layer, project } from '#lib/db/schema/index.js'
// TYPES
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database, Id } from '#lib/types.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. DESCENDANT PUBLICATION STATE
// 2. PROJECT IMAGE POLICIES
// 3. DESCENDANT PUBLICATION WRITES
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
  await db.batch(buildScopedFeatureImagePublication(db, scope, publisherId))
}

/**
 * Prepares image-policy writes for inclusion in the caller's publication transaction.
 * @param db Database receiving the publication command.
 * @param scope Authorized feature or ancestor scope.
 * @param publisherId Publishing actor.
 * @returns Ordered classification and publication statements, without executing them.
 */
export function buildScopedFeatureImagePublication(
  db: Database,
  scope: { kind: 'feature' | 'layer' | 'project' | 'organisation'; id: Id },
  publisherId: Id | null = null,
): [BatchItem<'sqlite'>, BatchItem<'sqlite'>] {
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
  const classify = db
    .update(featureImage)
    .set({ intent: 'canonical' })
    .where(sql`featureId IN (${eligible}
      AND coalesce(json_extract(p.flags, '$.autoFeatureFirstImage'), 1) = 1)
      AND NOT EXISTS (SELECT 1 FROM featureImage existing
        WHERE existing.featureId = featureImage.featureId AND existing.intent = 'canonical')
      AND imageId = (SELECT candidate.imageId FROM featureImage candidate
        JOIN image i ON i.id = candidate.imageId
        WHERE candidate.featureId = featureImage.featureId AND i.isArchived = 0
          AND candidate.intent IN ('undefined', 'general', 'context', 'closeUp')
        ORDER BY i.createdAt ASC, i.id ASC LIMIT 1)`)

  // Publish only public classifications, retaining the original attribution on retries.
  const publish = db
    .update(featureImage)
    .set({
      isPublished: true,
      localIsPublished: null,
      publishedAt: new Date().toISOString(),
      publisherId,
    })
    .where(sql`featureId IN (${eligible}
      AND coalesce(json_extract(p.flags, '$.autoPublishClassifiedImages'), 1) = 1)
      AND isPublished = 0 AND intent IN ('canonical', 'general', 'context', 'closeUp')
      AND imageId IN (SELECT id FROM image WHERE isArchived = 0)`)
  return [classify, publish]
}

/**
 * Prepares descendant state and image-policy writes in their required execution order.
 * @param db Database receiving the publication command.
 * @param scope Authorized ancestor scope.
 * @param params Publication state and explicit draft-inclusion choice.
 * @returns Statements to append to the parent's atomic D1 batch.
 * @remarks Existing local publish snapshots are preserved while an ancestor remains unpublished.
 */
export function buildDescendantPublication(
  db: Database,
  scope: { kind: 'organisation' | 'project' | 'layer'; id: Id },
  params: {
    state: boolean
    publishChildren?: boolean
    publisherId?: Id | null
  },
): [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]] {
  const tables =
    scope.kind === 'organisation'
      ? ([project, layer, feature] as const)
      : scope.kind === 'project'
        ? ([layer, feature] as const)
        : ([feature] as const)
  const statements = tables.map(table => {
    const scopeColumn =
      scope.kind === 'organisation'
        ? table.organisationId
        : scope.kind === 'project'
          ? (table as typeof layer | typeof feature).projectId
          : (table as typeof feature).layerId
    // Explicit bulk publication includes drafts; ordinary restoration keeps local state.
    return db
      .update(table)
      .set({
        ...(params.state && params.publishChildren
          ? {
              publishedAt: new Date().toISOString(),
              publisherId: params.publisherId,
            }
          : {}),
        localIsPublished: params.state
          ? null
          : sql`coalesce(${table.localIsPublished}, ${table.isPublished})`,
        isPublished: params.state
          ? params.publishChildren
            ? true
            : descendantPublicationState(table)
          : sql`0`,
      })
      .where(eq(scopeColumn, scope.id))
  })
  // Image eligibility observes the newly updated descendants within the same transaction.
  return [
    statements[0],
    ...statements.slice(1),
    ...(params.state
      ? buildScopedFeatureImagePublication(db, scope, params.publisherId)
      : []),
  ]
}
