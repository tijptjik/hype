// DRIZZLE
import { sql, type SQL } from 'drizzle-orm'

/** Recheck the Feature that requested a background identity comparison.
 * @param reviewId Server-retained identity review ID.
 * @returns A predicate for capture, review reads and atomic identity/merge writes.
 * @remarks Interactive reviews have no rematch metadata and keep their existing guards.
 * Tokens include the full address envelope, so even edits that retain a timestamp are fenced.
 */
export function locationRematchReviewGuard(reviewId: string | SQL): SQL {
  return sql`NOT EXISTS (SELECT 1 FROM locationIdentityReview rr
    WHERE rr.id=${reviewId} AND json_extract(rr.projection,'$.rawSource.hypeRematch') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM feature f JOIN featureLocation fl ON fl.featureId=f.id
      JOIN project p ON p.id=f.projectId JOIN location l ON l.id=fl.locationId
      WHERE f.id=json_extract(rr.projection,'$.rawSource.hypeRematch.featureId')
        AND f.isDraft=0 AND f.isArchived=0 AND fl.locationId=rr.locationId
        AND f.projectId=json_extract(rr.projection,'$.rawSource.hypeRematch.projectId')
        AND f.modifiedAt=json_extract(rr.projection,'$.rawSource.hypeRematch.modifiedAt')
        AND fl.version=json_extract(rr.projection,'$.rawSource.hypeRematch.version')
        AND f.addressMeta=json_extract(rr.projection,'$.rawSource.hypeRematch.addressMeta')
        AND EXISTS(SELECT 1 FROM locationRematchJob j JOIN locationRematchRun run ON run.id=1 AND run.generation=j.generation AND COALESCE(run.lastError,'')!='PUBLICATION_REVIEW_REQUIRED'
          WHERE j.id=json_extract(rr.projection,'$.rawSource.hypeRematch.jobId')
          AND j.generation=json_extract(rr.projection,'$.rawSource.hypeRematch.generation') AND j.status IN ('matched','ambiguous'))
        AND json_extract(f.addressMeta,'$.address.association.mode')='unlinked'
        AND (l.ownerOrganisationId IS NULL OR l.ownerOrganisationId=p.organisationId)
        AND NOT EXISTS(SELECT 1 FROM location occupied
          WHERE occupied.ssId=json_extract(rr.projection,'$.ssId') AND occupied.id!=l.id
            AND (occupied.state='redirect' OR occupied.sourceAvailability!='current'
              OR (occupied.ownerOrganisationId IS NOT NULL AND occupied.ownerOrganisationId!=p.organisationId)))
    ))`
}
