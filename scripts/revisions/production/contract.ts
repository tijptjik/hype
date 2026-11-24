// NODE
import { createHash } from 'node:crypto'
// TYPES
import type { D1Database } from '@cloudflare/workers-types'

// TABLE OF CONTENTS
// 1. Immutable release plan
// 2. Database maintenance fence
// 3. Journaled application and activation
export type Statement = { sql: string; params: (string | number | null)[] }
export type Group = {
  label: string
  statements: Statement[]
  tables?: string[]
  fenceTables?: string[]
}
export type Fingerprint = { rows: number; hash: string }
export type Plan = {
  version: 1
  featureLifecycle?: 'current'
  matchingBrandingHash?: string
  parentCursor?: number
  parentHash?: string
  target: string
  sourceHash: string
  initialSchema: Fingerprint
  expectedSchema: Fingerprint
  initial: Record<string, Fingerprint>
  expected: Record<string, Fingerprint>
  groups: Group[]
  tables: string[]
  migrations: string[]
}
export type Journal = {
  planHash: string
  nextGroup: number
  phase: 'paused' | 'verified' | 'active'
  writable: number
  irreversible: number
  schemaBoundary: number
  previousHash?: string | null
}
export const CONTROL = '_revisionDeployment'

/** Hash a retained release artifact. @param value JSON-safe artifact. @returns SHA-256. */
export function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
/** Quote a database-owned identifier, never a SQL fragment. @param name Identifier. @returns Quoted name. */
export function identifier(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
    throw new Error('Invalid database identifier')
  return `"${name}"`
}
/** Compare logical rows independent of transport ordering. @param rows Database rows. @param ignoreClock Ignore only migration-generated clock fields during final verification. @returns Count and digest. */
export function fingerprint(
  rows: Record<string, unknown>[],
  ignoreClock = false,
): Fingerprint {
  const clock = new Set(['createdAt', 'modifiedAt', 'updatedAt', 'applied_at'])
  const normalized = rows
    .map(row =>
      JSON.stringify(
        Object.fromEntries(
          Object.keys(row)
            .sort()
            .filter(key => !ignoreClock || !clock.has(key))
            .map(key => [key, row[key]]),
        ),
      ),
    )
    .sort()
  return { rows: rows.length, hash: digest(normalized) }
}
/** Select portable schema definitions, excluding maintenance and engine internals. @param rows sqlite_schema rows. @returns Schema fingerprint. */
export function schemaFingerprint(rows: Record<string, unknown>[]): Fingerprint {
  return fingerprint(
    rows.filter(
      r =>
        r.sql &&
        !/^(sqlite_|_cf_|featureSearchFts|_revisionDeployment|revision_deploy_)/.test(
          String(r.name),
        ),
    ),
  )
}
/** Verify schema parity while maintenance is held. @param db Binding. @param expected Rehearsed schema. @returns Nothing on parity. */
export async function verifySchema(
  db: D1Database,
  expected: Fingerprint,
): Promise<void> {
  const rows = await db
    .prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL')
    .all<Record<string, unknown>>()
  if (digest(schemaFingerprint(rows.results)) !== digest(expected))
    throw new Error('Schema differs from rehearsal')
}
/** SQL fences stop old apps, imports and workers at the common database boundary. @param tables Canonical tables, excluding D1 internals and FTS shadow tables. @returns Idempotent trigger declarations. */
export function fences(tables: readonly string[]): Statement[] {
  return tables
    .filter(t => t !== CONTROL)
    .flatMap(table =>
      ['INSERT', 'UPDATE', 'DELETE'].map(operation => ({
        sql: `CREATE TRIGGER IF NOT EXISTS ${identifier(`revision_deploy_${table}_${operation}`)} BEFORE ${operation} ON ${identifier(table)}
      WHEN EXISTS(SELECT 1 FROM ${CONTROL} WHERE singleton=1 AND phase<>'active' AND writable=0)
      BEGIN SELECT RAISE(ABORT,'REVISION_DEPLOYMENT_MAINTENANCE'); END`,
        params: [],
      })),
    )
}
/** Verify fence names still belong to their intended tables after DDL. @param tables Canonical table set. @returns Atomic coverage assertion. */
export function fenceCoverage(tables: readonly string[]): Statement {
  return guard(
    `NOT EXISTS(SELECT 1 FROM json_each(?) t WHERE (SELECT count(*) FROM sqlite_schema s WHERE s.type='trigger' AND s.tbl_name=t.value AND s.name IN ('revision_deploy_'||t.value||'_INSERT','revision_deploy_'||t.value||'_UPDATE','revision_deploy_'||t.value||'_DELETE'))<>3)`,
    [JSON.stringify(tables.filter(t => t !== CONTROL))],
  )
}
/** Locate the initial numbered-migration prefix before domain enrollment.
 * @param plan Ordered release groups. @returns Cursor at which the fenced snapshot must be refreshed.
 * @remarks Later lifecycle schema replacement depends on enrolled evidence and belongs to the apply phase.
 */
export function schemaMigrationBoundary(plan: Pick<Plan, 'groups'>): number {
  const boundary = plan.groups.findIndex(group => !group.tables)
  return boundary < 0 ? plan.groups.length : boundary
}
/** Read the durable release journal. @param db Target binding. @returns Journal or null. */
export async function journal(db: D1Database): Promise<Journal | null> {
  return db
    .prepare(
      `SELECT planHash,nextGroup,phase,writable,previousHash,irreversible,schemaBoundary FROM ${CONTROL} WHERE singleton=1`,
    )
    .first<Journal>()
}
/** Check a complete batch before it can reach the hosted binding.
 * @param statements SQL and bound values for this transaction.
 * @returns Whether the statement, parameter and serialized request budgets fit.
 * @remarks Leave headroom for the binding RPC envelope and maintenance guards.
 */
export function withinAtomicBudget(statements: Statement[]): boolean {
  return (
    statements.length <= 950 &&
    statements.every(
      s => Buffer.byteLength(s.sql) <= 95_000 && s.params.length <= 100,
    ) &&
    Buffer.byteLength(JSON.stringify(statements)) <= 16 * 1024 * 1024
  )
}
/** Execute a whole unit transactionally, never splitting a domain or migration batch. @param db Target binding. @param statements Complete unit. @returns Successful completion. */
export async function atomic(db: D1Database, statements: Statement[]): Promise<void> {
  if (!withinAtomicBudget(statements))
    throw new Error(
      'Atomic unit exceeds rollout limits; restructure and rehearse before deployment',
    )
  const results = await db.batch(
    statements.map(s => db.prepare(s.sql).bind(...s.params)),
  )
  if (results.some(r => !r.success)) throw new Error('D1 atomic unit failed')
}
/** A failing SELECT aborts the entire D1 batch. @param predicate Trusted SQL condition. @param params Values. @returns Guard statement. */
export function guard(predicate: string, params: Statement['params'] = []): Statement {
  return {
    sql: `SELECT CASE WHEN (${predicate}) THEN 1 ELSE json('REVISION_DEPLOYMENT_CONFLICT') END`,
    params,
  }
}
/** Install maintenance atomically, or resume the exact same plan. @param db Target binding. @param plan Immutable plan. @returns Nothing; competing plans are rejected. */
export async function pause(db: D1Database, plan: Plan): Promise<void> {
  // Install inert fences in bounded batches before the atomic maintenance switch.
  await atomic(db, [
    {
      sql: `CREATE TABLE IF NOT EXISTS ${CONTROL}(singleton INTEGER PRIMARY KEY CHECK(singleton=1),planHash TEXT NOT NULL,nextGroup INTEGER NOT NULL,phase TEXT NOT NULL CHECK(phase IN ('paused','verified','active')),writable INTEGER NOT NULL CHECK(writable IN (0,1)),previousHash TEXT,irreversible INTEGER NOT NULL DEFAULT 0,schemaBoundary INTEGER NOT NULL DEFAULT 0)`,
      params: [],
    },
  ])
  // A resumed plan may already have replaced legacy tables. Check the actual
  // fenced schema before doing any DDL, including on an already-active retry.
  const state = await journal(db)
  if (state?.planHash === digest(plan)) {
    const live = await db
      .prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name")
      .all<{ name: string }>()
    const tables = live.results
      .map(row => row.name)
      .filter(
        name => !/^(sqlite_|_cf_|featureSearchFts|_revisionDeployment)/.test(name),
      )
    await atomic(db, [
      guard(
        `EXISTS(SELECT 1 FROM ${CONTROL} WHERE singleton=1 AND planHash=? AND writable=0)`,
        [state.planHash],
      ),
      fenceCoverage(tables),
    ])
    return
  }
  if (state && state.phase !== 'active')
    throw new Error('Another rollout owns maintenance')
  const declarations = fences(Object.keys(plan.initial))
  for (let offset = 0; offset < declarations.length; offset += 300)
    await atomic(db, declarations.slice(offset, offset + 300))
  await atomic(db, [
    {
      sql: `INSERT INTO ${CONTROL} VALUES(1,?,0,'paused',0,NULL,0,?) ON CONFLICT(singleton) DO UPDATE SET previousHash=planHash,planHash=excluded.planHash,nextGroup=0,phase='paused',writable=0,irreversible=0,schemaBoundary=excluded.schemaBoundary WHERE ${CONTROL}.phase='active' AND ${CONTROL}.planHash<>excluded.planHash`,
      params: [digest(plan), schemaMigrationBoundary(plan)],
    },
    guard(`EXISTS(SELECT 1 FROM ${CONTROL} WHERE planHash=? AND writable=0)`, [
      digest(plan),
    ]),
    fenceCoverage(Object.keys(plan.initial)),
  ])
}
/** Apply each rehearsed unit with its cursor update in the same transaction. @param db Fenced binding. @param plan Pinned plan. @param until Exclusive unit boundary for schema-only application. @returns Durable cursor after all units. @remarks A lost response is resolved from the journal; a failure never reopens writes. */
export async function applyGroups(
  db: D1Database,
  plan: Plan,
  until = plan.groups.length,
): Promise<number> {
  const planHash = digest(plan)
  let state = await journal(db)
  if (!state || state.planHash !== planHash || state.writable !== 0)
    throw new Error('Rollout journal differs')
  if (state.phase !== 'paused') return state.nextGroup
  if (until < 0 || until > plan.groups.length)
    throw new Error('Invalid rollout boundary')
  while (state.nextGroup < until) {
    const n = state.nextGroup,
      group = plan.groups[n]
    await atomic(db, [
      guard(
        `EXISTS(SELECT 1 FROM ${CONTROL} WHERE planHash=? AND nextGroup=? AND phase='paused' AND writable=0)`,
        [planHash, n],
      ),
      { sql: `UPDATE ${CONTROL} SET writable=1 WHERE singleton=1`, params: [] },
      ...group.statements,
      ...(group.tables
        ? [...fences(group.fenceTables ?? group.tables), fenceCoverage(group.tables)]
        : []),
      {
        sql: `UPDATE ${CONTROL} SET writable=0,nextGroup=?,irreversible=1 WHERE singleton=1`,
        params: [n + 1],
      },
    ])
    state = (await journal(db))!
  }
  return state.nextGroup
}
/** Read complete canonical rows in bounded pages. @param db Binding. @param table Reviewed table. @returns Logical rows for hashing. @remarks Writers must remain fenced while this is used for activation. */
export async function readRows(
  db: D1Database,
  table: string,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  for (let offset = 0; ; offset += 500) {
    const result = await db
      .prepare(`SELECT * FROM ${identifier(table)} LIMIT 500 OFFSET ?`)
      .bind(offset)
      .all<Record<string, unknown>>()
    rows.push(...result.results)
    if (result.results.length < 500) return rows
  }
}
/** Validate an entire snapshot, not just aggregate counts. @param db Fenced binding. @param expected Digests. @param final Ignore migration clock fields only after migration. @returns Nothing on exact match. */
export async function verifyRows(
  db: D1Database,
  expected: Record<string, Fingerprint>,
  final = false,
): Promise<void> {
  for (const [table, value] of Object.entries(expected))
    if (digest(fingerprint(await readRows(db, table), final)) !== digest(value))
      throw new Error(`Snapshot differs: ${table}`)
}
/** Enforce complete baseline coverage before deploying the revision app. @returns Activation assertions. */
export function completeness(currentLifecycle = false): Statement[] {
  return [
    ...[
      'organisation',
      'project',
      'layer',
      'hub',
      ...(currentLifecycle ? [] : ['feature']),
    ].map(resource =>
      guard(
        `NOT EXISTS(SELECT 1 FROM ${resource} r LEFT JOIN ${resource}RevisionHead h ON h.${resource}Id=r.id WHERE h.${resource}Id IS NULL)`,
      ),
    ),
    ...(currentLifecycle
      ? [
          guard(
            'NOT EXISTS(SELECT 1 FROM feature f LEFT JOIN featureRevision r ON r.id=f.currentRevisionId AND r.featureId=f.id WHERE r.id IS NULL OR r.sequence<>f.revisionVersion)',
          ),
          guard(
            "NOT EXISTS(SELECT 1 FROM task t JOIN featureRevisionProposal p ON p.id=t.proposalId WHERE t.isDraft=1 AND t.type='newFeature' AND t.featureId IS NOT NULL AND json_extract(p.creationScope,'$.legacyInitial.mode')='contribution')",
          ),
        ]
      : []),
    ...['organisation', 'project', 'hub'].map(resource =>
      guard(
        `NOT EXISTS(SELECT 1 FROM ${resource} r LEFT JOIN resourceLogoImageHead h ON h.imageId=r.imageId WHERE r.imageId IS NOT NULL AND h.imageId IS NULL)`,
      ),
    ),
    ...['organisation', 'project', 'hub'].map(resource =>
      guard(
        `NOT EXISTS(SELECT 1 FROM ${resource} r LEFT JOIN propertyCatalogRevisionHead h ON h.scope='${resource}' AND h.resourceId=r.id WHERE h.resourceId IS NULL)`,
      ),
    ),
    guard('NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check)'),
    guard('NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope)'),
    ...['organisation', 'project', 'layer', 'hub', 'propertyCatalog'].map(r =>
      guard(`NOT EXISTS(SELECT 1 FROM ${r}RevisionWrite)`),
    ),
  ]
}
/** Mark verified while keeping maintenance closed. @param db Binding. @param plan Pinned release. @returns Nothing. */
export async function markVerified(db: D1Database, plan: Plan): Promise<void> {
  await verifySchema(db, plan.expectedSchema)
  await verifyRows(db, plan.expected, true)
  await atomic(db, [
    guard(
      `EXISTS(SELECT 1 FROM ${CONTROL} WHERE planHash=? AND nextGroup=? AND writable=0 AND phase IN ('paused','verified'))`,
      [digest(plan), plan.groups.length],
    ),
    ...completeness(plan.featureLifecycle === 'current'),
    fenceCoverage(plan.tables),
    { sql: `UPDATE ${CONTROL} SET phase='verified' WHERE singleton=1`, params: [] },
  ])
}
/** Reopen only after deployment and health verification. @param db Binding. @param plan Verified release. @returns Nothing. */
export async function activate(db: D1Database, plan: Plan): Promise<void> {
  await atomic(db, [
    guard(
      `EXISTS(SELECT 1 FROM ${CONTROL} WHERE planHash=? AND nextGroup=? AND phase='verified' AND writable=0)`,
      [digest(plan), plan.groups.length],
    ),
    ...completeness(plan.featureLifecycle === 'current'),
    fenceCoverage(plan.tables),
    { sql: `UPDATE ${CONTROL} SET writable=1 WHERE singleton=1`, params: [] },
    ...(plan.featureLifecycle === 'current'
      ? []
      : [
          {
            sql: 'UPDATE featureRevisionCreationPolicy SET enabled=1 WHERE singleton=1',
            params: [],
          },
        ]),
    { sql: 'UPDATE adminResourceRevisionRollout SET enabled=1', params: [] },
    {
      sql: `UPDATE ${CONTROL} SET writable=0,phase='active' WHERE singleton=1`,
      params: [],
    },
  ])
}

/** Cancel only a rollout that has committed no migration/enrollment units. @param db Binding. @param plan Exact paused release. @returns Previous app write availability, preserving the journal. */
export async function abortBeforeMigration(db: D1Database, plan: Plan): Promise<void> {
  await atomic(db, [
    guard(
      `EXISTS(SELECT 1 FROM ${CONTROL} WHERE planHash=? AND nextGroup=0 AND irreversible=0 AND phase='paused' AND writable=0)`,
      [digest(plan)],
    ),
    {
      sql: `UPDATE ${CONTROL} SET planHash=coalesce(previousHash,'unmanaged'),phase='active',previousHash=NULL WHERE singleton=1`,
      params: [],
    },
  ])
}

/** Replace a fenced plan only at the initial or schema-only boundary. @param db Binding. @param plan Freshly rehearsed source plan and predecessor cursor. @returns Nothing; lost-response retries are safe. @remarks Once schema work committed, the irreversible marker survives replanning and prevents cancellation to the old app. */
export async function rebaseUnstarted(db: D1Database, plan: Plan): Promise<void> {
  if (!plan.parentHash || !Number.isInteger(plan.parentCursor))
    throw new Error('Rebase predecessor missing')
  const state = await journal(db)
  if (state?.planHash === digest(plan)) return
  await atomic(db, [
    guard(
      `EXISTS(SELECT 1 FROM ${CONTROL} WHERE planHash=? AND nextGroup=? AND nextGroup<=schemaBoundary AND phase='paused' AND writable=0)`,
      [plan.parentHash, plan.parentCursor!],
    ),
    {
      sql: `UPDATE ${CONTROL} SET planHash=?,nextGroup=0,schemaBoundary=? WHERE singleton=1`,
      params: [digest(plan), schemaMigrationBoundary(plan)],
    },
  ])
}
