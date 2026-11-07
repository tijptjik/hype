// DRIZZLE
import { sql } from 'drizzle-orm'
// AUTHORIZATION
import { authorizeFeatureAdminReadForProbe } from './authz/feature'
import { authorizeTaskReadForProbe } from './authz/task'
import { taskLifecycleScopeCondition } from '#lib/db/services/task-scope.js'
// SERVICES
import { hasFeatureLifecycleStorage } from '#lib/db/services/featureLifecycle.js'
import { featureUploadEvidenceSource } from '#lib/db/services/featureUploadEvidence.js'
import { probeFeatureQuery } from '#lib/db/services/feature.js'
import { buildFeatureCommandScopeGuard } from '#lib/db/services/featureCommandScope.js'
import { readImageRevisionDelivery } from '#lib/db/services/imageRevisionDelivery.js'
import { privateFeatureComparison } from '#lib/db/services/featurePrivateCapture.js'
// TYPES
import type { Database, Id, UserRoleDisco } from '#lib/types.js'
import type { PinnedImageDelivery } from '#lib/db/services/imageRevisionDelivery.js'

/**
 * Resolves current public delivery or a currently authorized Feature review/evidence preview.
 * @param db Request database.
 * @param revisionId Exact immutable image pin.
 * @param featureId Claimed Feature context, never an access grant.
 * @param actor Authenticated actor and current roles; omit for public requests.
 * @param adminOnly Whether full metadata requires current Feature administration permission.
 * @returns Exact visible pin or null without disclosing private metadata.
 * @remarks Staff see accepted history, submitted reviews and their own drafts. Contributors
 * may see only their own task-backed proposal evidence under its current Feature ancestry.
 */
export async function readFeatureImageRevisionPreview(
  db: Database,
  revisionId: string,
  featureId: string | null,
  actor?: {
    user: Parameters<typeof authorizeFeatureAdminReadForProbe>[0]['user']
    userRoles: UserRoleDisco[]
  },
  adminOnly = false,
): Promise<PinnedImageDelivery | null> {
  const publicPin = await readImageRevisionDelivery(db, revisionId)
  if (publicPin && !adminOnly) return publicPin
  if (!actor) return null
  const reviewed = await readReviewedImagePreview(db, revisionId, actor)
  if (reviewed) return reviewed
  if (!featureId) return readCreationImagePreview(db, revisionId, actor, adminOnly)
  const probe = await probeFeatureQuery(db, { ref: featureId as Id, refKey: 'id' })
  if (!probe) return null
  const admin = authorizeFeatureAdminReadForProbe({
    user: actor.user,
    userRoles: actor.userRoles,
    probe,
  }).allowed
  if (adminOnly && !admin) return null
  const scope = buildFeatureCommandScopeGuard(db, featureId, probe)
  if (await hasFeatureLifecycleStorage(db)) {
    const history = sql`EXISTS(SELECT 1 FROM featureRevision r JOIN featureRevisionImage pin ON pin.featureRevisionId=r.id
      WHERE r.featureId=${featureId} AND r.sequence IS NOT NULL AND pin.imageId=i.id AND pin.imageRevisionId=${revisionId})`
    const tasks = sql`EXISTS(SELECT 1 FROM featureUploadEvidence u JOIN json_each(u.taskIds) j
      JOIN task t ON t.id=j.value AND t.featureId=u.featureId JOIN taskImage ti ON ti.taskId=t.id AND ti.imageId=u.imageId
      JOIN feature f ON f.id=t.featureId WHERE u.featureId=${featureId} AND u.imageId=i.id AND u.imageRevisionId=${revisionId}
      AND t.organisationId=f.organisationId AND t.projectId=f.projectId
      AND ((${Number(admin)} AND t.isDraft=0) OR t.contributorId=${actor.user.id}))`
    const proposal = sql`EXISTS(SELECT 1 FROM featureRevisionProposal p JOIN json_each(p.changes,'$.operations') op
      WHERE p.featureId=${featureId} AND (p.status IN ('submitted','accepted','rejected') OR p.contributorId=${actor.user.id})
        AND json_extract(op.value,'$.imageId')=i.id
        AND ((json_extract(op.value,'$.op')='addImage' AND json_extract(op.value,'$.entry.imageRevisionId')=${revisionId})
          OR (json_extract(op.value,'$.op')='editImage' AND json_extract(op.value,'$.changes.imageRevisionId')=${revisionId})))`
    return readImageRevisionDelivery(
      db,
      revisionId,
      sql`(${scope}) AND ((${Number(admin)} AND ((${history}) OR (${proposal}))) OR (${tasks}))`,
    )
  }
  const privateComparison = admin
    ? await privateFeatureComparison(db, sql`h.featureId`, sql`h.generation`)
    : sql`NULL`
  const privateStorage =
    admin &&
    (await db.get<{ n: number }>(
      sql`SELECT count(*) n FROM sqlite_master WHERE name='featurePrivateCapture' AND type='table'`,
    ))
  // Approved private maintenance remains inspectable after a later capture or publication.
  // This grant never includes ordinary drafts and still uses current Feature authority.
  const privateHistory =
    privateStorage && privateStorage.n
      ? sql`EXISTS (
    SELECT 1 FROM featurePrivateCapture capture JOIN featureRevisionImage pin ON pin.featureRevisionId=capture.revisionId
    WHERE capture.featureId=${featureId} AND pin.imageId=i.id AND pin.imageRevisionId=${revisionId})`
      : sql`0`
  const uploadStorage = await db.get<{ n: number }>(
    sql`SELECT count(*) n FROM sqlite_master WHERE name='featureImageUploadRevision' AND type='table'`,
  )
  const evidence = uploadStorage?.n ? await featureUploadEvidenceSource(db) : null
  const taskEvidence = evidence
    ? sql`EXISTS(SELECT 1 FROM ${evidence} u JOIN json_each(u.taskIds) j
    JOIN task t ON t.id=j.value AND t.featureId=u.featureId JOIN taskImage ti ON ti.taskId=t.id AND ti.imageId=u.imageId
    JOIN feature f ON f.id=t.featureId WHERE u.featureId=${featureId} AND u.imageId=i.id AND u.imageRevisionId=${revisionId}
      AND t.projectId=f.projectId AND t.organisationId=f.organisationId
      AND ((${Number(admin)} AND t.isDraft=0) OR t.contributorId=${actor.user.id}))`
    : sql`0`
  return readImageRevisionDelivery(
    db,
    revisionId,
    sql`(${scope}) AND ((${Number(admin)} AND EXISTS (
    SELECT 1 FROM featureRevisionHead h
    LEFT JOIN featureRevisionPublication p ON p.featureId=h.featureId AND p.generation=h.generation
    JOIN featureRevisionImage pin ON pin.featureRevisionId=COALESCE(h.publishedRevisionId,${privateComparison},p.previousRevisionId,
      (SELECT initial.id FROM featureRevision initial JOIN featureRevisionPublication receipt
        ON receipt.featureId=initial.featureId AND receipt.changeSetId=initial.changeSetId AND receipt.generation=0
        WHERE initial.featureId=h.featureId AND initial.previousRevisionId IS NULL))
    WHERE h.featureId=${featureId} AND h.state='active' AND pin.imageId=i.id AND pin.imageRevisionId=${revisionId}))
    OR (${privateHistory}) OR (${taskEvidence})
    OR (${Number(admin)} AND EXISTS (SELECT 1 FROM featureRevisionPublication publication
      JOIN featureRevisionImage pin ON pin.featureRevisionId=publication.revisionId
      WHERE publication.featureId=${featureId} AND pin.imageId=i.id AND pin.imageRevisionId=${revisionId}))
    OR EXISTS (SELECT 1 FROM featureRevisionProposal p
      JOIN featureRevisionHead h ON h.featureId=p.featureId AND h.state='active'
      JOIN featureRevisionImage pin ON pin.featureRevisionId=p.candidateRevisionId
      WHERE p.featureId=${featureId} AND pin.imageId=i.id AND pin.imageRevisionId=${revisionId}
        AND ((${Number(admin)} AND (p.status IN ('submitted','accepted','rejected') OR p.contributorId=${actor.user.id}))
          OR (p.contributorId=${actor.user.id} AND EXISTS (SELECT 1 FROM task t
            JOIN taskImage ti ON ti.taskId=t.id JOIN feature f ON f.id=t.featureId
            WHERE ti.imageId=i.id AND t.featureId=p.featureId AND t.contributorId=${actor.user.id}
              AND t.projectId=f.projectId AND t.organisationId=f.organisationId)))))`,
  )
}

/**
 * Resolves proposal-only photo evidence under the task's current ancestry.
 * @param db Request database.
 * @param revisionId Exact immutable upload revision.
 * @param actor Authenticated viewer and current roles.
 * @param adminOnly Require staff authority for full metadata.
 * @returns Authorized retained pin, or null.
 * @remarks Rechecks ancestry and visibility in the delivery query after authorization.
 */
async function readCreationImagePreview(
  db: Database,
  revisionId: string,
  actor: NonNullable<Parameters<typeof readFeatureImageRevisionPreview>[3]>,
  adminOnly: boolean,
): Promise<PinnedImageDelivery | null> {
  if (!(await hasFeatureLifecycleStorage(db))) return null
  const scope = await taskLifecycleScopeCondition(db)
  const evidence = sql`u.featureId IS NULL AND u.proposalId=t.proposalId
    AND u.imageRevisionId=${revisionId}
    AND EXISTS(SELECT 1 FROM json_each(u.taskIds) WHERE value=t.id)
    AND EXISTS(SELECT 1 FROM main.task AS task WHERE task.id=t.id AND (${scope}))`
  const tasks = await db.all<{
    id: string
    contributorId: string
    organisationId: string
    projectId: string
    resourceHubId: string | null
    isDraft: number
  }>(sql`
    SELECT t.id,t.contributorId,t.organisationId,t.projectId,o.hubId resourceHubId,t.isDraft
    FROM featureUploadEvidence u JOIN task t ON t.proposalId=u.proposalId
    JOIN taskImage ti ON ti.taskId=t.id AND ti.imageId=u.imageId
    JOIN organisation o ON o.id=t.organisationId WHERE ${evidence}`)
  for (const probe of tasks) {
    const admin = authorizeTaskReadForProbe({
      ...actor,
      probe,
      isAdminRequest: true,
    }).allowed
    if (adminOnly && !admin) continue
    if (!(admin && !probe.isDraft) && probe.contributorId !== actor.user.id) continue
    // Bind the delivery grant to the exact authorized task and parent chain.
    const pin = await readImageRevisionDelivery(
      db,
      revisionId,
      sql`EXISTS(
      SELECT 1 FROM featureUploadEvidence u JOIN task t ON t.proposalId=u.proposalId
      JOIN taskImage ti ON ti.taskId=t.id AND ti.imageId=u.imageId
      JOIN organisation o ON o.id=t.organisationId
      WHERE (${evidence}) AND u.imageId=i.id AND t.id=${probe.id}
        AND t.projectId=${probe.projectId} AND t.organisationId=${probe.organisationId}
        AND o.hubId IS ${probe.resourceHubId}
        AND ((${Number(admin)} AND t.isDraft=0) OR t.contributorId=${actor.user.id}))`,
    )
    if (pin) return pin
  }
  return null
}

/** Resolve retained reviewer image pins without granting public or contributor access.
 * @param db Request database. @param revisionId Exact requested pin. @param actor Current session.
 * @returns Staff-authorized review bytes, or null.
 */
async function readReviewedImagePreview(
  db: Database,
  revisionId: string,
  actor: NonNullable<Parameters<typeof readFeatureImageRevisionPreview>[3]>,
): Promise<PinnedImageDelivery | null> {
  const storage = await db.get<{ n: number }>(
    sql`SELECT count(*) n FROM pragma_table_info('featureRevisionReview') WHERE name='context'`,
  )
  if (!storage?.n) return null
  const scope = await taskLifecycleScopeCondition(db)
  const evidence = sql`json_extract(r.context,'$.kind')='image-review/v1'
    AND EXISTS(SELECT 1 FROM json_each(r.context,'$.gallery.entries') e WHERE json_extract(e.value,'$.imageRevisionId')=${revisionId})
    AND EXISTS(SELECT 1 FROM main.task AS task WHERE task.id=t.id AND (${scope}))`
  const rows = await db.all<{
    id: string
    projectId: string
    organisationId: string
    resourceHubId: string | null
  }>(sql`
    SELECT DISTINCT t.id,t.projectId,t.organisationId,o.hubId resourceHubId FROM featureRevisionReview r
    JOIN task t ON t.id=json_extract(r.context,'$.taskId') JOIN organisation o ON o.id=t.organisationId WHERE ${evidence}`)
  for (const probe of rows) {
    if (!authorizeTaskReadForProbe({ ...actor, probe, isAdminRequest: true }).allowed)
      continue
    const pin = await readImageRevisionDelivery(
      db,
      revisionId,
      sql`EXISTS(SELECT 1 FROM featureRevisionReview r
      JOIN task t ON t.id=json_extract(r.context,'$.taskId') JOIN organisation o ON o.id=t.organisationId
      WHERE (${evidence}) AND t.id=${probe.id} AND t.projectId=${probe.projectId}
        AND t.organisationId=${probe.organisationId} AND o.hubId IS ${probe.resourceHubId}
        AND EXISTS(SELECT 1 FROM json_each(r.context,'$.gallery.entries') e
          WHERE e.key=i.id AND json_extract(e.value,'$.imageRevisionId')=${revisionId}))`,
    )
    if (pin) return pin
  }
  return null
}
