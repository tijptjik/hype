// INDEX SEARCH
import { taskIndexSearchCondition } from './taskIndexFilters.js'
// DRIZZLE
import { and, sql, type SQL } from 'drizzle-orm'
// SCHEMA
import { feature, task } from '#lib/db/schema/index.js'
// SERVICES
import { applyTaskUploadEvidence } from './featureUploadRead'
import { getTaskHubFilter } from './hub'
import { taskLifecycleScopeCondition } from './task-scope'
import { locationRematchReviewGuard } from './locationRematchGuard'
// UTILITIES
import { autochunk, chunkedInArray } from '#lib/utils/batch-query.js'
// TYPES
import type { Database, ListResponse, Locale, QueryParams } from '#lib/types.js'
import type { TaskDB, TaskDBRaw } from '#lib/db/zod/schema/task.types.js'
import type { HubOptsExtended } from '#lib/db/zod/schema/hub.types.js'

// ═══════════════════════
// TABLE OF CONTENTS
// 1. LIVE QUEUE PROJECTION
// 2. SCOPED PAGINATION AND HYDRATION
// ---

export type TaskQueueOptions = HubOptsExtended & {
  includeLocationReviews?: boolean
  mockLocationFeatureId?: string
}
const columns = sql.raw(
  'id,organisationId,projectId,featureId,contributorId,reviewerId,isDraft,type,message,isReviewed,reviewOutcome,reviewAction,reviewReason,createdAt,modifiedAt',
)

/** Combine contribution rows and actionable Location evidence without another task lifecycle.
 * @param mockFeatureId Explicit development-only fixture target. @returns A task-shaped CTE.
 * @remarks No read creates a task or alters a review decision. Adoption IDs remain stable across reassessments;
 * repeated identity captures use the latest retained comparison of identical baseline and evidence.
 */
export function taskQueueProjection(mockFeatureId?: string): SQL {
  const mocks =
    import.meta.env.DEV && mockFeatureId
      ? sql`
    UNION ALL SELECT 'mock:'||k.type||':'||f.id, f.organisationId,f.projectId,f.id,'system:location',NULL,0,k.type,
      'Preview data only. No changes are saved.',0,NULL,NULL,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      json_object('kind',k.kind,'locationId',COALESCE(fl.locationId,''),'mock',json('true'))
    FROM feature f LEFT JOIN featureLocation fl ON fl.featureId=f.id
    CROSS JOIN (SELECT 'locationFacts' type,'facts' kind UNION ALL SELECT 'locationPosition','position'
      UNION ALL SELECT 'locationIdentity','identity' UNION ALL SELECT 'locationMerge','merge') k
    WHERE f.id=${mockFeatureId} AND f.isDraft=0
  `
      : sql``
  // Bound each compound SELECT so the live queue stays within D1's SQL limits.
  return sql`WITH location_queue AS MATERIALIZED (
    SELECT 'locationFacts:correction:'||p.id,f.organisationId,f.projectId,f.id,p.actorId,NULL,0,'locationFacts',p.reason,0,NULL,NULL,NULL,p.createdAt,p.createdAt,
      json_object('kind','facts','locationId',p.locationId,'correctionProposalId',p.id)
    FROM locationCorrectionProposal p JOIN feature f ON f.id=p.featureId AND f.organisationId=p.organisationId
    JOIN featureLocation fl ON fl.featureId=f.id AND fl.locationId=p.locationId
    WHERE NOT EXISTS(SELECT 1 FROM locationCorrectionDecision d WHERE d.proposalId=p.id)
    UNION ALL
    SELECT g.type||':'||f.id||':'||p.candidateRevisionId||':'||p.organisationRevision||CASE WHEN json_extract(p.evidence,'$.sharedRevision') IS NULL THEN '' ELSE ':'||json_extract(p.evidence,'$.sharedRevision') END,
      f.organisationId,f.projectId,f.id,'system:location',NULL,0,g.type,NULL,0,NULL,NULL,NULL,p.createdAt,p.createdAt,
      json_object('kind',g.kind,'locationId',p.locationId,'proposalId',p.id)
    FROM locationAdoptionProposal p
    JOIN feature f ON f.id=p.featureId AND f.projectId=p.projectId AND f.isDraft=0
    JOIN featureLocation fl ON fl.featureId=f.id AND fl.locationId=p.locationId
    JOIN location l ON l.id=fl.locationId AND l.state!='redirect'
    JOIN locationRevisionContent candidate ON candidate.id=p.candidateRevisionId AND candidate.locationId=l.id
    JOIN locationRevisionContent af ON af.id=fl.factsRevisionId AND af.locationId=l.id
    JOIN locationRevisionContent ap ON ap.id=fl.locationRevisionId AND ap.locationId=l.id
    CROSS JOIN (SELECT 'locationFacts' type,'facts' kind,'facts' fieldGroup
      UNION ALL SELECT 'locationPosition','position','location') g
    WHERE json_extract(p.evidence,'$.placement') IS NULL AND (l.state!='manual' OR l.ownerOrganisationId=(SELECT organisationId FROM project WHERE id=f.projectId))
      AND json_extract(p.evidence,'$.plan.decision.'||g.fieldGroup)='review'
      AND NOT EXISTS (SELECT 1 FROM locationAdoptionProposal newer WHERE newer.featureId=p.featureId
        AND newer.projectId=p.projectId AND newer.locationId=p.locationId AND newer.candidateRevisionId=p.candidateRevisionId
        AND newer.organisationRevision=p.organisationRevision AND json_extract(newer.evidence,'$.sharedRevision') IS json_extract(p.evidence,'$.sharedRevision') AND json_extract(newer.evidence,'$.placement') IS NULL AND newer.rowid>p.rowid)
      AND NOT EXISTS (SELECT 1 FROM locationAdoptionProposal decided WHERE decided.featureId=p.featureId
        AND decided.projectId=p.projectId AND decided.locationId=p.locationId AND decided.candidateRevisionId=p.candidateRevisionId
        AND decided.organisationRevision=p.organisationRevision AND json_extract(decided.evidence,'$.sharedRevision') IS json_extract(p.evidence,'$.sharedRevision') AND json_extract(decided.evidence,'$.placement') IS NULL
        AND (CASE WHEN g.fieldGroup='facts' THEN decided.factsDecision ELSE decided.locationDecision END) IS NOT NULL)
      AND (json_extract(p.evidence,'$.sharedRevision') IS NOT NULL
        AND json_extract(p.evidence,'$.sharedRevision') IS NOT json_extract(fl.acceptancePolicy,CASE WHEN g.fieldGroup='facts' THEN '$.factsSharedRevision' ELSE '$.locationSharedRevision' END)
        OR candidate.version>CASE WHEN g.fieldGroup='facts' THEN af.version ELSE ap.version END
        OR (candidate.id=CASE WHEN g.fieldGroup='facts' THEN af.id ELSE ap.id END
          AND p.organisationRevision!=''
          AND p.organisationRevision!=COALESCE(CASE WHEN g.fieldGroup='facts' THEN fl.factsOrganisationRevision ELSE fl.locationOrganisationRevision END,'')
          AND p.organisationRevision=(SELECT o.revision FROM organisationLocationHead o JOIN project pr ON pr.organisationId=o.organisationId
            WHERE o.locationId=l.id AND pr.id=f.projectId)))
    UNION ALL
    SELECT 'locationPosition:placement:'||f.id||':'||COALESCE(p.occupancyRevisionId,'')||':'||COALESCE(p.addressRevisionId,''),
      f.organisationId,f.projectId,f.id,'system:location',NULL,0,'locationPosition',NULL,0,NULL,NULL,NULL,p.createdAt,p.createdAt,
      json_object('kind','position','locationId',p.locationId,'proposalId',p.id)
    FROM locationAdoptionProposal p JOIN feature f ON f.id=p.featureId AND f.projectId=p.projectId AND f.isDraft=0
    JOIN featureLocation fl ON fl.featureId=f.id AND fl.locationId=p.locationId
    JOIN location l ON l.id=p.locationId
    WHERE json_extract(p.evidence,'$.placement') IS NOT NULL AND l.state!='redirect'
      AND (p.occupancyRevisionId IS NULL OR EXISTS(SELECT 1 FROM locationOccupancyHead r WHERE r.id=p.occupancyRevisionId AND r.assertionState='asserted'
        AND (r.scopeOrganisationId=f.organisationId OR (r.scopeOrganisationId IS NULL AND NOT EXISTS(SELECT 1 FROM locationOccupancyHead scoped WHERE scoped.relationshipId=r.relationshipId AND scoped.scopeOrganisationId=f.organisationId)))))
      AND (l.state!='manual' OR l.ownerOrganisationId=f.organisationId)
      AND NOT EXISTS(SELECT 1 FROM locationOccupancy o JOIN location c ON c.id=o.containerLocationId WHERE o.id=p.occupancyRevisionId AND c.state='manual' AND c.ownerOrganisationId!=f.organisationId)
      AND NOT EXISTS(SELECT 1 FROM json_each(json_extract(p.evidence,'$.placement.membershipRevisionIds')) j JOIN locationMembership m ON m.id=j.value JOIN location c ON c.id=m.parentLocationId OR c.id=m.childLocationId WHERE c.state='manual' AND c.ownerOrganisationId!=f.organisationId)
      AND NOT EXISTS(SELECT 1 FROM locationAdoptionProposal newer WHERE newer.featureId=p.featureId AND newer.projectId=p.projectId AND newer.locationId=p.locationId AND newer.occupancyRevisionId IS p.occupancyRevisionId AND newer.addressRevisionId IS p.addressRevisionId AND newer.rowid>p.rowid)
      AND NOT EXISTS(SELECT 1 FROM locationAdoptionProposal d WHERE d.featureId=p.featureId AND d.projectId=p.projectId AND d.locationId=p.locationId AND d.occupancyRevisionId IS p.occupancyRevisionId AND d.addressRevisionId IS p.addressRevisionId AND d.locationDecision IS NOT NULL)
    UNION ALL
    SELECT (CASE WHEN occupied.id IS NULL THEN 'locationIdentity' ELSE 'locationMerge' END)||':'||f.id||':'||r.id,
      f.organisationId,f.projectId,f.id,'system:location',NULL,0,
      CASE WHEN occupied.id IS NULL THEN 'locationIdentity' ELSE 'locationMerge' END,NULL,0,NULL,NULL,NULL,r.createdAt,r.createdAt,
      json_object('kind',CASE WHEN occupied.id IS NULL THEN 'identity' ELSE 'merge' END,
        'locationId',l.id,'reviewId',r.id,'mergeReviewId',json_extract(r.mergeReviews,'$[#-1].id'),
        'matchScore',json_extract(r.projection,'$.rawSource.hypeRematch.evidence.score'),
        'matchDistance',json_extract(r.projection,'$.rawSource.hypeRematch.evidence.distance'))
    FROM locationIdentityReview r JOIN location l ON l.id=r.locationId AND l.state!='redirect'
    JOIN featureLocation fl ON fl.locationId=l.id JOIN feature f ON f.id=fl.featureId AND f.isDraft=0
    LEFT JOIN location occupied ON occupied.ssId=json_extract(r.projection,'$.ssId') AND occupied.id!=l.id AND occupied.state!='redirect'
    WHERE r.rejection IS NULL AND r.ownerOrganisationId IS l.ownerOrganisationId
      AND ${locationRematchReviewGuard(sql`r.id`)}
      AND (json_extract(r.projection,'$.rawSource.hypeRematch') IS NULL
        OR json_extract(r.projection,'$.rawSource.hypeRematch.featureId')=f.id)
      AND (l.ownerOrganisationId IS NULL OR l.ownerOrganisationId=f.organisationId)
      AND json_extract(r.baseline,'$.expectedState')=l.state
      AND json_extract(r.baseline,'$.expectedSsId') IS l.ssId
      AND json_extract(r.baseline,'$.expectedSourceAvailability')=l.sourceAvailability
      AND json_extract(r.baseline,'$.expectedLatestRevisionId')=(SELECT id FROM locationRevisionContent lr WHERE lr.locationId=l.id ORDER BY lr.version DESC LIMIT 1)
      AND json_extract(r.baseline,'$.expectedHistoryId') IS (SELECT h.id FROM locationIdentityHistory h WHERE h.locationId=l.id AND NOT EXISTS (SELECT 1 FROM locationIdentityHistory nh WHERE nh.previousHistoryId=h.id))
      AND NOT EXISTS (SELECT 1 FROM locationIdentityHistory h WHERE h.reviewId=r.id)
      AND NOT EXISTS (SELECT 1 FROM locationIdentityReview newer WHERE newer.locationId=r.locationId
        AND newer.ownerOrganisationId IS r.ownerOrganisationId AND newer.baseline=r.baseline
        AND newer.projection=r.projection AND newer.rowid>r.rowid)
    UNION ALL
    SELECT 'locationIdentity:rematch:'||j.id,f.organisationId,f.projectId,f.id,'system:location',NULL,0,
      'locationIdentity',NULL,0,NULL,NULL,NULL,j.createdAt,j.createdAt,
      json_object('kind','identity','locationId',j.locationId,'rematchJobId',j.id,'rematchStatus',j.status,'rematchReason',j.reason)
    FROM locationRematchCurrent j JOIN feature f ON f.id=j.featureId
    WHERE j.status IN ('pending','checking','deferred','failed')
  ), "task" AS (
    SELECT ${columns}, NULL AS locationTask FROM main.task
    UNION ALL SELECT * FROM location_queue
    ${mocks}
  )`
}

/** Read one combined, permission-filtered page before hydrating either contribution or Location rows.
 * @param db Request-local database. @param relations Requested ordinary task relations.
 * @param conditions Existing task authorization, state and prism filters. @param opts Current hub and explicit mock scope.
 * @param pagination Requested bounded page. @param sorting Requested sort. @param query Search and filter metadata.
 * @returns The ordinary task list envelope with one consistent count, sort and pagination across all kinds.
 */
export async function listTaskQueue(
  db: Database,
  relations: Record<string, boolean | object>,
  conditions: SQL<unknown>[],
  opts: TaskQueueOptions,
  pagination?: { limit?: number; offset?: number },
  sorting?: { sortBy?: string; sortOrder?: 'asc' | 'desc' },
  query?: { q?: string; filtersToApply?: QueryParams; locale?: Locale },
): Promise<ListResponse<TaskDBRaw>> {
  const start = Date.now()
  const filters = [...conditions, await taskLifecycleScopeCondition(db)]
  const hubFilter = getTaskHubFilter(db, opts)
  if (hubFilter) filters.push(hubFilter)
  if (query?.q) filters.push(taskIndexSearchCondition(query.q))
  const where = and(...filters) ?? sql`1`
  const sortBy = sorting?.sortBy ?? 'modifiedAt'
  const order = sql.raw(sorting?.sortOrder === 'asc' ? 'ASC' : 'DESC')
  const sort =
    sortBy === 'title'
      ? sql`COALESCE((SELECT fi.title FROM featureI18n fi WHERE fi.featureId=task.featureId ORDER BY (fi.locale=${query?.locale ?? 'en'}) DESC,fi.locale LIMIT 1),'')`
      : sql.raw(
          `task.${['createdAt', 'type', 'modifiedAt'].includes(sortBy) ? sortBy : 'modifiedAt'}`,
        )
  const projection = taskQueueProjection(opts.mockLocationFeatureId)
  const count = await db.get<{ count: number }>(
    sql`${projection} SELECT count(*) count FROM task WHERE ${where}`,
  )
  const limit = pagination?.limit
  const offset = Math.max(pagination?.offset ?? 0, 0)
  const refs = await db.all<
    Omit<TaskDB, 'locationTask'> & {
      locationTask: string | null
      locationNames: string | null
      locationKind: string | null
    }
  >(
    sql`${projection} SELECT task.*, (SELECT l.matchingType FROM location l WHERE l.id=json_extract(task.locationTask,'$.locationId')) locationKind, (SELECT (SELECT json_group_object(t.key,json_extract(t.value,'$.name')) FROM json_each(lr.facts,'$.i18n') t WHERE json_type(t.value,'$.name')='text') FROM locationRevisionContent lr WHERE lr.locationId=json_extract(task.locationTask,'$.locationId') ORDER BY lr.version DESC LIMIT 1) locationNames FROM task WHERE ${where} ORDER BY ${sort} ${order},COALESCE(json_extract(task.locationTask,'$.matchScore'),0) DESC,COALESCE(json_extract(task.locationTask,'$.matchDistance'),0) ASC,task.id ASC LIMIT ${limit ?? -1} OFFSET ${offset}`,
  )
  // Hydrate only this page; JSON membership leaves room for relational LIMIT bindings.
  const nativeIds = refs.filter(row => !row.locationTask).map(row => row.id)
  const native = await autochunk({ items: nativeIds }, ids =>
    db.query.task.findMany({ where: chunkedInArray(task.id, ids), with: relations }),
  )
  const featureIds = [
    ...new Set(refs.filter(row => row.locationTask).map(row => row.featureId)),
  ]
  const features = await autochunk({ items: featureIds }, ids =>
    db.query.feature.findMany({
      where: chunkedInArray(feature.id, ids),
      with: {
        i18n: true,
        images: {
          with: { image: true },
          orderBy: (images, { desc }) => [desc(sql`${images.intent} = 'canonical'`)],
        },
        project: { with: { i18n: true, organisation: { with: { i18n: true } } } },
      },
    }),
  )
  const nativeById = new Map(native.map(row => [row.id, row]))
  const featureById = new Map(features.map(row => [row.id, row]))
  const data = refs.flatMap(row => {
    if (!row.locationTask) {
      const value = nativeById.get(row.id)
      return value ? [value as TaskDBRaw] : []
    }
    const parent = row.featureId ? featureById.get(row.featureId) : undefined
    if (!parent) return []
    return [
      {
        ...row,
        isDraft: false,
        isReviewed: false,
        locationTask: {
          ...JSON.parse(row.locationTask),
          locationKind: row.locationKind ?? 'unknown',
          names: row.locationNames ? JSON.parse(row.locationNames) : {},
        },
        feature: parent,
        project: parent.project,
        organisation: parent.project.organisation,
        images:
          parent.images?.map(item => ({
            taskId: row.id,
            imageId: item.imageId,
            image: item.image,
          })) ?? [],
        contributor: null,
        reviewer: null,
      } as TaskDBRaw,
    ]
  })
  const totalCount = Number(count.count)
  const hasMore = offset + refs.length < totalCount
  return {
    data: await applyTaskUploadEvidence(db, data),
    limit,
    offset,
    totalCount,
    hasMore,
    nextOffset: hasMore ? offset + refs.length : null,
    sortBy,
    sortOrder: sorting?.sortOrder ?? 'desc',
    q: query?.q,
    appliedFilters: query?.filtersToApply,
    durationMs: Date.now() - start,
  }
}

/** Probe virtual task ancestry before any comparison evidence is hydrated.
 * @param db Request-local database. @param id Stable task identity. @returns Persisted authorization scope or null.
 */
export async function probeLocationTask(
  db: Database,
  id: string,
): Promise<{
  id: string
  organisationId: string
  projectId: string
  isReviewed: boolean
  resourceHubId: string | null
} | null> {
  const mock = id.startsWith('mock:') ? id.split(':').slice(2).join(':') : undefined
  const row = await db.get<{
    id: string
    organisationId: string
    projectId: string
    isReviewed: number
    resourceHubId: string | null
  }>(
    sql`${taskQueueProjection(mock)} SELECT task.id,task.organisationId,task.projectId,task.isReviewed,o.hubId resourceHubId FROM task JOIN organisation o ON o.id=task.organisationId WHERE task.id=${id}`,
  )
  return row ? { ...row, isReviewed: Boolean(row.isReviewed) } : null
}
