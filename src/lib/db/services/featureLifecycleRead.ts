// DRIZZLE
import { sql } from 'drizzle-orm'
// SERVICES
import { historicalFeatureVisibility } from './historicalLayers'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'
import type { FeatureLifecycleState } from './featureLifecycle'

// TABLE OF CONTENTS
// 1. Unified accepted history
// 2. Public successor and effective redirect resolution

/** Read one accepted history including content, visibility and archive changes.
 * @param db Request database. @param input Server-authorized Feature and optional pagination cursor.
 * @returns Bounded history attribution and state, without exposing private content fields.
 * @remarks Proposal attempts belong to task evidence, never this accepted history.
 */
export async function readFeatureLifecycleHistory(
  db: Database,
  input: { featureId: string; guard: SQL; beforeVersion?: number },
): Promise<
  {
    revisionId: string
    version: number
    actorId: string
    origin: string
    reason: string | null
    createdAt: string
    state: FeatureLifecycleState | null
  }[]
> {
  const rows = await db.all<{
    revisionId: string
    version: number
    actorId: string
    origin: string
    reason: string | null
    createdAt: string
    recordState: string | null
  }>(sql`
  SELECT r.id revisionId,r.sequence version,c.actorId,c.origin,c.reason,c.createdAt,r.recordState
  FROM featureRevision r JOIN revisionChangeSet c ON c.id=r.changeSetId
  WHERE r.featureId=${input.featureId} AND r.sequence IS NOT NULL AND (${input.guard})
    AND (${input.beforeVersion ?? null} IS NULL OR r.sequence<${input.beforeVersion ?? null})
  ORDER BY r.sequence DESC LIMIT 50`)
  return rows.map(({ recordState, ...row }) => ({
    ...row,
    state: recordState ? JSON.parse(recordState) : null,
  }))
}

/** Resolve public successor leaves and the effective redirect from immutable operation choices.
 * @param db Request database. @param input Requested identity and trusted hub context.
 * @returns Currently visible successors/redirect, or null if no successor is available.
 * @remarks Publication and ancestor/hub gates are evaluated on every read. No redirect activation job or separate state is required.
 */
export async function readLifecycleSuccessors(
  db: Database,
  input: { featureId: string; hubId: string | null; isCore: boolean },
): Promise<{
  state: 'merged' | 'split'
  redirectFeatureId: string | null
  successors: { id: string; titles: Record<string, string> }[]
} | null> {
  const root = await db.get<{
    kind: 'merge' | 'split'
  }>(sql`SELECT o.kind FROM featureIdentityOperation o
  JOIN featureIdentityOperationMember i ON i.operationId=o.id AND i.role='input' AND i.featureId=${input.featureId}
  WHERE NOT EXISTS(SELECT 1 FROM featureIdentityOperationMember member WHERE member.operationId=o.id AND member.role='output' AND member.featureId=i.featureId)`)
  if (!root) return null
  const rows = await db.all<{
    id: string
    titles: string
  }>(sql`WITH RECURSIVE successors(id) AS (
  SELECT ${input.featureId} UNION SELECT output.featureId FROM successors current
  JOIN featureIdentityOperationMember source ON source.featureId=current.id AND source.role='input'
  JOIN featureIdentityOperationMember output ON output.operationId=source.operationId AND output.role='output'
 ) SELECT feature.id,COALESCE((SELECT json_group_object(locale,title) FROM featureI18n WHERE featureId=feature.id),'{}') titles
 FROM successors s JOIN feature ON feature.id=s.id
 JOIN layer l ON l.id=feature.layerId AND l.projectId=feature.projectId AND l.organisationId=feature.organisationId
 JOIN project p ON p.id=feature.projectId AND p.organisationId=feature.organisationId JOIN organisation o ON o.id=feature.organisationId
 WHERE feature.currentRevisionId IS NOT NULL AND feature.isPublished=1 AND feature.isArchived=0
 AND l.isPublished=1 AND l.isArchived=0 AND p.isPublished=1 AND p.isArchived=0 AND o.isPublished=1 AND o.isArchived=0
 AND NOT EXISTS(SELECT 1 FROM featureIdentityOperationMember i WHERE i.featureId=feature.id AND i.role='input'
   AND NOT EXISTS(SELECT 1 FROM featureIdentityOperationMember output WHERE output.operationId=i.operationId AND output.role='output' AND output.featureId=i.featureId))
 AND (${historicalFeatureVisibility()})
 AND ((${Number(input.isCore)}=1 AND (o.hubId IS NULL OR o.isHubExclusive=0)) OR (${Number(input.isCore)}=0 AND o.hubId=${input.hubId})) ORDER BY feature.id`)
  if (!rows.length) return null
  // UNION terminates cycles and follows only explicit choices, never a surviving visible branch by accident.
  const choices = await db.all<{ id: string }>(sql`WITH RECURSIVE redirects(id) AS (
  SELECT ${input.featureId} UNION SELECT json_extract(o.dispositions,'$.redirectFeatureId') FROM redirects r
  JOIN featureIdentityOperationMember i ON i.featureId=r.id AND i.role='input'
  JOIN featureIdentityOperation o ON o.id=i.operationId
  JOIN featureIdentityOperationMember output ON output.operationId=o.id AND output.role='output'
   AND output.featureId=json_extract(o.dispositions,'$.redirectFeatureId')
  WHERE NOT EXISTS(SELECT 1 FROM featureIdentityOperationMember retained WHERE retained.operationId=o.id AND retained.role='output' AND retained.featureId=i.featureId)
 ) SELECT id FROM redirects WHERE id!=${input.featureId}`)
  return {
    state: root.kind === 'merge' ? 'merged' : 'split',
    redirectFeatureId:
      rows.find(row => choices.some(choice => choice.id === row.id))?.id ?? null,
    successors: rows.map(row => ({ id: row.id, titles: JSON.parse(row.titles) })),
  }
}
