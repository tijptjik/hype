// CONTRACT
import {
  atomic,
  completeness,
  digest,
  fenceCoverage,
  guard,
  journal,
  markVerified,
  verifyRows,
  verifySchema,
} from './contract'
import type { Journal, Plan } from './contract'
import type { D1Database } from '@cloudflare/workers-types'

/** Abort an unstarted data release without resetting the application's journal cursor.
 * @param db Fenced production binding.
 * @param plan Unstarted data-only plan.
 * @param original Exact application journal retained before maintenance.
 * @returns Nothing after restoring the original application journal atomically.
 * @remarks Any committed group prohibits this path, including staging groups.
 */
export async function abortDataRelease(
  db: D1Database,
  plan: Plan,
  original: Journal,
): Promise<void> {
  if (
    plan.migrations.length ||
    plan.parentHash !== original.planHash ||
    plan.parentCursor !== original.nextGroup ||
    original.phase !== 'active' ||
    original.writable !== 0 ||
    digest(plan.initialSchema) !== digest(plan.expectedSchema)
  )
    throw new Error('Invalid data-only abort ancestry')
  const state = await journal(db)
  if (digest(state) === digest(original)) return
  await atomic(db, [
    guard(
      "EXISTS(SELECT 1 FROM _revisionDeployment WHERE planHash=? AND nextGroup=0 AND phase='paused' AND writable=0 AND irreversible=0 AND previousHash=?)",
      [digest(plan), original.planHash],
    ),
    {
      sql: "UPDATE _revisionDeployment SET planHash=?,nextGroup=?,phase='active',writable=0,previousHash=?,irreversible=?,schemaBoundary=? WHERE singleton=1",
      params: [
        original.planHash,
        original.nextGroup,
        original.previousHash ?? null,
        original.irreversible,
        original.schemaBoundary,
      ],
    },
  ])
}

/** Restore the retained application's release identity after a data-only journal run.
 * @param db Fenced production binding.
 * @param plan Rehearsed data-only plan with no numbered migrations or schema changes.
 * @param original Exact active journal retained before maintenance.
 * @returns Verified data release hash and restored application identity.
 * @remarks Retain the plan and completion receipt privately. This does not deploy an app.
 */
export async function finishDataRelease(
  db: D1Database,
  plan: Plan,
  original: Journal,
): Promise<{ dataRelease: string; applicationRelease: string }> {
  if (
    plan.migrations.length ||
    digest(plan.initialSchema) !== digest(plan.expectedSchema) ||
    original.phase !== 'active' ||
    original.writable !== 0 ||
    !plan.parentHash ||
    plan.parentHash !== original.planHash ||
    plan.parentCursor !== original.nextGroup
  )
    throw new Error(
      'Data release must preserve the pinned active application and schema',
    )
  const state = await journal(db)
  if (state?.planHash === original.planHash && state.phase === 'active') {
    // Lost completion responses are resolved against the complete expected after-image.
    if (digest(state) !== digest(original))
      throw new Error('Original application journal differs')
    await verifySchema(db, plan.expectedSchema)
    await verifyRows(db, plan.expected, true)
  } else {
    if (state?.previousHash !== original.planHash)
      throw new Error('Application ancestry differs')
    await markVerified(db, plan)
    await atomic(db, [
      guard(
        "EXISTS(SELECT 1 FROM _revisionDeployment WHERE singleton=1 AND planHash=? AND nextGroup=? AND phase='verified' AND writable=0 AND previousHash=?)",
        [digest(plan), plan.groups.length, original.planHash],
      ),
      ...completeness(true),
      fenceCoverage(plan.tables),
      {
        sql: "UPDATE _revisionDeployment SET planHash=?,nextGroup=?,phase='active',writable=0,previousHash=?,irreversible=?,schemaBoundary=? WHERE singleton=1",
        params: [
          original.planHash,
          original.nextGroup,
          original.previousHash ?? null,
          original.irreversible,
          original.schemaBoundary,
        ],
      },
    ])
  }
  return { dataRelease: digest(plan), applicationRelease: original.planHash }
}

/** Rebase an unstarted data-only release onto its fenced snapshot without losing app ancestry.
 * @param db Fenced target binding.
 * @param plan Rehearsed replacement data plan.
 * @param predecessor Exact prior data-plan hash, retained before replan.
 * @param original Retained active application journal.
 * @returns Nothing after atomic journal replacement; committed groups prohibit rebase.
 */
export async function rebaseDataRelease(
  db: D1Database,
  plan: Plan,
  predecessor: string,
  original: Journal,
): Promise<void> {
  if (
    plan.migrations.length ||
    plan.parentHash !== original.planHash ||
    plan.parentCursor !== original.nextGroup ||
    digest(plan.initialSchema) !== digest(plan.expectedSchema)
  )
    throw new Error('Invalid data-only rebase ancestry')
  const state = await journal(db)
  if (state?.planHash === digest(plan)) return
  if (
    state?.planHash !== predecessor ||
    state.nextGroup !== 0 ||
    state.phase !== 'paused' ||
    state.writable !== 0 ||
    state.irreversible !== 0 ||
    state.previousHash !== original.planHash
  )
    throw new Error('Data rebase requires the exact unstarted fence')
  await verifySchema(db, plan.initialSchema)
  await verifyRows(db, plan.initial)
  await atomic(db, [
    guard(
      "EXISTS(SELECT 1 FROM _revisionDeployment WHERE planHash=? AND nextGroup=0 AND phase='paused' AND writable=0 AND irreversible=0 AND previousHash=?)",
      [predecessor, original.planHash],
    ),
    {
      sql: 'UPDATE _revisionDeployment SET planHash=? WHERE singleton=1',
      params: [digest(plan)],
    },
  ])
}
