// DRIZZLE
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
// DOMAIN
import {
  compareLocationPublications,
  readLocationPublicationMetadata,
} from '#lib/locations/publication.js'
import { hydrateSaanSeoiPlaceAddress } from '#lib/locations/sourceAddress.js'
// SERVICES
import {
  persistForwardSaanSeoiPlace,
  LocationSourceConflictError,
  LocationSourceReviewError,
} from './locationSource'
import { adoptRefreshedLocationForFeature } from './locationRefreshAdoption'
// TYPES
import type { D1Database } from '@cloudflare/workers-types'
import type { Database } from '#lib/types.js'
import type { PlacePublication } from '#lib/locations/publication.js'
import type { SaanSeoiPlaceProjection } from '#lib/locations/saanseoi.js'

import type { PlaceSourceClient } from '#lib/locations/sourceClient.js'

type Item = {
  locationId: string
  ssId: string
  status: 'missing' | 'pending'
  projection: string | null
  revisionId: string | null
  featureCursor: string
}

/**
 * Process one run item or Feature, retaining the outcome before advancing its cursor.
 * @param binding Primary-session D1 connection owned by the refresh caller.
 * @param input Active pinned run and lease; database time is checked inside SQL at each write.
 * @param source Trusted source client for pinned Address reads before ingestion.
 * @returns Bounded progress state; complete means every scanned item was processed or held for review.
 * @remarks Reviews are durable terminal outcomes for this run, not accepted Feature values.
 * Retry reuses immutable source/proposal identities and group decisions. Missing sources
 * never deactivate or delete Features. Address hydration makes at most two requests before the fenced source write.
 */
export async function processLocationRefresh(
  binding: Pick<D1Database, 'prepare' | 'batch'>,
  input: { runId: string; lease: string; target: PlacePublication },
  source?: PlaceSourceClient,
): Promise<string> {
  const db = drizzle(binding as D1Database) as Database
  // SQLite's clock is evaluated during the transaction, not before asynchronous preparation.
  const guard = sql`EXISTS(SELECT 1 FROM locationRefresh WHERE id=1 AND runId=${input.runId}
    AND phase='ready' AND lease=${input.lease}
    AND leaseUntil > CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))`
  const row = await binding
    .prepare(`SELECT locationId,ssId,status,projection,revisionId,featureCursor
    FROM locationRefreshItem WHERE runId=? AND status IN ('pending','missing')
    ORDER BY locationId LIMIT 1`)
    .bind(input.runId)
    .first<Item>()
  if (!row) {
    const completed =
      await db.run(sql`UPDATE locationRefresh SET accepted=target,phase='idle',
      failures=0,retryAt=0,lastError=NULL WHERE id=1 AND ${guard}
      AND NOT EXISTS(SELECT 1 FROM locationRefreshItem WHERE runId=${input.runId} AND status IN ('pending','missing'))`)
    return completed.meta.changes ? 'complete' : 'superseded'
  }
  /** Retain a source review outcome. @param reason Stable review code. @returns Saved outcome or lost ownership. */
  const hold = async (reason: string): Promise<string> => {
    const saved =
      await db.run(sql`UPDATE locationRefreshItem SET status='review',reviewReason=${reason}
      WHERE runId=${input.runId} AND locationId=${row.locationId} AND ${guard}`)
    return saved.meta.changes ? 'review' : 'superseded'
  }
  if (row.status === 'missing' || !row.projection) return hold('source-missing')
  const identity = await binding
    .prepare('SELECT ssId FROM location WHERE id=?')
    .bind(row.locationId)
    .first<{ ssId: string | null }>()
  if (identity?.ssId !== row.ssId) return hold('source-identity-changed')
  if (!row.revisionId) {
    let projection = JSON.parse(row.projection) as SaanSeoiPlaceProjection
    try {
      if (
        projection.ssId !== row.ssId ||
        compareLocationPublications(
          input.target,
          readLocationPublicationMetadata(projection.rawSource.meta),
        ) !== 'unchanged'
      )
        return hold('publication-mismatch')
    } catch {
      return hold('publication-metadata-missing')
    }
    // Hydrate only this tracked item; a full scan page never fans out Address requests.
    if (source) projection = await hydrateSaanSeoiPlaceAddress(source, projection)
    else if (projection.issues.some(issue => issue.kind === 'addressRecordsPending'))
      throw new Error('Location Address hydration requires a source client')
    let receipt: { locationId: string; revisionId: string }
    // A long scan cannot overwrite newer mirror evidence or discard hydrated Addresses.
    try {
      receipt = await persistForwardSaanSeoiPlace(
        db,
        projection,
        sql`${guard}
        AND EXISTS(SELECT 1 FROM location WHERE id=${row.locationId} AND ssId=${row.ssId})`,
      )
    } catch (error) {
      if (error instanceof LocationSourceReviewError)
        return hold('source-evidence-conflict')
      if (error instanceof LocationSourceConflictError) {
        const owned = await db.get<{ owned: number }>(
          sql`SELECT CASE WHEN (${guard}) THEN 1 ELSE 0 END AS owned`,
        )
        if (!owned.owned) return 'superseded'
      }
      throw error
    }
    if (receipt.locationId !== row.locationId) return hold('source-identity-changed')
    const saved =
      await db.run(sql`UPDATE locationRefreshItem SET revisionId=${receipt.revisionId}
      WHERE runId=${input.runId} AND locationId=${row.locationId} AND ${guard}
      AND EXISTS(SELECT 1 FROM locationRevision WHERE id=${receipt.revisionId} AND locationId=${row.locationId})`)
    return saved.meta.changes ? 'ingested' : 'superseded'
  }
  const feature = await binding
    .prepare(`SELECT f.id,f.projectId FROM feature f
    JOIN featureLocation fp ON fp.featureId=f.id WHERE fp.locationId=? AND f.isDraft=0
    AND f.id>? ORDER BY f.id LIMIT 1`)
    .bind(row.locationId, row.featureCursor)
    .first<{ id: string; projectId: string }>()
  if (!feature) {
    const saved = await db.run(sql`UPDATE locationRefreshItem SET status='processed'
      WHERE runId=${input.runId} AND locationId=${row.locationId} AND ${guard}`)
    return saved.meta.changes ? 'processed' : 'superseded'
  }
  const result = await adoptRefreshedLocationForFeature(db, {
    featureId: feature.id,
    projectId: feature.projectId,
    locationId: row.locationId,
    candidateRevisionId: row.revisionId,
    guard,
  })
  if (result.status === 'superseded') return 'superseded'
  // Outcome and cursor are atomic; interrupted group applications are replay-safe.
  const fence = `EXISTS(SELECT 1 FROM locationRefresh WHERE id=1 AND runId=?
    AND phase='ready' AND lease=?
    AND leaseUntil > CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))`
  const saved = await binding
    .prepare(`UPDATE locationRefreshItem
    SET featureCursor=?,outcomes=CASE WHEN EXISTS(SELECT 1 FROM json_each(outcomes) WHERE key=?)
      THEN outcomes ELSE json_patch(outcomes,json_object(?,json(?))) END
    WHERE runId=? AND locationId=? AND ${fence}`)
    .bind(
      feature.id,
      feature.id,
      feature.id,
      JSON.stringify({
        projectId: feature.projectId,
        proposalId: result.proposalId ?? null,
        reason: result.reason ?? null,
        outcome: result.status,
        geometryChanged: Number(result.geometryChanged),
      }),
      input.runId,
      row.locationId,
      input.runId,
      input.lease,
    )
    .run()
  return saved.meta.changes ? 'assessed' : 'superseded'
}
