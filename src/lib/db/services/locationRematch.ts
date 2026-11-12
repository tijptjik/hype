// DRIZZLE
import { sql, type SQL } from 'drizzle-orm'
// SCHEMA
import { locationIdentityReview } from '../schema/location'
import { locationRematchJob, locationRematchReview } from '../schema/locationRematch'
// DOMAIN
import {
  readLocationPublicationMetadata,
  discoverLocationPublication,
  compareLocationPublications,
} from '#lib/locations/publication.js'
import { readSaanSeoiPlacePage } from '#lib/locations/sourceClient.js'
import { searchNearbySaanSeoiPlaces } from '#lib/locations/nearbySource.js'
import { hydrateSaanSeoiPlaceAddress } from '#lib/locations/sourceAddress.js'
import { FeatureAddressSchema } from '#lib/addresses/featureAddress.js'
import { scoreLocationRematch } from '#lib/locations/rematch.js'
import { equalLocationValue } from '#lib/locations/baseline.js'
// SERVICES
import { readLocationIdentityBaseline } from './locationIdentityReview'
import { prepareSaanSeoiRevision } from './locationSource'
// TYPES
import type { Database } from '#lib/types.js'
import type { PlaceSourceClient } from '#lib/locations/sourceClient.js'
import type { PlacePublication } from '#lib/locations/publication.js'
import type { LocationIdentityBaseline } from '#lib/locations/identity.js'

// ═══════════════════════
// TABLE OF CONTENTS
// 1. DURABLE PUBLICATION SCAN
// 2. BOUNDED LOOKUP AND REVIEW RECEIPTS
// 3. AUTHORIZED RETRY
// ---
type Run = {
  publication: string | null
  generation: number
  cursor: string
  scanning: number
  checkedAt: number
  lastError: string | null
}
type Eligible = {
  featureId: string
  projectId: string
  locationId: string
  ownerOrganisationId: string | null
  kind: string
  intent: string
  addressMeta: string
}
type Job = {
  id: string
  featureId: string
  projectId: string
  locationId: string
  intent: string
  baseline: string
  publication: string
  generation: number
  candidates: string | null
  candidateCursor: number
  attempts: number
}

/** Discover publications, page eligible intent, or process one lookup checkpoint under a lease.
 * @param db Primary-session database. @param source Trusted provider transport.
 * @returns Stable operational phase; no Feature or Location values are changed.
 * @remarks Each invocation seeds at most 25 Features or resolves one source identity. Discovery
 * uses a bounded nearby index; canonical evidence is always read using the retained publication pin.
 * The nearby index cannot attest historical completeness, so empty coverage is deferred, never no-match.
 */
export async function processLocationRematching(
  db: Database,
  source: PlaceSourceClient,
): Promise<string> {
  const lease = crypto.randomUUID()
  const now = sql`CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)`
  const acquired =
    await db.run(sql`UPDATE locationRematchRun SET lease=${lease},leaseUntil=${now}+240000
    WHERE id=1 AND leaseUntil<=${now} AND retryAt<=${now}`)
  if (!acquired.meta.changes) return 'busy'
  const fence = sql`EXISTS(SELECT 1 FROM locationRematchRun WHERE id=1 AND lease=${lease} AND leaseUntil>${now})`
  let active: Job | undefined
  try {
    const run = await db.get<Run>(sql`SELECT * FROM locationRematchRun WHERE id=1`)
    if (!run.publication || (!run.scanning && run.checkedAt < Date.now() - 86400000)) {
      const target = await discoverLocationPublication(source)
      const transition = compareLocationPublications(
        run.publication ? JSON.parse(run.publication) : null,
        target,
      )
      if (transition === 'review') {
        await db.run(
          sql`UPDATE locationRematchRun SET checkedAt=${now},lastError='PUBLICATION_REVIEW_REQUIRED' WHERE id=1 AND ${fence}`,
        )
        return 'publication-review'
      }
      await db.run(sql`UPDATE locationRematchRun SET publication=${JSON.stringify(target)},
        generation=generation+${Number(transition !== 'unchanged')},cursor='',scanning=1,checkedAt=${now},failures=0,retryAt=0,lastError=NULL
        WHERE id=1 AND ${fence}`)
      return 'publication'
    }
    if (run.lastError === 'PUBLICATION_REVIEW_REQUIRED') return 'publication-review'
    if (run.scanning) {
      const rows = await db.all<Eligible>(
        sql`SELECT * FROM locationRematchEligible WHERE featureId>${run.cursor} ORDER BY featureId LIMIT 25`,
      )
      for (const row of rows) {
        const baseline = await readLocationIdentityBaseline(
          db,
          row.locationId,
          row.ownerOrganisationId,
        )
        if (!baseline) continue
        // SQL rechecks the complete authored input after the baseline read; no implicit opt-in.
        await db.run(sql`INSERT INTO locationRematchJob(id,featureId,projectId,locationId,intent,baseline,publication,generation)
          SELECT ${crypto.randomUUID()},${row.featureId},${row.projectId},${row.locationId},${row.intent},${JSON.stringify(baseline)},${run.publication},${run.generation}
          WHERE ${fence} AND EXISTS(SELECT 1 FROM locationRematchEligible WHERE featureId=${row.featureId} AND intent=${row.intent} AND locationId=${row.locationId})
          ON CONFLICT(featureId,intent) DO UPDATE SET publication=excluded.publication,generation=excluded.generation,
            baseline=excluded.baseline,status='pending',candidates=NULL,candidateCursor=0,attempts=0,retryAt=0,reason=NULL
          WHERE locationRematchJob.generation!=excluded.generation OR locationRematchJob.baseline!=excluded.baseline`)
      }
      await db.run(sql`UPDATE locationRematchRun SET cursor=${rows.at(-1)?.featureId ?? run.cursor},scanning=${Number(rows.length === 25)}
        WHERE id=1 AND ${fence}`)
      return 'seeded'
    }
    active =
      await db.get<Job>(sql`SELECT * FROM locationRematchCurrent WHERE status IN ('pending','checking','deferred','failed')
      AND retryAt<=${now} AND attempts<5 ORDER BY retryAt,id LIMIT 1`)
    if (!active) return 'idle'
    const guard = sql`${fence} AND EXISTS(SELECT 1 FROM locationRematchCurrent WHERE id=${active.id} AND generation=${active.generation})`
    return await processJob(db, source, active, guard)
  } catch {
    // Error payloads may contain private source data; durable status stores only stable codes.
    if (active)
      await db.run(sql`UPDATE locationRematchJob SET status='failed',reason='PROVIDER_OR_STORAGE_FAILED',attempts=attempts+1,
      retryAt=${now}+min(86400000,300000*(1 << min(attempts,8))) WHERE id=${active.id} AND generation=${active.generation} AND ${fence}`)
    else
      await db.run(sql`UPDATE locationRematchRun SET failures=failures+1,retryAt=${now}+min(3600000,30000*(1 << min(failures,7))),
      lastError='REMATCH_DISCOVERY_FAILED' WHERE id=1 AND ${fence}`)
    return 'failed'
  } finally {
    await db.run(
      sql`UPDATE locationRematchRun SET lease=NULL,leaseUntil=0 WHERE id=1 AND lease=${lease}`,
    )
  }
}

/** Resolve one job stage and retain a candidate before advancing its cursor.
 * @param db Primary-session database. @param source Trusted source client.
 * @param job Durable generation and authored baseline. @param guard Live lease and intent fence.
 * @returns Stable progress or deferred coverage reason.
 */
async function processJob(
  db: Database,
  source: PlaceSourceClient,
  job: Job,
  guard: SQL,
): Promise<string> {
  const intent = JSON.parse(job.intent) as {
    addressMeta: string
    modifiedAt: string
    version: string
  }
  const parsed = FeatureAddressSchema.safeParse(JSON.parse(intent.addressMeta).address)
  const baseline = JSON.parse(job.baseline) as LocationIdentityBaseline
  const current = await readLocationIdentityBaseline(
    db,
    job.locationId,
    baseline.expectedOwnerOrganisationId,
  )
  if (!equalLocationValue(current, baseline)) {
    await db.run(
      sql`UPDATE locationRematchJob SET status='suppressed',reason='IDENTITY_CHANGED' WHERE id=${job.id} AND ${guard}`,
    )
    return 'stale'
  }
  /** Retain unavailable coverage without recording a false negative. @param reason Stable code. @returns Deferred phase. */
  const defer = async (reason: string): Promise<string> => {
    await db.run(sql`UPDATE locationRematchJob SET status='deferred',reason=${reason},attempts=attempts+1,candidates=NULL,candidateCursor=0,
      retryAt=CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)+86400000 WHERE id=${job.id} AND ${guard}`)
    return 'deferred'
  }
  if (!parsed.success) return defer('INVALID_ADDRESS_EVIDENCE')
  const address = parsed.data
  if (!address.coordinates) return defer('MISSING_COORDINATES')
  if (address.association?.kind !== 'establishment')
    return defer('PROVIDER_UNAVAILABLE')
  if (!Object.values(address.association.names).some(name => name.trim()))
    return defer('MISSING_IDENTITY_NAME')
  if (!job.candidates) {
    const found = await searchNearbySaanSeoiPlaces(source, {
      coordinates: address.coordinates,
      radius: 100,
    })
    await db.run(sql`UPDATE locationRematchJob SET status='checking',candidates=${JSON.stringify(found.candidates.map(row => row.placeId))},
      candidateCursor=0,incomplete=1,reason=${found.partial ? 'PARTIAL_PROVIDER' : found.limited ? 'COVERAGE_LIMIT' : 'UNPINNED_DISCOVERY_COVERAGE'}
      WHERE id=${job.id} AND ${guard}`)
    return 'discovered'
  }
  const ids = JSON.parse(job.candidates) as string[]
  const ssId = ids[job.candidateCursor]
  if (!ssId) {
    const count = await db.get<{
      n: number
    }>(sql`SELECT count(*) n FROM locationRematchReview m JOIN locationIdentityReview r ON r.id=m.reviewId
      WHERE m.jobId=${job.id} AND m.generation=${job.generation} AND r.rejection IS NULL`)
    if (!count.n) {
      const rejected = await db.get<{
        n: number
      }>(sql`SELECT count(*) n FROM locationRematchReview m JOIN locationIdentityReview r ON r.id=m.reviewId
        WHERE m.jobId=${job.id} AND r.rejection IS NOT NULL`)
      if (rejected.n) {
        await db.run(
          sql`UPDATE locationRematchJob SET status='suppressed',reason='REJECTED_CANDIDATES' WHERE id=${job.id} AND ${guard}`,
        )
        return 'suppressed'
      }
      return defer('INCOMPLETE_NO_CANDIDATE')
    }
    await db.run(
      sql`UPDATE locationRematchJob SET status=${count.n > 1 ? 'ambiguous' : 'matched'},attempts=0,retryAt=0 WHERE id=${job.id} AND ${guard}`,
    )
    return count.n > 1 ? 'ambiguous' : 'matched'
  }
  const allowed = await db.get<{
    allowed: number
  }>(sql`SELECT NOT EXISTS(SELECT 1 FROM location WHERE ssId=${ssId}
    AND (state='redirect' OR sourceAvailability!='current' OR (ownerOrganisationId IS NOT NULL AND ownerOrganisationId IS NOT ${baseline.expectedOwnerOrganisationId})))
    AND NOT EXISTS(SELECT 1 FROM locationRematchReview m JOIN locationRematchJob j ON j.id=m.jobId
      JOIN locationIdentityReview r ON r.id=m.reviewId WHERE j.featureId=${job.featureId} AND j.locationId=${job.locationId}
      AND j.intent=${job.intent} AND m.ssId=${ssId} AND r.rejection IS NOT NULL) AS allowed`)
  if (allowed.allowed) {
    const target = JSON.parse(job.publication) as PlacePublication
    const page = await readSaanSeoiPlacePage(source, target.pin, 0, { id: ssId })
    if (
      page.nextOffset !== null ||
      page.places.length > 1 ||
      page.places.some(row => row.ssId !== ssId)
    )
      throw new Error('REMATCH_PIN_MISMATCH')
    if (page.places[0]) {
      const projection = await hydrateSaanSeoiPlaceAddress(source, page.places[0])
      if (
        compareLocationPublications(
          target,
          readLocationPublicationMetadata(projection.rawSource.meta),
        ) !== 'unchanged'
      )
        throw new Error('REMATCH_PUBLICATION_MISMATCH')
      const evidence = scoreLocationRematch(address, projection)
      if (evidence) {
        await prepareSaanSeoiRevision(job.locationId, projection)
        const id = await rematchReviewId(job, ssId)
        // Retain immutable provenance plus Feature tokens; acceptance still uses the existing owner-authorized service.
        projection.rawSource = {
          ...projection.rawSource,
          hypeRematch: {
            featureId: job.featureId,
            projectId: job.projectId,
            jobId: job.id,
            ...intent,
            generation: job.generation,
            publication: target,
            evidence,
            incomplete: true,
            proposedChanges: ['sourceIdentity'],
            preserveFeatureValues: true,
          },
        }
        const captureGuard = sql`${guard}
          AND (SELECT id FROM locationRevisionContent AS locationRevision WHERE locationId=${job.locationId} ORDER BY version DESC LIMIT 1)=${baseline.expectedLatestRevisionId}
          AND EXISTS(SELECT 1 FROM location WHERE id=${job.locationId} AND state=${baseline.expectedState} AND ssId IS ${baseline.expectedSsId}
            AND ownerOrganisationId IS ${baseline.expectedOwnerOrganisationId} AND sourceAvailability=${baseline.expectedSourceAvailability})
          AND (SELECT h.id FROM locationIdentityHistory h WHERE h.locationId=${job.locationId}
            AND NOT EXISTS(SELECT 1 FROM locationIdentityHistory n WHERE n.previousHistoryId=h.id)) IS ${baseline.expectedHistoryId}
          AND NOT EXISTS(SELECT 1 FROM location WHERE ssId=${ssId} AND (state='redirect' OR sourceAvailability!='current'
            OR (ownerOrganisationId IS NOT NULL AND ownerOrganisationId IS NOT ${baseline.expectedOwnerOrganisationId})))`
        // Receipt, review and cursor commit together; a crashed or expired worker cannot duplicate evidence.
        const saved = await db.batch([
          db
            .insert(locationIdentityReview)
            .select(sql`SELECT ${id},${job.locationId},${baseline.expectedOwnerOrganisationId},${job.baseline},${JSON.stringify(projection)},'system:location-rematch','[]',NULL,
              (SELECT createdAt FROM locationRematchJob WHERE id=${job.id}) WHERE ${captureGuard}`)
            .onConflictDoNothing(),
          db
            .insert(locationRematchReview)
            .select(sql`SELECT ${id},${job.id},${job.generation},${ssId},${JSON.stringify(evidence)}
            WHERE EXISTS(SELECT 1 FROM locationIdentityReview WHERE id=${id}) AND ${guard}`)
            .onConflictDoNothing(),
          db
            .update(locationRematchJob)
            .set({ candidateCursor: sql`candidateCursor+1` })
            .where(sql`id=${job.id}
            AND candidateCursor=${job.candidateCursor} AND ${guard}
            AND EXISTS(SELECT 1 FROM locationRematchReview WHERE reviewId=${id})`)
            .returning({ id: locationRematchJob.id }),
        ])
        return saved[2].length ? 'candidate' : 'superseded'
      }
    }
  }
  await db.run(
    sql`UPDATE locationRematchJob SET candidateCursor=candidateCursor+1 WHERE id=${job.id} AND candidateCursor=${job.candidateCursor} AND ${guard}`,
  )
  return 'checked'
}

/** Derive a receipt from identity, not discovery order, so retries can reorder nearby results.
 * @param job Durable intent and publication generation. @param ssId Verified source identity.
 * @returns Bounded deterministic review ID.
 */
async function rematchReviewId(job: Job, ssId: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify([job.id, job.generation, ssId])),
  )
  return `rematch:${Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('')}`
}

/** Retry current deferred work after the caller authorizes Location identity management.
 * @param db Primary request database. @param input Authorized Location and exact job ID.
 * @returns Whether eligible work was queued. Rejections stay suppressed across retry/publication.
 */
export async function retryLocationRematch(
  db: Database,
  input: { locationId: string; jobId: string },
): Promise<boolean> {
  const result =
    await db.run(sql`UPDATE locationRematchJob SET status='pending',attempts=0,retryAt=0,candidates=NULL,candidateCursor=0
    WHERE id=${input.jobId} AND locationId=${input.locationId} AND status IN ('deferred','failed')
    AND EXISTS(SELECT 1 FROM locationRematchCurrent c WHERE c.id=locationRematchJob.id)
    AND NOT EXISTS(SELECT 1 FROM locationRematchRun WHERE leaseUntil>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))`)
  return Boolean(result.meta.changes)
}
