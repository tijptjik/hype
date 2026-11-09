// NODE
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
// SQLITE
import { Database } from 'bun:sqlite'
// RECONCILIATION
import {
  acceptUserSyncPlan,
  applyUserSync,
  planUserSync,
  readUserSyncSource,
  readUserSyncTarget,
  userSyncHash,
} from '../breadline/lib/user-sync'
// TYPES
import type { UserDecisions } from '../breadline/lib/user-decisions'
import type {
  UserSyncLocalState,
  UserSyncPlan,
} from '../breadline/lib/user-sync-contract'

export interface DevelopmentUserReconciliation {
  status: 'passed'
  counts: UserSyncPlan['counts']
  runtimeMutations: number
  sourceStateMutations: number
  planHash: string
  planPath: string
  statePath: string
  replay: { mutations: 0; exceptions: 0; checkpointChanged: false }
}

/**
 * Reconcile a prepared development database before the rebuild can be installed.
 * @param options Explicit offline target, complete source, accepted source state and reviewed decisions.
 * @returns Aggregate receipt and private evidence paths after a verified zero-write replay.
 * @remarks Production source checkpoints are copied to the local target identity; the
 * caller retains the original production state. Exceptions abort before target writes.
 * This helper refuses the live Miniflare namespace; installation is a separate step.
 */
export function reconcilePreparedUsers(options: {
  databasePath: string
  sourcePath: string
  directory: string
  targetIdentity: string
  seed: string
  decisions: UserDecisions
  acceptedState: UserSyncLocalState
}): DevelopmentUserReconciliation {
  const databasePath = resolve(options.databasePath)
  if (
    !options.targetIdentity.startsWith('local:') ||
    databasePath === resolve(options.sourcePath) ||
    databasePath.startsWith(resolve('.wrangler') + '/')
  )
    throw new Error('User reconciliation requires an offline local development target')
  const directory = resolve(options.directory)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const state: UserSyncLocalState = {
    ...options.acceptedState,
    checkpoint: options.acceptedState.checkpoint
      ? { ...options.acceptedState.checkpoint, targetIdentity: options.targetIdentity }
      : null,
  }
  writeFileSync(resolve(directory, 'before-state.json'), JSON.stringify(state), {
    mode: 0o600,
  })
  const sourceDb = new Database(options.sourcePath, { readonly: true })
  const db = new Database(databasePath, { strict: true, create: false })
  try {
    db.exec('PRAGMA foreign_keys=ON')
    const source = readUserSyncSource(sourceDb)
    const organisation = db
      .query<{ id: string }, []>(
        "SELECT id FROM organisation WHERE code='hkfoodworks' AND isArchived=0",
      )
      .get()
    if (!organisation) throw new Error('HKFoodWorks organisation is missing')
    const inputs = {
      targetIdentity: options.targetIdentity,
      seed: options.seed,
      decisions: options.decisions,
      organisationId: organisation.id,
    }
    // Persist the complete plan before applying; failed cohorts remain inspectable.
    const plan = planUserSync(
      source,
      db.transaction(() => readUserSyncTarget(db, state))(),
      inputs,
    )
    const planPath = resolve(directory, 'plan.json')
    writeFileSync(planPath, JSON.stringify(plan), { mode: 0o600 })
    if (plan.exceptions.length)
      throw new Error(
        `User reconciliation has ${plan.exceptions.length} exception(s); inspect ${planPath}`,
      )
    applyUserSync(db, plan, state)
    const accepted = acceptUserSyncPlan(plan, state)
    const replay = planUserSync(source, readUserSyncTarget(db, accepted), inputs)
    writeFileSync(resolve(directory, 'replay.json'), JSON.stringify(replay), {
      mode: 0o600,
    })
    if (replay.mutations.length || replay.exceptions.length || replay.checkpointChanged)
      throw new Error('User reconciliation did not produce a zero-write replay')
    const statePath = resolve(directory, 'accepted-state.json')
    writeFileSync(statePath, JSON.stringify(accepted), { mode: 0o600 })
    const result: DevelopmentUserReconciliation = {
      status: 'passed',
      counts: plan.counts,
      runtimeMutations: plan.mutations.filter(
        row => row.table !== 'breadlineUserSyncState',
      ).length,
      sourceStateMutations: plan.mutations.filter(
        row => row.table === 'breadlineUserSyncState',
      ).length,
      planHash: userSyncHash(plan),
      planPath,
      statePath,
      replay: { mutations: 0, exceptions: 0, checkpointChanged: false },
    }
    writeFileSync(
      resolve(directory, 'receipt.json'),
      JSON.stringify(result, null, 2) + '\n',
      { mode: 0o600 },
    )
    return result
  } finally {
    db.close()
    sourceDb.close()
  }
}
