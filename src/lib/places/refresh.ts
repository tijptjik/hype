// SOURCE
import { comparePlacePublications, discoverPlacePublication } from './publication'
import { readSaanSeoiPlacePage } from './sourceClient'
// SERVICES
import { processPlaceRefresh } from '../db/services/placeRefreshProcess'
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
  'EXISTS(SELECT 1 FROM placeRefresh WHERE id=1 AND lease=? AND leaseUntil>?)'

/**
 * Discover monthly work or retain one canonical page atomically with its checkpoint.
 * @param db Primary-session D1 connection; no replica-only reads are permitted.
 * @param source Trusted SaanSeoi connection.
 * @param clock Clock used again after network reads to reject expired ownership.
 * @returns The bounded step result; complete means every scanned item has an adoption or retained review outcome.
 * @remarks Scanning never changes Feature values. The ready phase processes one source
 * or Feature per step before advancing the completed-publication checkpoint.
 */
export async function refreshPlaces(
  db: RefreshDatabase,
  source: PlaceSourceClient,
  clock: () => number = Date.now,
): Promise<string> {
  const now = clock()
  const lease = crypto.randomUUID()
  const acquired = await db
    .prepare(
      'UPDATE placeRefresh SET lease=?,leaseUntil=? WHERE id=1 AND leaseUntil<=? AND retryAt<=?',
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
      .prepare('SELECT * FROM placeRefresh WHERE id=1')
      .first<State>()
    if (!state) throw new Error('PLACE_REFRESH_STATE_MISSING')
    if (state.phase === 'review') return state.phase
    if (state.phase === 'ready') {
      if (!state.runId || !state.target) throw new Error('PLACE_REFRESH_PIN_MISSING')
      return await processPlaceRefresh(
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
      const target = await discoverPlacePublication(source)
      const transition = comparePlacePublications(
        state.accepted ? (JSON.parse(state.accepted) as PlacePublication) : null,
        target,
      )
      if (transition === 'unchanged' || transition === 'review') {
        const result = await statement(
          `UPDATE placeRefresh SET phase=?,target=?,checkedMonth=?,
          failures=0,retryAt=0,lastError=NULL WHERE id=1 AND ${FENCE}`,
          [transition === 'review' ? 'review' : 'idle', JSON.stringify(target), month],
        ).run()
        return result.meta.changes ? transition : 'superseded'
      }
      const runId = crypto.randomUUID()
      // Snapshot the linked identity set in the same transaction as publication selection.
      const results = await db.batch([
        statement(
          `UPDATE placeRefresh SET phase='scan',target=?,runId=?,checkedMonth=?,
          nextOffset=0,total=NULL,failures=0,retryAt=0,lastError=NULL WHERE id=1 AND ${FENCE}`,
          [JSON.stringify(target), runId, month],
        ),
        statement(
          `INSERT INTO placeSourceTransition(id,fromPublication,toPublication)
          SELECT ?,?,? WHERE ${FENCE}`,
          [runId, state.accepted, JSON.stringify(target)],
        ),
        statement(
          `INSERT INTO placeRefreshItem(runId,placeId,ssId)
          SELECT ?,p.id,p.ssId FROM place p WHERE p.ssId IS NOT NULL
          AND EXISTS(SELECT 1 FROM featurePlace fp WHERE fp.placeId=p.id)
          AND ${FENCE}`,
          [runId],
        ),
      ])
      return results[0].meta.changes ? 'started' : 'superseded'
    }
    return (await scanPage(db, source, state, statement)) ? 'scanned' : 'superseded'
  } catch (error) {
    writeAt = undefined
    // Retain only a stable error code: upstream payloads may contain personal data.
    await statement(
      `UPDATE placeRefresh SET failures=failures+1,
      retryAt=? + min(3600000,30000 * (1 << min(failures,7))),
      lastError='PLACE_REFRESH_STEP_FAILED' WHERE id=1 AND ${FENCE}`,
      [clock()],
    ).run()
    throw error
  } finally {
    // Token ownership prevents an expired process from releasing a successor's lease.
    await db
      .prepare('UPDATE placeRefresh SET lease=NULL,leaseUntil=0 WHERE id=1 AND lease=?')
      .bind(lease)
      .run()
  }
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
  if (!state.target || !state.runId) throw new Error('PLACE_REFRESH_PIN_MISSING')
  const target = JSON.parse(state.target) as PlacePublication
  const page = await readSaanSeoiPlacePage(source, target.pin, state.nextOffset)
  const processed = state.nextOffset + page.places.length
  if (
    (state.total !== null && page.total !== null && state.total !== page.total) ||
    (page.nextOffset === null && state.total !== null && processed !== state.total)
  )
    throw new Error('PLACE_REFRESH_TOTAL_CHANGED')
  // A JSON array uses two bound parameters for the entire bounded page lookup.
  const tracked = await db
    .prepare(`SELECT ssId,sourceOffset FROM placeRefreshItem
    WHERE runId=? AND ssId IN (SELECT value FROM json_each(?))`)
    .bind(state.runId, JSON.stringify(page.places.map(value => value.ssId)))
    .all<{ ssId: string; sourceOffset: number | null }>()
  const items = new Map(tracked.results.map(value => [value.ssId, value]))
  const writes: D1PreparedStatement[] = []
  for (const projection of page.places) {
    const item = items.get(projection.ssId)
    if (!item) continue
    if (item.sourceOffset !== null) throw new Error('PLACE_REFRESH_DUPLICATE_SOURCE')
    writes.push(
      statement(
        `UPDATE placeRefreshItem SET sourceOffset=?,projection=?,status='pending'
      WHERE runId=? AND ssId=? AND ${FENCE}`,
        [state.nextOffset, JSON.stringify(projection), state.runId, projection.ssId],
      ),
    )
  }
  // Checkpoint follows candidates in the same transaction; a failed last write rolls back all.
  writes.push(
    statement(
      `UPDATE placeRefresh SET nextOffset=?,total=?,phase=?,
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
