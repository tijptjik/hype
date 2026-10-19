// DRIZZLE
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
// DOMAIN
import {
  comparePlacePublications,
  readPlacePublicationMetadata,
} from '#lib/places/publication.js'
// SERVICES
import { persistSaanSeoiPlace } from './placeSource'
import { adoptRefreshedPlaceForFeature } from './placeRefreshAdoption'
// TYPES
import type { D1Database } from '@cloudflare/workers-types'
import type { Database } from '#lib/types.js'
import type { PlacePublication } from '#lib/places/publication.js'
import type { SaanSeoiPlaceProjection } from '#lib/places/saanseoi.js'

type Item = {
  placeId: string
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
 * @returns Bounded progress state; complete means every scanned item was processed or held for review.
 * @remarks Reviews are durable terminal outcomes for this run, not accepted Feature values.
 * Retry reuses immutable source/proposal identities and group decisions. Missing sources
 * never deactivate or delete Features. This service does not make network requests.
 */
export async function processPlaceRefresh(
  binding: Pick<D1Database, 'prepare' | 'batch'>,
  input: { runId: string; lease: string; target: PlacePublication },
): Promise<string> {
  const db = drizzle(binding as D1Database) as Database
  // SQLite's clock is evaluated during the transaction, not before asynchronous preparation.
  const guard = sql`EXISTS(SELECT 1 FROM placeRefresh WHERE id=1 AND runId=${input.runId}
    AND phase='ready' AND lease=${input.lease}
    AND leaseUntil > CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))`
  const row = await binding
    .prepare(`SELECT placeId,ssId,status,projection,revisionId,featureCursor
    FROM placeRefreshItem WHERE runId=? AND status IN ('pending','missing')
    ORDER BY placeId LIMIT 1`)
    .bind(input.runId)
    .first<Item>()
  if (!row) {
    const completed =
      await db.run(sql`UPDATE placeRefresh SET accepted=target,phase='idle',
      failures=0,retryAt=0,lastError=NULL WHERE id=1 AND ${guard}
      AND NOT EXISTS(SELECT 1 FROM placeRefreshItem WHERE runId=${input.runId} AND status IN ('pending','missing'))`)
    return completed.meta.changes ? 'complete' : 'superseded'
  }
  /** Retain a source review outcome. @param reason Stable review code. @returns Saved outcome or lost ownership. */
  const hold = async (reason: string): Promise<string> => {
    const saved =
      await db.run(sql`UPDATE placeRefreshItem SET status='review',reviewReason=${reason}
      WHERE runId=${input.runId} AND placeId=${row.placeId} AND ${guard}`)
    return saved.meta.changes ? 'review' : 'superseded'
  }
  if (row.status === 'missing' || !row.projection) return hold('source-missing')
  const identity = await binding
    .prepare('SELECT ssId FROM place WHERE id=?')
    .bind(row.placeId)
    .first<{ ssId: string | null }>()
  if (identity?.ssId !== row.ssId) return hold('source-identity-changed')
  if (!row.revisionId) {
    const projection = JSON.parse(row.projection) as SaanSeoiPlaceProjection
    try {
      if (
        projection.ssId !== row.ssId ||
        comparePlacePublications(
          input.target,
          readPlacePublicationMetadata(projection.payload.meta),
        ) !== 'unchanged'
      )
        return hold('publication-mismatch')
    } catch {
      return hold('publication-metadata-missing')
    }
    const receipt = await persistSaanSeoiPlace(
      db,
      projection,
      sql`${guard}
      AND EXISTS(SELECT 1 FROM place WHERE id=${row.placeId} AND ssId=${row.ssId})`,
    )
    if (receipt.placeId !== row.placeId) return hold('source-identity-changed')
    const saved =
      await db.run(sql`UPDATE placeRefreshItem SET revisionId=${receipt.revisionId}
      WHERE runId=${input.runId} AND placeId=${row.placeId} AND ${guard}
      AND EXISTS(SELECT 1 FROM placeRevision WHERE id=${receipt.revisionId} AND placeId=${row.placeId})`)
    return saved.meta.changes ? 'ingested' : 'superseded'
  }
  const feature = await binding
    .prepare(`SELECT f.id,f.projectId FROM feature f
    JOIN featurePlace fp ON fp.featureId=f.id WHERE fp.placeId=? AND f.isDraft=0
    AND f.id>? ORDER BY f.id LIMIT 1`)
    .bind(row.placeId, row.featureCursor)
    .first<{ id: string; projectId: string }>()
  if (!feature) {
    const saved = await db.run(sql`UPDATE placeRefreshItem SET status='processed'
      WHERE runId=${input.runId} AND placeId=${row.placeId} AND ${guard}`)
    return saved.meta.changes ? 'processed' : 'superseded'
  }
  const result = await adoptRefreshedPlaceForFeature(db, {
    featureId: feature.id,
    projectId: feature.projectId,
    placeId: row.placeId,
    candidateRevisionId: row.revisionId,
    guard,
  })
  if (result.status === 'superseded') return 'superseded'
  // Outcome and cursor are atomic; interrupted group applications are replay-safe.
  const fence = `EXISTS(SELECT 1 FROM placeRefresh WHERE id=1 AND runId=?
    AND phase='ready' AND lease=?
    AND leaseUntil > CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))`
  const saved = await binding.batch([
    binding
      .prepare(`INSERT INTO placeRefreshFeature(runId,placeId,featureId,projectId,proposalId,reason,outcome,geometryChanged)
      SELECT ?,?,?,?,?,?,?,? WHERE ${fence}
      ON CONFLICT(runId,placeId,featureId) DO NOTHING`)
      .bind(
        input.runId,
        row.placeId,
        feature.id,
        feature.projectId,
        result.proposalId ?? null,
        result.reason ?? null,
        result.status,
        Number(result.geometryChanged),
        input.runId,
        input.lease,
      ),
    binding
      .prepare(`UPDATE placeRefreshItem SET featureCursor=?
      WHERE runId=? AND placeId=? AND ${fence}`)
      .bind(feature.id, input.runId, row.placeId, input.runId, input.lease),
  ])
  return saved[1].meta.changes ? 'assessed' : 'superseded'
}
