// DRIZZLE
import { sql } from 'drizzle-orm'
// AUTHORIZATION
import { authorizeFeatureAdminReadForProbe } from './authz/feature'
// SERVICES
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
export async function readFeatureImageRevisionPreview(db: Database, revisionId: string, featureId: string | null, actor?: {
  user: Parameters<typeof authorizeFeatureAdminReadForProbe>[0]['user']; userRoles: UserRoleDisco[]
}, adminOnly = false): Promise<PinnedImageDelivery | null> {
  const publicPin = await readImageRevisionDelivery(db, revisionId)
  if (publicPin && !adminOnly) return publicPin
  if (!featureId || !actor) return null
  const probe = await probeFeatureQuery(db, { ref: featureId as Id, refKey: 'id' })
  if (!probe) return null
  const admin = authorizeFeatureAdminReadForProbe({ user: actor.user, userRoles: actor.userRoles, probe }).allowed
  if (adminOnly && !admin) return null
  const scope = buildFeatureCommandScopeGuard(db, featureId, probe)
  const privateComparison = admin ? await privateFeatureComparison(db, sql`h.featureId`, sql`h.generation`) : sql`NULL`
  const privateStorage = admin && await db.get<{ n: number }>(sql`SELECT count(*) n FROM sqlite_master WHERE name='featurePrivateCapture' AND type='table'`)
  // Approved private maintenance remains inspectable after a later capture or publication.
  // This grant never includes ordinary drafts and still uses current Feature authority.
  const privateHistory = privateStorage && privateStorage.n ? sql`EXISTS (
    SELECT 1 FROM featurePrivateCapture capture JOIN featureRevisionImage pin ON pin.featureRevisionId=capture.revisionId
    WHERE capture.featureId=${featureId} AND pin.imageId=i.id AND pin.imageRevisionId=${revisionId})` : sql`0`
  const uploadStorage = await db.get<{n:number}>(sql`SELECT count(*) n FROM sqlite_master WHERE name='featureImageUploadRevision' AND type='table'`)
  const evidence = uploadStorage?.n ? await featureUploadEvidenceSource(db) : null
  const taskEvidence = evidence ? sql`EXISTS(SELECT 1 FROM ${evidence} u JOIN json_each(u.taskIds) j
    JOIN task t ON t.id=j.value AND t.featureId=u.featureId JOIN taskImage ti ON ti.taskId=t.id AND ti.imageId=u.imageId
    JOIN feature f ON f.id=t.featureId WHERE u.featureId=${featureId} AND u.imageId=i.id AND u.imageRevisionId=${revisionId}
      AND t.projectId=f.projectId AND t.organisationId=f.organisationId
      AND ((${Number(admin)} AND t.isDraft=0) OR t.contributorId=${actor.user.id}))` : sql`0`
  return readImageRevisionDelivery(db, revisionId, sql`(${scope}) AND ((${Number(admin)} AND EXISTS (
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
              AND t.projectId=f.projectId AND t.organisationId=f.organisationId)))))`)
}

