// SYNC
import {
  USER_SYNC_RUNTIME_TABLES,
  userSyncHash,
  type UserSyncPlan,
  type UserSyncMutation,
} from './user-sync-contract'
// TYPES
import type { D1Database } from '@cloudflare/workers-types'

export type UserSyncJournal = {
  planHash: string
  targetIdentity: string
  nextMutation: number
  complete: boolean
}
export type SyncStatement = { sql: string; values: Array<string | number | null> }

/** Quote reviewed schema identifiers.
 * @param value Identifier from a private plan.
 * @returns Quoted identifier, rejecting SQL fragments.
 */
function identifier(value: string): string {
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(value)) throw new Error('Invalid plan identifier')
  return `"${value}"`
}

/** Prepare an exact before-or-after guarded mutation for safe lost-response retries.
 * @param mutation Reviewed row mutation.
 * @returns Atomic guard and conditional write, each below D1's parameter limit.
 * @remarks An after-image includes unchanged columns from the before-image. Conflicting
 * edits abort the batch. Replaying an already applied row performs no writes.
 */
export function userSyncRowStatements(mutation: UserSyncMutation): SyncStatement[] {
  if (
    !(USER_SYNC_RUNTIME_TABLES as readonly string[]).includes(mutation.table) ||
    !Object.keys(mutation.key).length
  )
    throw new Error('Invalid plan table/key')
  const table = identifier(mutation.table)
  const match = (row: NonNullable<UserSyncMutation['before']>): string =>
    Object.keys(row)
      .map(key => `${identifier(key)} IS json_extract(?, '$.${key}')`)
      .join(' AND ')
  // Use a JSON object via a single CTE binding even for wide user rows.
  const matches = (
    row: NonNullable<UserSyncMutation['before']>,
    param: string,
  ): string => match(row).replaceAll('?', param)
  const before = mutation.before
  const after = mutation.after ? { ...before, ...mutation.after } : null
  const keyMatch = matches(mutation.key, 'k')
  const beforeMatch = before ? matches(before, 'b') : ''
  const afterMatch = after ? matches(after, 'a') : ''
  const exists = (predicate: string): string =>
    `EXISTS(SELECT 1 FROM ${table} WHERE ${predicate})`
  const validBefore = before ? exists(beforeMatch) : `NOT ${exists(keyMatch)}`
  const validAfter = after ? exists(afterMatch) : `NOT ${exists(keyMatch)}`
  const cte = 'WITH input(k,b,a) AS (VALUES(?,?,?)) '
  const values = [
    JSON.stringify(mutation.key),
    JSON.stringify(before),
    JSON.stringify(after),
  ]
  const guard = {
    sql: `${cte}SELECT CASE WHEN (${validBefore}) OR (${validAfter}) THEN 1 ELSE json('stale user sync row') END FROM input`,
    values,
  }
  let sql: string
  if (!after)
    sql = `${cte}DELETE FROM ${table} WHERE EXISTS(SELECT 1 FROM input WHERE ${beforeMatch})`
  else if (before)
    sql = `${cte}UPDATE ${table} SET ${Object.keys(mutation.after!)
      .map(key => `${identifier(key)}=(SELECT json_extract(a,'$.${key}') FROM input)`)
      .join(
        ',',
      )} WHERE EXISTS(SELECT 1 FROM input WHERE (${beforeMatch}) AND NOT (${afterMatch}))`
  else
    sql = `${cte}INSERT INTO ${table}(${Object.keys(after).map(identifier).join(',')}) SELECT ${Object.keys(
      after,
    )
      .map(key => `json_extract(a,'$.${key}')`)
      .join(',')} FROM input WHERE NOT ${exists(keyMatch)}`
  return [guard, { sql, values }]
}

/** Apply a reviewed production plan with progress persisted exclusively by the operator.
 * @param db Production D1 binding.
 * @param plan Exact reviewed plan against the accepted local baseline.
 * @param targetIdentity Configured production identity.
 * @param journal Private local progress, or null on first application.
 * @param save Durably persist progress after each successful atomic batch.
 * @returns Completed plan hash and runtime mutation count.
 * @remarks Caller holds the local operator lock until baseline promotion. A lost response
 * retries the same exact before-or-after batch; no production export or fence is needed.
 */
export async function applyUserSyncRemote(
  db: D1Database,
  plan: UserSyncPlan,
  targetIdentity: string,
  journal: UserSyncJournal | null,
  save: (journal: UserSyncJournal) => void,
): Promise<{ planHash: string; mutations: number }> {
  if (
    plan.version !== 2 ||
    plan.exceptions.length ||
    !targetIdentity.startsWith('production:') ||
    targetIdentity !== plan.targetIdentity
  )
    throw new Error('Production target or reviewed plan mismatch')
  const planHash = userSyncHash(plan)
  const mutations = plan.mutations.filter(row => row.table !== 'breadlineUserSyncState')
  if (
    journal &&
    (journal.planHash !== planHash ||
      journal.targetIdentity !== targetIdentity ||
      !Number.isInteger(journal.nextMutation) ||
      journal.nextMutation < 0 ||
      journal.nextMutation > mutations.length ||
      (journal.complete && journal.nextMutation !== mutations.length))
  )
    throw new Error('Local journal mismatch')
  let progress = journal ?? {
    planHash,
    targetIdentity,
    nextMutation: 0,
    complete: false,
  }
  if (!journal) save(progress)
  for (let offset = progress.nextMutation; offset < mutations.length; offset += 20) {
    const batch = mutations.slice(offset, offset + 20)
    await db.batch(
      batch.flatMap(mutation =>
        userSyncRowStatements(mutation).map(row =>
          db.prepare(row.sql).bind(...row.values),
        ),
      ),
    )
    progress = { ...progress, nextMutation: offset + batch.length }
    save(progress)
  }
  save({ ...progress, complete: true })
  return { planHash, mutations: mutations.length }
}
