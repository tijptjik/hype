// DRIZZLE
import { sql } from 'drizzle-orm'
// SERVICES
import { hasFeatureLifecycleStorage } from './featureLifecycle'
import { readLifecycleSuccessors } from './featureLifecycleRead'
import { historicalFeatureVisibility } from './historicalLayers'
// TYPES
import type { Database } from '#lib/types.js'

/** Resolves identities through accepted operations, including a retained split child, exposing only currently public leaves.
 * @param db Request database. @param input Requested identity and server-resolved hub scope.
 * @returns Public successors and lifecycle, or null for an active/unknown/unavailable identity.
 * @remarks UNION deduplicates converging branches and terminates cycles. A split never chooses
 * an arbitrary redirect, even if current visibility leaves only one available successor.
 */
export async function readPublicFeatureSuccessors(
  db: Database,
  input: { featureId: string; hubId: string | null; isCore: boolean },
): Promise<{
  state: 'merged' | 'split'
  retainsIdentity: boolean
  redirectFeatureId: string | null
  successors: { id: string; titles: Record<string, string> }[]
} | null> {
  if (await hasFeatureLifecycleStorage(db)) {
    const result = await readLifecycleSuccessors(db, input)
    return result ? { ...result, retainsIdentity: false } : null
  }
  const storage = await db.get<{ n: number }>(
    sql`SELECT count(*) n FROM sqlite_master WHERE name='featureRevisionHead' AND type='table'`,
  )
  if (!storage?.n) return null
  const root = await db.get<{ state: string }>(
    sql`SELECT state FROM featureRevisionHead WHERE featureId=${input.featureId}`,
  )
  if (!root) return null
  const split =
    root.state === 'active' &&
    (await db.get(sql`SELECT 1 FROM featureIdentityOperation o
    JOIN featureIdentityOperationMember m ON m.operationId=o.id AND m.role='input'
    WHERE o.kind='split' AND m.featureId=${input.featureId} LIMIT 1`))
  if (root.state === 'active' && !split) return null
  const rows = await db.all<{
    id: string
    titles: string
  }>(sql`WITH RECURSIVE successors(id) AS (
    SELECT ${input.featureId} UNION SELECT output.featureId FROM successors current
    JOIN featureIdentityOperationMember source ON source.featureId=current.id AND source.role='input'
    JOIN featureIdentityOperation operation ON operation.id=source.operationId
    JOIN featureIdentityOperationMember output ON output.operationId=operation.id AND output.role='output'
  ) SELECT feature.id,COALESCE((SELECT json_group_object(locale,title) FROM featureI18n WHERE featureId=feature.id),'{}') titles
    FROM successors s JOIN feature ON feature.id=s.id JOIN featureRevisionHead h ON h.featureId=feature.id AND h.state='active' AND h.publishedRevisionId IS NOT NULL
    JOIN layer l ON l.id=feature.layerId AND l.projectId=feature.projectId AND l.organisationId=feature.organisationId
    JOIN project p ON p.id=feature.projectId AND p.organisationId=feature.organisationId JOIN organisation o ON o.id=feature.organisationId
    WHERE feature.isPublished=1 AND feature.isArchived=0 AND feature.isDraft=0 AND l.isPublished=1 AND l.isArchived=0
      AND p.isPublished=1 AND p.isArchived=0 AND o.isPublished=1 AND o.isArchived=0
      AND (${historicalFeatureVisibility()})
      AND ((${Number(input.isCore)}=1 AND (o.hubId IS NULL OR o.isHubExclusive=0)) OR (${Number(input.isCore)}=0 AND o.hubId=${input.hubId})) ORDER BY feature.id`)
  if (root.state === 'active' && !rows.some(row => row.id !== input.featureId))
    return null
  // A stored choice is only actionable if its destination is public in this request's hub.
  const choices = await db.all<{ id: string }>(sql`WITH RECURSIVE redirects(id) AS (
    SELECT ${input.featureId}
    UNION SELECT CASE WHEN h.state='merged' THEN h.redirectFeatureId
      WHEN h.state='split' THEN (SELECT json_extract(o.dispositions,'$.redirectFeatureId')
        FROM featureIdentityOperation o JOIN featureIdentityOperationMember m ON m.operationId=o.id
        WHERE m.featureId=h.featureId AND m.role='input' AND o.kind='split' LIMIT 1) ELSE NULL END
      FROM redirects r JOIN featureRevisionHead h ON h.featureId=r.id
      WHERE h.state IN ('merged','split')
  ) SELECT id FROM redirects WHERE id IS NOT NULL AND id!=${input.featureId}`)
  const redirectFeatureId =
    rows.find(row => choices.some(choice => choice.id === row.id))?.id ?? null
  return rows.length
    ? {
        state: root.state === 'merged' ? 'merged' : 'split',
        retainsIdentity: rows.some(row => row.id === input.featureId),
        redirectFeatureId,
        successors: rows.map(row => ({ id: row.id, titles: JSON.parse(row.titles) })),
      }
    : null
}

/**
 * Lists the current user's saved split identities, even when the original is no longer published.
 * @param db Request database.
 * @param input Session-owned user, request hub and bounded page offset.
 * @returns Visible successor guidance and a cursor; no wishlist is reassigned on splits.
 * @remarks Source hierarchy and descendant visibility are checked independently. An unavailable
 * page may contain no rows but still have another cursor; callers can continue paging.
 */
export async function readSavedFeatureSuccessors(
  db: Database,
  input: {
    userId: string
    hubId: string | null
    isCore: boolean
    offset: number
  },
): Promise<{
  rows: {
    id: string
    titles: Record<string, string>
    successors: { id: string; titles: Record<string, string> }[]
  }[]
  nextOffset: number | null
}> {
  const storage = await db.get<{ n: number }>(
    sql`SELECT count(*) n FROM sqlite_master WHERE name='featureIdentityOperation' AND type='table'`,
  )
  if (!storage?.n) return { rows: [], nextOffset: null }
  const candidates = await db.all<{ id: string; titles: string }>(sql`SELECT feature.id,
    COALESCE((SELECT json_group_object(locale,title) FROM featureI18n WHERE featureId=feature.id),'{}') titles
    FROM userFeature saved JOIN feature ON feature.id=saved.featureId
    JOIN layer l ON l.id=feature.layerId AND l.projectId=feature.projectId AND l.organisationId=feature.organisationId
    JOIN project p ON p.id=feature.projectId AND p.organisationId=feature.organisationId
    JOIN organisation o ON o.id=feature.organisationId
    WHERE saved.userId=${input.userId} AND saved.isWishlisted=1
      AND l.isPublished=1 AND l.isArchived=0 AND p.isPublished=1 AND p.isArchived=0 AND o.isPublished=1 AND o.isArchived=0
      AND (${historicalFeatureVisibility()})
      AND ((${Number(input.isCore)}=1 AND (o.hubId IS NULL OR o.isHubExclusive=0)) OR (${Number(input.isCore)}=0 AND o.hubId=${input.hubId}))
      AND EXISTS(SELECT 1 FROM featureIdentityOperation op JOIN featureIdentityOperationMember m ON m.operationId=op.id
        WHERE op.kind='split' AND m.role='input' AND m.featureId=feature.id)
    ORDER BY saved.createdAt DESC,feature.id LIMIT 21 OFFSET ${input.offset}`)
  const rows: {
    id: string
    titles: Record<string, string>
    successors: { id: string; titles: Record<string, string> }[]
  }[] = []
  for (const candidate of candidates.slice(0, 20)) {
    const lineage = await readPublicFeatureSuccessors(db, {
      ...input,
      featureId: candidate.id,
    })
    if (lineage)
      rows.push({
        id: candidate.id,
        titles: JSON.parse(candidate.titles),
        successors: lineage.successors,
      })
  }
  return { rows, nextOffset: candidates.length > 20 ? input.offset + 20 : null }
}
