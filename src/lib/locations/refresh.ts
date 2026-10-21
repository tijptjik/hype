// SOURCE
import { compareLocationPublications, discoverLocationPublication } from './publication'
import { readSaanSeoiPlacePage } from './sourceClient'
// SERVICES
import { processLocationRefresh } from '../db/services/locationRefreshProcess'
// TYPES
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'
import type { PlacePublication } from './publication'
import type { PlaceSourceClient } from './sourceClient'

// ═══════════════════════
// TABLE OF CONTENTS
// 1. Durable state and lease ownership
// 2. Monthly discovery and pinned scan
// ═══════════════════════

type RefreshDatabase = Pick<D1Database, 'prepare' | 'batch'>
type State = {
  scanMode: 'catalogue' | 'identities'
  phase: 'idle' | 'scan' | 'ready' | 'review'
  accepted: string | null
  target: string | null
  runId: string | null
  checkedMonth: string | null
  nextOffset: number
  total: number | null
  failures: number
}
type Statement = (sql: string, values?: unknown[]) => D1PreparedStatement
const FENCE =
  'EXISTS(SELECT 1 FROM locationRefresh WHERE id=1 AND lease=? AND leaseUntil>?)'

/**
 * Discover monthly work or retain one canonical read atomically with its checkpoint.
 * @param db Primary-session D1 connection; no replica-only reads are permitted.
 * @param source Trusted SaanSeoi connection.
 * @param clock Clock used again after network reads to reject expired ownership.
 * @returns The bounded step result; complete means every scanned item has an adoption or retained review outcome.
 * @remarks New runs read captured linked IDs; existing catalogue runs retain their cursors.
 * Scanning never changes Feature values. The ready phase processes one source
 * or Feature per step before advancing the completed-publication checkpoint.
 */
export async function refreshLocations(
  db: RefreshDatabase,
  source: PlaceSourceClient,
  clock: () => number = Date.now,
): Promise<string> {
  const now = clock()
  const lease = crypto.randomUUID()
  const acquired = await db
    .prepare(
      'UPDATE locationRefresh SET lease=?,leaseUntil=? WHERE id=1 AND leaseUntil<=? AND retryAt<=?',
    )
    .bind(lease, now + 240_000, now, now)
    .run()
  if (!acquired.meta.changes) return 'busy'
  // Use one fence time for every statement in an atomic batch.
  let writeAt: number | undefined
  const statement: Statement = (query, values = []) => {
    writeAt ??= clock()
    return db.prepare(query).bind(...values, lease, writeAt)
  }
  try {
    const state = await db
      .prepare('SELECT * FROM locationRefresh WHERE id=1')
      .first<State>()
    if (!state) throw new Error('LOCATION_REFRESH_STATE_MISSING')
    if (state.phase === 'review') return state.phase
    if (state.phase === 'ready') {
      if (!state.runId || !state.target) throw new Error('LOCATION_REFRESH_PIN_MISSING')
      return await processLocationRefresh(
        db,
        {
          runId: state.runId,
          lease,
          target: JSON.parse(state.target) as PlacePublication,
        },
        source,
      )
    }
    if (state.phase === 'idle') {
      const month = new Date(now).toISOString().slice(0, 7)
      if (state.checkedMonth === month) return 'idle'
      const target = await discoverLocationPublication(source)
      const transition = compareLocationPublications(
        state.accepted ? (JSON.parse(state.accepted) as PlacePublication) : null,
        target,
      )
      if (transition === 'unchanged' || transition === 'review') {
        const result = await statement(
          `UPDATE locationRefresh SET phase=?,target=?,checkedMonth=?,
          failures=0,retryAt=0,lastError=NULL WHERE id=1 AND ${FENCE}`,
          [transition === 'review' ? 'review' : 'idle', JSON.stringify(target), month],
        ).run()
        return result.meta.changes ? transition : 'superseded'
      }
      const runId = crypto.randomUUID()
      // Snapshot the linked identity set in the same transaction as publication selection.
      const results = await db.batch([
        statement(
          `UPDATE locationRefresh SET phase='scan',scanMode='identities',target=?,runId=?,checkedMonth=?,
          nextOffset=0,total=NULL,failures=0,retryAt=0,lastError=NULL WHERE id=1 AND ${FENCE}`,
          [JSON.stringify(target), runId, month],
        ),
        statement(
          `INSERT INTO locationRefreshItem(runId,locationId,ssId)
          SELECT ?,p.id,p.ssId FROM location p WHERE p.ssId IS NOT NULL
          AND EXISTS(SELECT 1 FROM featureLocation fp WHERE fp.locationId=p.id)
          AND ${FENCE}`,
          [runId],
        ),
        statement(
          `UPDATE locationRefresh SET total=(SELECT count(*) FROM locationRefreshItem WHERE runId=?),
          phase=CASE WHEN EXISTS(SELECT 1 FROM locationRefreshItem WHERE runId=?) THEN 'scan' ELSE 'ready' END
          WHERE id=1 AND ${FENCE}`,
          [runId, runId],
        ),
      ])
      return results[0].meta.changes ? 'started' : 'superseded'
    }
    const scanned =
      state.scanMode === 'identities'
        ? await scanIdentity(db, source, state, statement)
        : await scanPage(db, source, state, statement)
    return scanned ? 'scanned' : 'superseded'
  } catch (error) {
    writeAt = undefined
    // Retain only a stable error code: upstream payloads may contain personal data.
    await statement(
      `UPDATE locationRefresh SET failures=failures+1,
      retryAt=? + min(3600000,30000 * (1 << min(failures,7))),
      lastError='LOCATION_REFRESH_STEP_FAILED' WHERE id=1 AND ${FENCE}`,
      [clock()],
    ).run()
    throw error
  } finally {
    // Token ownership prevents an expired process from releasing a successor's lease.
    await db
      .prepare(
        'UPDATE locationRefresh SET lease=NULL,leaseUntil=0 WHERE id=1 AND lease=?',
      )
      .bind(lease)
      .run()
  }
}

/**
 * Read one captured linked identity from the pinned canonical collection.
 * @param db Primary-session connection.
 * @param source Trusted upstream transport with acknowledged exact-ID support.
 * @param state Durable identity-scan checkpoint.
 * @param statement Factory that applies the active run lease.
 * @returns Whether the source result and ordinal committed together.
 * @remarks Missing IDs retain an explicit source review item. Unsupported filters fail
 * without advancement; latest-only detail reads are never substituted. Existing catalogue
 * runs keep their original mode and offset after migration.
 */
async function scanIdentity(
  db: RefreshDatabase,
  source: PlaceSourceClient,
  state: State,
  statement: Statement,
): Promise<boolean> {
  if (!state.target || !state.runId || state.total === null)
    throw new Error('LOCATION_REFRESH_PIN_MISSING')
  const item = await db
    .prepare(
      `SELECT locationId,ssId FROM locationRefreshItem WHERE runId=? AND sourceOffset IS NULL
    ORDER BY locationId LIMIT 1`,
    )
    .bind(state.runId)
    .first<{ locationId: string; ssId: string }>()
  if (!item || state.nextOffset >= state.total)
    throw new Error('LOCATION_REFRESH_IDENTITY_CHECKPOINT_INVALID')
  const target = JSON.parse(state.target) as PlacePublication
  const page = await readSaanSeoiPlacePage(source, target.pin, 0, { id: item.ssId })
  if (
    page.places.length > 1 ||
    page.nextOffset !== null ||
    (page.total !== null && page.total !== page.places.length) ||
    page.places.some(projection => projection.ssId !== item.ssId)
  )
    throw new Error('LOCATION_REFRESH_IDENTITY_SELECTION_INVALID')
  const projection = page.places[0]
  // Retain absence and successful reads alike before advancing the captured-identity ordinal.
  const results = await db.batch([
    statement(
      `UPDATE locationRefreshItem SET sourceOffset=?,projection=?,status=?
      WHERE runId=? AND locationId=? AND sourceOffset IS NULL AND ${FENCE}`,
      [
        state.nextOffset,
        projection ? JSON.stringify(projection) : null,
        projection ? 'pending' : 'missing',
        state.runId,
        item.locationId,
      ],
    ),
    statement(
      `UPDATE locationRefresh SET nextOffset=?,phase=?,failures=0,retryAt=0,lastError=NULL
      WHERE id=1 AND ${FENCE}`,
      [state.nextOffset + 1, state.nextOffset + 1 === state.total ? 'ready' : 'scan'],
    ),
  ])
  return Boolean(results[0].meta.changes && results[1].meta.changes)
}

/**
 * Persist tracked source candidates and page progress as one atomic fenced write.
 * @param db Primary-session D1 connection.
 * @param source Trusted upstream connection.
 * @param state Durable run checkpoint loaded under the lease.
 * @param statement Factory that appends current ownership and expiry guards.
 * @returns Completion of a single page; missing tracked IDs stay explicit at scan end.
 */
async function scanPage(
  db: RefreshDatabase,
  source: PlaceSourceClient,
  state: State,
  statement: Statement,
): Promise<boolean> {
  if (!state.target || !state.runId) throw new Error('LOCATION_REFRESH_PIN_MISSING')
  const target = JSON.parse(state.target) as PlacePublication
  const page = await readSaanSeoiPlacePage(source, target.pin, state.nextOffset)
  const processed = state.nextOffset + page.places.length
  if (
    (state.total !== null && page.total !== null && state.total !== page.total) ||
    (page.nextOffset === null && state.total !== null && processed !== state.total)
  )
    throw new Error('LOCATION_REFRESH_TOTAL_CHANGED')
  // A JSON array uses two bound parameters for the entire bounded page lookup.
  const tracked = await db
    .prepare(`SELECT ssId,sourceOffset FROM locationRefreshItem
    WHERE runId=? AND ssId IN (SELECT value FROM json_each(?))`)
    .bind(state.runId, JSON.stringify(page.places.map(value => value.ssId)))
    .all<{ ssId: string; sourceOffset: number | null }>()
  const items = new Map(tracked.results.map(value => [value.ssId, value]))
  const writes: D1PreparedStatement[] = []
  for (const projection of page.places) {
    const item = items.get(projection.ssId)
    if (!item) continue
    if (item.sourceOffset !== null) throw new Error('LOCATION_REFRESH_DUPLICATE_SOURCE')
    writes.push(
      statement(
        `UPDATE locationRefreshItem SET sourceOffset=?,projection=?,status='pending'
      WHERE runId=? AND ssId=? AND ${FENCE}`,
        [state.nextOffset, JSON.stringify(projection), state.runId, projection.ssId],
      ),
    )
  }
  // Checkpoint follows candidates in the same transaction; a failed last write rolls back all.
  writes.push(
    statement(
      `UPDATE locationRefresh SET nextOffset=?,total=?,phase=?,
    failures=0,retryAt=0,lastError=NULL WHERE id=1 AND ${FENCE}`,
      [
        processed,
        page.total ?? state.total ?? (page.nextOffset === null ? processed : null),
        page.nextOffset === null ? 'ready' : 'scan',
      ],
    ),
  )
  const results = await db.batch(writes)
  return Boolean(results[results.length - 1].meta.changes)
}
