// DOMAIN
import { readPlaceSourceInventory, planPlaceSourceComparisons } from './sourceInventory'
import {
  readSaanSeoiPlaceSourceChanges,
  PlaceSourceComparisonPinSchema,
} from './sourceChanges'
// TYPES
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'
import type { PlaceSourceClient } from './sourceClient'
import type { PlacePublication } from './publication'
import type { PlaceSourceComparisonPlan } from './sourceInventory'

type Database = Pick<D1Database, 'prepare' | 'batch'>
type Transition = {
  id: string
  fromPublication: string | null
  toPublication: string
  phase: 'queued' | 'collect'
  plan: string | null
}
type Comparison = {
  id: string
  datasetCode: string
  resourceType: string
  fromRelease: string
  toRelease: string
  pin: string | null
  cursor: string | null
  pageNumber: number
}
const OWNED = 'EXISTS(SELECT 1 FROM placeSourceTransition WHERE id=? AND lease=?)'
const FENCE = `EXISTS(SELECT 1 FROM placeSourceTransition WHERE id=? AND lease=?
  AND leaseUntil>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)
  AND phase IN ('queued','collect'))`
type Statement = (query: string, values?: unknown[]) => D1PreparedStatement

// ═══════════════════════
// TABLE OF CONTENTS
// 1. Independent transition lease and retry
// 2. Inventory discovery and comparison planning
// 3. Atomic publisher page evidence and cursor retention
// ---

/**
 * Collect one bounded publisher-evidence step independently of canonical refresh.
 * @param db Primary-session database with atomic batches.
 * @param source Trusted SaanSeoi transport.
 * @returns Discovery, page, completion, review or ownership state.
 * @remarks This worker never reads or writes Feature/Place identities or adopted values.
 * Every write checks database time and ownership. Errors retain only a stable retry code.
 */
export async function refreshPlaceSourceEvidence(
  db: Database,
  source: PlaceSourceClient,
): Promise<string> {
  const row = await db
    .prepare(`SELECT id,fromPublication,toPublication,phase,plan FROM placeSourceTransition
    WHERE phase IN ('queued','collect') AND retryAt<=? AND leaseUntil<=?
    ORDER BY createdAt,id LIMIT 1`)
    .bind(Date.now(), Date.now())
    .first<Transition>()
  if (!row) return 'idle'
  const lease = crypto.randomUUID()
  const claimed = await db
    .prepare(`UPDATE placeSourceTransition SET lease=?,leaseUntil=?
    WHERE id=? AND leaseUntil<=? AND phase=?`)
    .bind(lease, Date.now() + 120_000, row.id, Date.now(), row.phase)
    .run()
  if (!claimed.meta.changes) return 'busy'
  const statement: Statement = (query, values = []) =>
    db.prepare(query).bind(...values, row.id, lease)
  try {
    if (row.phase === 'queued') return await discover(db, source, row, statement)
    const comparison = await db
      .prepare(`SELECT id,datasetCode,resourceType,fromRelease,toRelease,pin,cursor,pageNumber
      FROM placeSourceComparison WHERE transitionId=? AND complete=0 ORDER BY id LIMIT 1`)
      .bind(row.id)
      .first<Comparison>()
    if (comparison) return await collect(db, source, comparison, statement)
    const plan = JSON.parse(row.plan!) as PlaceSourceComparisonPlan
    const phase = plan.reviewRequired ? 'review' : 'complete'
    const result = await statement(
      `UPDATE placeSourceTransition SET phase=?,failures=0,retryAt=0,lastError=NULL
      WHERE id=? AND NOT EXISTS(SELECT 1 FROM placeSourceComparison WHERE transitionId=? AND complete=0) AND ${FENCE}`,
      [phase, row.id, row.id],
    ).run()
    return result.meta.changes ? phase : 'superseded'
  } catch (error) {
    await statement(
      `UPDATE placeSourceTransition SET failures=failures+1,
      retryAt=?+min(3600000,30000*(1 << min(failures,7))),lastError='PLACE_SOURCE_EVIDENCE_STEP_FAILED'
      WHERE id=? AND ${FENCE}`,
      [Date.now(), row.id],
    ).run()
    throw error
  } finally {
    await db
      .prepare(
        'UPDATE placeSourceTransition SET lease=NULL,leaseUntil=0 WHERE id=? AND lease=?',
      )
      .bind(row.id, lease)
      .run()
  }
}

/**
 * Retain source inventories and their comparison plan before any change requests.
 * @param db Primary database.
 * @param source Trusted source.
 * @param row Leased transition.
 * @param statement Ownership-fenced statement factory.
 * @returns Planned or superseded state.
 */
async function discover(
  db: Database,
  source: PlaceSourceClient,
  row: Transition,
  statement: Statement,
): Promise<string> {
  const before = row.fromPublication
    ? (JSON.parse(row.fromPublication) as PlacePublication)
    : null
  const after = JSON.parse(row.toPublication) as PlacePublication
  const [fromInventory, toInventory] = await Promise.all([
    before
      ? readPlaceSourceInventory(source, before.pin.releaseSet)
      : Promise.resolve(null),
    readPlaceSourceInventory(source, after.pin.releaseSet),
  ])
  const plan = planPlaceSourceComparisons(fromInventory, toInventory)
  const phase = plan.comparisons.length
    ? 'collect'
    : plan.reviewRequired
      ? 'review'
      : 'complete'
  // JSON table insertion keeps bound parameters constant regardless of inventory size.
  const writes = [
    statement(
      `UPDATE placeSourceTransition SET inventories=?,plan=?,phase=?,failures=0,retryAt=0,lastError=NULL
      WHERE id=? AND phase='queued' AND ${FENCE}`,
      [
        JSON.stringify({ before: fromInventory, after: toInventory }),
        JSON.stringify(plan),
        phase,
        row.id,
      ],
    ),
    statement(
      `INSERT INTO placeSourceComparison(id,transitionId,datasetCode,resourceType,sourceVariant,fromRelease,toRelease)
      SELECT ? || ':' || item.key,?,json_extract(item.value,'$.datasetCode'),json_extract(item.value,'$.resourceType'),
      json_extract(item.value,'$.sourceVariant'),json_extract(item.value,'$.fromRelease'),json_extract(item.value,'$.toRelease')
      FROM json_each(?) item WHERE EXISTS(SELECT 1 FROM placeSourceTransition WHERE id=? AND plan=? AND phase=?) AND ${OWNED}`,
      [
        row.id,
        row.id,
        JSON.stringify(plan.comparisons),
        row.id,
        JSON.stringify(plan),
        phase,
      ],
    ),
  ]
  // The first statement checks time; later writes prove that exact update won in this transaction.
  const results = await db.batch(writes)
  return results[0].meta.changes ? 'planned' : 'superseded'
}

/**
 * Retain one complete publisher page and its identities atomically with the next cursor.
 * @param db Primary database.
 * @param source Trusted source.
 * @param comparison Persisted expected comparison and checkpoint.
 * @param statement Ownership-fenced statement factory.
 * @returns Collected or superseded state.
 * @remarks Unique page cursors and source IDs reject replay cycles and duplicates across
 * pages. Any late write failure rolls back evidence and progress together.
 */
async function collect(
  db: Database,
  source: PlaceSourceClient,
  comparison: Comparison,
  statement: Statement,
): Promise<string> {
  const pin = comparison.pin
    ? PlaceSourceComparisonPinSchema.parse(JSON.parse(comparison.pin))
    : undefined
  const page = await readSaanSeoiPlaceSourceChanges(
    source,
    {
      fromRelease: pin?.fromRelease ?? comparison.fromRelease,
      toRelease: pin?.toRelease ?? comparison.toRelease,
      resourceType: comparison.resourceType,
      limit: 100,
      ...(comparison.cursor ? { cursor: comparison.cursor } : {}),
    },
    pin,
  )
  if (
    page.pin.datasetCode !== comparison.datasetCode ||
    page.pin.resourceType !== comparison.resourceType
  )
    throw new Error('Source comparison differs from discovered dataset')
  const counts = { added: 0, changed: 0, removed: 0 }
  for (const record of page.records) counts[record.type]++
  // Evidence, cross-page uniqueness and cursor advancement share one fenced transaction.
  const pinText = JSON.stringify(page.pin)
  const marker = `EXISTS(SELECT 1 FROM placeSourceComparison WHERE id=? AND pageNumber=? AND pin=? AND cursor IS ?)`
  const markerValues = [
    comparison.id,
    comparison.pageNumber + 1,
    pinText,
    page.nextCursor,
  ]
  const results = await db.batch([
    statement(
      `UPDATE placeSourceComparison SET pin=?,cursor=?,pageNumber=pageNumber+1,complete=?,
      added=added+?,changed=changed+?,removed=removed+? WHERE id=? AND pageNumber=? AND ${FENCE}`,
      [
        pinText,
        page.nextCursor,
        Number(page.nextCursor === null),
        counts.added,
        counts.changed,
        counts.removed,
        comparison.id,
        comparison.pageNumber,
      ],
    ),
    statement(
      `INSERT INTO placeSourcePage(comparisonId,pageNumber,requestCursor,nextCursor,evidence)
      SELECT ?,?,?,?,? WHERE ${marker} AND ${OWNED}`,
      [
        comparison.id,
        comparison.pageNumber,
        comparison.cursor ?? '',
        page.nextCursor,
        JSON.stringify(page),
        ...markerValues,
      ],
    ),
    statement(
      `INSERT INTO placeSourceEvidenceId(comparisonId,sourceRecordId,pageNumber)
      SELECT ?,json_extract(item.value,'$.sourceRecordId'),? FROM json_each(?) item WHERE ${marker} AND ${OWNED}`,
      [
        comparison.id,
        comparison.pageNumber,
        JSON.stringify(page.records),
        ...markerValues,
      ],
    ),
    statement(
      `UPDATE placeSourceTransition SET failures=0,retryAt=0,lastError=NULL
      WHERE id=(SELECT transitionId FROM placeSourceComparison WHERE id=?) AND ${marker} AND ${OWNED}`,
      [comparison.id, ...markerValues],
    ),
  ])
  return results[0].meta.changes ? 'collected' : 'superseded'
}
