// API
import {
  apiRead,
  bounds,
  changeSchema,
  changesSchema,
  covers,
  geocodeSchema,
} from './api'
// TYPES
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'
import type { ApiOptions, GeocodeResponse } from './api'

// ═══════════════════════
// TABLE OF CONTENTS
// 1. Durable state and fenced writes
// 2. Release discovery and change scanning
// 3. Geocoding and atomic membership replacement
// ═══════════════════════

type State = {
  appliedRelease: string | null
  targetRelease: string | null
  targetReleaseId: string | null
  comparisonId: string | null
  cursor: string | null
  phase: 'idle' | 'changes' | 'scan' | 'geocode'
  checkedMonth: string | null
}
type Feature = { id: string; geometry: string }
type Job = Feature & { generation: number; attempts: number }
type RefreshDatabase = Pick<D1Database, 'prepare' | 'batch'>
const FENCE = 'EXISTS(SELECT 1 FROM divisionRefresh WHERE id=1 AND lease=?)'

/**
 * Runs one bounded durable refresh step, with exclusive fenced ownership.
 * @param db Environment's primary D1 binding.
 * @param api SaanSeoi connection.
 * @param now Clock for monthly discovery, leases and retry scheduling.
 * @returns Work phase or a competing-owner indication.
 * @remarks Frequent ticks drain local work; upstream release discovery occurs once per UTC month.
 */
export async function refreshDivisions(
  db: RefreshDatabase,
  api: ApiOptions,
  now = Date.now(),
): Promise<string> {
  const lease = crypto.randomUUID()
  const acquired = await db
    .prepare(
      'UPDATE divisionRefresh SET lease=?,leaseUntil=? WHERE id=1 AND leaseUntil<=?',
    )
    .bind(lease, now + 240000, now)
    .run()
  if (!acquired.meta.changes) return 'busy'
  // All mutations carry this fence, including batched membership writes after network calls.
  const statement = (sql: string, values: unknown[] = []): D1PreparedStatement =>
    db.prepare(sql).bind(...values, lease)
  try {
    const state = await db
      .prepare('SELECT * FROM divisionRefresh WHERE id=1')
      .first<State>()
    if (!state) throw new Error('DIVISION_REFRESH_STATE_MISSING')
    const month = new Date(now).toISOString().slice(0, 7)
    if (
      state.phase === 'idle' &&
      (!state.appliedRelease || state.checkedMonth !== month)
    ) {
      if (!state.appliedRelease) {
        // Resolve one concrete publication before bootstrapping all queued features.
        const result = await apiRead(
          api,
          '/divisions/v1/geocode',
          { lat: '22.3', lng: '114.2', locales: 'en,zh-hant', profile: 'full' },
          geocodeSchema,
        )
        await statement(
          `UPDATE divisionRefresh SET targetRelease=?,phase='geocode',checkedMonth=? WHERE id=1 AND ${FENCE}`,
          [result.meta.release.apiReleaseSet, month],
        ).run()
      } else {
        await statement(
          `UPDATE divisionRefresh SET phase='changes',cursor=NULL,comparisonId=NULL,
          targetRelease=NULL,targetReleaseId=NULL,checkedMonth=? WHERE id=1 AND ${FENCE}`,
          [month],
        ).run()
      }
      return 'started'
    }
    if (state.phase === 'changes') {
      await loadChanges(db, api, state, statement)
    } else if (state.phase === 'scan') {
      await scanChange(db, state, statement)
    } else {
      await geocodeJobs(db, api, state, statement, now)
    }
    await statement(
      `UPDATE divisionRefresh SET lastError=NULL WHERE id=1 AND ${FENCE}`,
    ).run()
    return state.phase
  } catch (error) {
    await statement(`UPDATE divisionRefresh SET lastError=? WHERE id=1 AND ${FENCE}`, [
      String(error).slice(0, 1000),
    ]).run()
    throw error
  } finally {
    await statement(
      `UPDATE divisionRefresh SET lease=NULL,leaseUntil=0 WHERE id=1 AND ${FENCE}`,
    ).run()
  }
}

type Statement = (sql: string, values?: unknown[]) => D1PreparedStatement

/**
 * Persists one pinned changes page before any cursor advance can become visible.
 * @param db Primary database.
 * @param api Remote API.
 * @param state Pinned comparison progress.
 * @param statement Fenced prepared-statement factory.
 * @returns Completion of the atomic page publication.
 */
async function loadChanges(
  db: RefreshDatabase,
  api: ApiOptions,
  state: State,
  statement: Statement,
): Promise<void> {
  if (!state.appliedRelease) throw new Error('DIVISION_REFRESH_SOURCE_MISSING')
  const params: Record<string, string> = {
    fromApiReleaseSet: state.appliedRelease,
    include: 'geometry',
    'page[limit]': '1',
  }
  if (state.targetRelease) params.toApiReleaseSet = state.targetRelease
  if (state.cursor) params['page[cursor]'] = state.cursor
  const page = await apiRead(api, '/divisions/v1/changes', params, changesSchema)
  const meta = page.meta
  if (
    ![meta.fromApiReleaseSet.code, meta.fromApiReleaseSet.id].includes(
      state.appliedRelease,
    ) ||
    (state.targetReleaseId && state.targetReleaseId !== meta.toApiReleaseSet.id) ||
    (state.comparisonId && state.comparisonId !== meta.comparisonId)
  )
    throw new Error('DIVISION_REFRESH_RELEASE_MISMATCH')
  if (state.cursor && meta.nextCursor === state.cursor)
    throw new Error('DIVISION_REFRESH_CURSOR_LOOP')
  const writes: D1PreparedStatement[] = []
  for (const change of page.data) {
    writes.push(
      statement(
        `INSERT INTO divisionRefreshChange(id,payload) SELECT ?,? WHERE ${FENCE}
      ON CONFLICT(id) DO NOTHING`,
        [change.id, JSON.stringify(change)],
      ),
    )
    if (change.after)
      writes.push(
        statement(
          `INSERT INTO divisionDefinition SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM divisionDefinition WHERE id=?) AND ${FENCE}
      ON CONFLICT(id) DO UPDATE SET apiReleaseSet=excluded.apiReleaseSet,attributes=excluded.attributes`,
          [
            change.divisionId,
            meta.toApiReleaseSet.code,
            JSON.stringify(change.after.attributes),
            change.divisionId,
          ],
        ),
      )
  }
  // Metadata upserts and the cursor move share the same transaction as durable change work.
  writes.push(
    statement(
      `UPDATE divisionRefresh SET targetRelease=?,targetReleaseId=?,comparisonId=?,cursor=?,phase=?
    WHERE id=1 AND ${FENCE}`,
      [
        meta.toApiReleaseSet.code,
        meta.toApiReleaseSet.id,
        meta.comparisonId,
        meta.nextCursor,
        page.data.length ? 'scan' : meta.nextCursor ? 'changes' : 'geocode',
      ],
    ),
  )
  await db.batch(writes)
}

/**
 * Scans bounded spatial/dependency candidates for one durable change.
 * @param db Primary database.
 * @param state Page continuation state.
 * @param statement Fenced statement factory.
 * @returns Completion of one candidate batch.
 */
async function scanChange(
  db: RefreshDatabase,
  state: State,
  statement: Statement,
): Promise<void> {
  const row = await db
    .prepare('SELECT * FROM divisionRefreshChange ORDER BY id LIMIT 1')
    .first<{ id: string; payload: string; featureCursor: string }>()
  if (!row) {
    await statement(`UPDATE divisionRefresh SET phase=? WHERE id=1 AND ${FENCE}`, [
      state.cursor ? 'changes' : 'geocode',
    ]).run()
    return
  }
  const change = changeSchema.parse(JSON.parse(row.payload))
  if (!change.canAffectGeocodingMembership) {
    await statement(`DELETE FROM divisionRefreshChange WHERE id=? AND ${FENCE}`, [
      row.id,
    ]).run()
    return
  }
  const dependencies = [
    ...new Set([
      change.divisionId,
      ...change.affectedDescendantIds.before,
      ...change.affectedDescendantIds.after,
    ]),
  ]
  const geometries = change.after?.membershipGeometry.map(item => item.geometry) ?? []
  const envelope = bounds(geometries)
  // JSON membership binds one parameter regardless of the number of descendants.
  const spatial = envelope
    ? `OR (json_extract(f.geometry,'$.type')='Point'
    AND json_extract(f.geometry,'$.coordinates[0]') BETWEEN ? AND ?
    AND json_extract(f.geometry,'$.coordinates[1]') BETWEEN ? AND ?)`
    : ''
  const candidates = await db
    .prepare(`SELECT f.id,f.geometry,
    EXISTS(SELECT 1 FROM featureDivisionMembership m WHERE m.featureId=f.id
      AND m.divisionId IN (SELECT value FROM json_each(?))) AS member
    FROM feature f WHERE f.id>? AND (f.id IN (
      SELECT featureId FROM featureDivisionMembership WHERE divisionId IN (SELECT value FROM json_each(?)))
      ${spatial}) ORDER BY f.id LIMIT 100`)
    .bind(
      JSON.stringify(dependencies),
      row.featureCursor,
      JSON.stringify(dependencies),
      ...(envelope ? [envelope[0], envelope[2], envelope[1], envelope[3]] : []),
    )
    .all<Feature & { member: number }>()
  const ids = candidates.results
    .filter(candidate => {
      if (candidate.member) return true
      const point = JSON.parse(candidate.geometry).coordinates
      return geometries.some(geometry => covers(point, geometry))
    })
    .map(candidate => candidate.id)
  const writes = [
    statement(
      `INSERT INTO featureDivisionJob(featureId)
    SELECT id FROM feature WHERE id IN (SELECT value FROM json_each(?)) AND ${FENCE}
    ON CONFLICT(featureId) DO UPDATE SET generation=generation+1,attempts=0,retryAt=0,lastError=NULL`,
      [JSON.stringify(ids)],
    ),
  ]
  if (candidates.results.length < 100) {
    writes.push(
      statement(`DELETE FROM divisionRefreshChange WHERE id=? AND ${FENCE}`, [row.id]),
    )
  } else {
    writes.push(
      statement(
        `UPDATE divisionRefreshChange SET featureCursor=? WHERE id=? AND ${FENCE}`,
        [candidates.results[candidates.results.length - 1].id, row.id],
      ),
    )
  }
  await db.batch(writes)
}

/**
 * Resolves queued coordinates against one release and commits only current generations.
 * @param db Primary database.
 * @param api Remote API.
 * @param state Current target or applied release.
 * @param statement Fenced statement factory.
 * @param now Retry clock.
 * @returns Completion of up to ten jobs; failures remain queued.
 */
async function geocodeJobs(
  db: RefreshDatabase,
  api: ApiOptions,
  state: State,
  statement: Statement,
  now: number,
): Promise<void> {
  const release = state.targetRelease ?? state.appliedRelease
  if (!release) throw new Error('DIVISION_REFRESH_TARGET_MISSING')
  const jobs = await db
    .prepare(`SELECT f.id,f.geometry,j.generation,j.attempts FROM featureDivisionJob j
    JOIN feature f ON f.id=j.featureId WHERE j.retryAt<=? ORDER BY j.retryAt,j.featureId LIMIT 10`)
    .bind(now)
    .all<Job>()
  for (const job of jobs.results) {
    try {
      const geometry = JSON.parse(job.geometry)
      const point =
        geometry.type === 'Point' &&
        Array.isArray(geometry.coordinates) &&
        geometry.coordinates.length >= 2 &&
        geometry.coordinates.slice(0, 2).every(Number.isFinite) &&
        Math.abs(geometry.coordinates[0]) <= 180 &&
        Math.abs(geometry.coordinates[1]) <= 90
          ? geometry.coordinates
          : null
      const response: GeocodeResponse | null = point
        ? await apiRead(
            api,
            '/divisions/v1/geocode',
            {
              lat: String(point[1]),
              lng: String(point[0]),
              apiReleaseSet: release,
              locales: 'en,zh-hant',
              profile: 'full',
            },
            geocodeSchema,
          )
        : null
      if (response && response.meta.release.apiReleaseSet !== release)
        throw new Error('DIVISION_GEOCODE_RELEASE_MISMATCH')
      const result = response?.data
      const selected = new Set(result?.selectedAncestryIds ?? [])
      const members = new Map(
        [...(result?.memberships ?? []), ...(result?.landform.memberships ?? [])].map(
          member => [member.id, member],
        ),
      )
      if ([...selected].some(id => !members.has(id)))
        throw new Error('DIVISION_GEOCODE_MISSING_MEMBERSHIP')
      // Equivalent level-one locality and administrative branches resolve to the
      // administrative division for HYPE's canonical hierarchy.
      const hasAdministrativeLevelOne = [...members.values()].some(
        member =>
          selected.has(member.id) &&
          member.level === 1 &&
          member.category === 'administrative',
      )
      const chosen = [...members.values()].filter(
        member =>
          selected.has(member.id) &&
          !(
            hasAdministrativeLevelOne &&
            member.level === 1 &&
            member.category === 'locality'
          ),
      )
      const chosenIds = new Set(chosen.map(member => member.id))
      // Every mutation rechecks coordinates, job generation and worker ownership in one D1 batch.
      const guard = `EXISTS(SELECT 1 FROM feature f JOIN featureDivisionJob j ON j.featureId=f.id
        WHERE f.id=? AND f.geometry=? AND j.generation=?) AND ${FENCE}`
      const guarded = (sql: string, values: unknown[] = []): D1PreparedStatement =>
        statement(sql, [...values, job.id, job.geometry, job.generation])
      const writes = [
        guarded(
          `DELETE FROM featureDivisionMembership WHERE featureId=? AND ${guard}`,
          [job.id],
        ),
      ]
      for (const member of members.values()) {
        writes.push(
          guarded(
            `INSERT INTO divisionDefinition SELECT ?,?,? WHERE ${guard}
          ON CONFLICT(id) DO UPDATE SET apiReleaseSet=excluded.apiReleaseSet,attributes=excluded.attributes`,
            [member.id, release, JSON.stringify(member)],
          ),
        )
        writes.push(
          guarded(
            `INSERT INTO featureDivisionMembership SELECT id,?,?
          FROM feature WHERE id=? AND ${guard}`,
            [member.id, Number(chosenIds.has(member.id)), job.id],
          ),
        )
      }
      // Project only canonical selections; non-canonical branches remain for invalidation.
      const unique = (ids: string[]): string | null =>
        ids.length === 1 ? ids[0] : null
      const levels = Array.from({ length: 6 }, (_, index) =>
        unique(
          chosen
            .filter(
              member => member.level === index + 1 && member.category !== 'landform',
            )
            .map(member => member.id),
        ),
      )
      const deepest = Math.max(
        -1,
        ...chosen
          .filter(member => member.category !== 'landform')
          .map(member => member.level ?? -1),
      )
      const divisionLeafId = unique(
        chosen
          .filter(member => member.category !== 'landform' && member.level === deepest)
          .map(member => member.id),
      )
      const landformLeafId = unique([
        ...new Set(
          (result?.landform.paths ?? [])
            .map(path =>
              [...path]
                .reverse()
                .find(
                  id => members.get(id)?.class !== 'island_group' && selected.has(id),
                ),
            )
            .filter((id): id is string => !!id),
        ),
      ])
      writes.push(
        guarded(
          `UPDATE featureCountRevision SET revision=revision+1 WHERE id=1 AND ${guard}`,
        ),
      )
      writes.push(
        guarded(
          `UPDATE feature SET divisionLeafId=?,divisionLevel1Id=?,divisionLevel2Id=?,divisionLevel3Id=?,
        divisionLevel4Id=?,divisionLevel5Id=?,divisionLevel6Id=?,landformLeafId=? WHERE id=? AND ${guard}`,
          [divisionLeafId, ...levels, landformLeafId, job.id],
        ),
      )
      writes.push(
        guarded(`DELETE FROM featureDivisionJob WHERE featureId=? AND ${guard}`, [
          job.id,
        ]),
      )
      await db.batch(writes)
    } catch (error) {
      await statement(
        `UPDATE featureDivisionJob SET attempts=attempts+1,retryAt=?,lastError=?
        WHERE featureId=? AND generation=? AND ${FENCE}`,
        [
          now + Math.min(3600000, 30000 * 2 ** Math.min(job.attempts, 7)),
          String(error).slice(0, 1000),
          job.id,
          job.generation,
        ],
      ).run()
    }
  }
  if (state.phase === 'geocode') {
    // Remove definitions no longer referenced, after every affected feature has been resolved.
    await statement(`DELETE FROM divisionDefinition WHERE NOT EXISTS(SELECT 1 FROM featureDivisionMembership m WHERE m.divisionId=divisionDefinition.id)
      AND NOT EXISTS(SELECT 1 FROM featureDivisionJob) AND NOT EXISTS(SELECT 1 FROM divisionRefreshChange) AND ${FENCE}`).run()
    // A failed or concurrent new job prevents publication; the next tick resumes it.
    await statement(`UPDATE divisionRefresh SET appliedRelease=targetRelease,targetRelease=NULL,
      targetReleaseId=NULL,comparisonId=NULL,cursor=NULL,phase='idle'
      WHERE id=1 AND NOT EXISTS(SELECT 1 FROM featureDivisionJob)
      AND NOT EXISTS(SELECT 1 FROM divisionRefreshChange) AND ${FENCE}`).run()
  }
}
