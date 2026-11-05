// BUN
import type { Database } from 'bun:sqlite'
// SHARED CONTRACT
import {
  canonicalJson,
  userSyncHash,
  USER_SYNC_RUNTIME_TABLES,
  emptyUserSyncLocalState,
  type Row,
  type SourceUserSnapshot,
  type UserSyncSource,
  type UserSyncPlan,
  type UserSyncLocalState,
} from './user-sync-contract'
// IMPORT POLICY
import {
  planUsers,
  normalizedEmail,
  type LegacyUser,
  type ImportIdentity,
} from './users'
import type { UserDecisions } from './user-decisions'
import { userSyncRowStatements } from './user-sync-remote'
import { readImportRuns } from './run-attribution'
import {
  strongestOrganisationRole,
  type OrganisationRoleGrants,
} from '../../../src/lib/roles/organisation'

export {
  canonicalJson,
  userSyncHash,
  USER_SYNC_RUNTIME_TABLES,
  emptyUserSyncLocalState,
} from './user-sync-contract'
export type {
  Row,
  SourceUserSnapshot,
  UserSyncSource,
  UserSyncMutation,
  UserSyncPlan,
  UserSyncLocalState,
} from './user-sync-contract'

// ═══════════════════════
// TABLE OF CONTENTS
// 1. SNAPSHOTS AND HASHES
// 2. RECONCILIATION PLAN
// 3. TRANSACTIONAL LOCAL APPLICATION

const tables = [
  ...USER_SYNC_RUNTIME_TABLES,
  'breadlineUserSyncState',
  'breadlineUserSyncCheckpoint',
] as const
const keys: Record<string, string[]> = {
  user: ['id'],
  account: ['id'],
  breadlineImportUser: ['userId'],
  breadlineImportIdentity: ['sourceUserId'],
  organisationRole: ['organisationId', 'userId'],
  breadlineUserSyncState: ['sourceUserId'],
  breadlineUserSyncCheckpoint: ['id'],
}

/** Read the last accepted local target state; never connects to production.
 * @param db Local baseline or target database.
 * @param state Last accepted private source payloads and checkpoint.
 * @returns Full owned-table snapshots for stale-plan detection.
 */
export function readUserSyncTarget(
  db: Database,
  state: UserSyncLocalState = emptyUserSyncLocalState(),
): Record<string, Row[]> {
  return {
    ...Object.fromEntries(
      USER_SYNC_RUNTIME_TABLES.map(table => [
        table,
        db
          .query(
            `SELECT * FROM "${table}" ORDER BY ${keys[table].map(key => `"${key}"`).join(',')}`,
          )
          .all() as Row[],
      ]),
    ),
    breadlineUserSyncState: state.rows,
    breadlineUserSyncCheckpoint: state.checkpoint ? [state.checkpoint] : [],
  }
}

/**
 * Read a completed Breadline mirror, retaining direct and referenced related records.
 * @param db Immutable source snapshot.
 * @returns Complete source cohort with source metadata excluded from row hashes.
 * @remarks Failed runs, count mismatches and unknown sync strategies cannot imply deletion.
 */
export function readUserSyncSource(db: Database): UserSyncSource {
  const run = db
    .query('SELECT * FROM _breadline_sync_run ORDER BY startedAt DESC LIMIT 1')
    .get() as Row | null
  if (!run || run.status !== 'complete' || typeof run.sourceSnapshotAt !== 'string')
    throw new Error('Complete source snapshot required')
  const states = db
    .query('SELECT * FROM _breadline_sync_state ORDER BY sourceTable')
    .all() as Row[]
  const data = new Map<string, Row[]>()
  for (const state of states) {
    if (
      state.sourceSchema !== 'public' ||
      !/^breadline__public__[a-z_]+$/.test(String(state.mirrorTable))
    )
      throw new Error('Unsupported source table')
    if (
      ![
        'snapshot-replace',
        'full-snapshot',
        'incremental-upsert-with-key-reconciliation',
      ].includes(String(state.strategy))
    )
      throw new Error('Source deletion coverage is incomplete')
    const rows = (
      state.sourceTable === 'runs'
        ? readImportRuns(db)
        : db.query(`SELECT * FROM "${state.mirrorTable}"`).all()
    ) as Row[]
    if (
      rows.length !== state.localRows ||
      rows.length !== state.sourceRows ||
      String(state.syncedAt) < run.sourceSnapshotAt ||
      String(state.syncedAt) > String(run.completedAt)
    )
      throw new Error('Source snapshot is incomplete')
    data.set(
      String(state.sourceTable),
      rows.map(row =>
        Object.fromEntries(
          Object.entries(row).filter(([key]) => !key.startsWith('_breadline_')),
        ),
      ),
    )
  }
  if (states.length !== run.tableCount || !data.has('users') || !data.has('volunteers'))
    throw new Error('Source tables are incomplete')
  const byId = new Map(
    [...data].map(([name, rows]) => [
      name,
      new Map(rows.filter(row => row.id !== undefined).map(row => [row.id, row])),
    ]),
  )
  const relatedIndexes = [...data]
    .filter(([name]) => name !== 'users')
    .map(([name, rows]) => {
      const users = new Map<string | number, Row[]>(),
        volunteers = new Map<string | number, Row[]>()
      for (const row of rows)
        for (const [column, index] of [
          ['user_id', users],
          ['volunteer_id', volunteers],
        ] as const) {
          const id = row[column]
          if (id !== undefined && id !== null)
            index.set(id, [...(index.get(id) ?? []), row])
        }
      return { name, users, volunteers }
    })
  const rows = data
    .get('users')!
    .map(raw => {
      const related: Record<string, Row[]> = {}
      const seen = new Set<string>()
      const queue: Row[] = [raw]
      const add = (name: string, row: Row): void => {
        const key = name + ':' + canonicalJson(row)
        if (seen.has(key)) return
        seen.add(key)
        related[name] ??= []
        related[name].push(row)
        queue.push(row)
      }
      for (const index of relatedIndexes) {
        for (const row of index.users.get(raw.id!) ?? []) add(index.name, row)
        if (raw.volunteer_id !== null)
          for (const row of index.volunteers.get(raw.volunteer_id!) ?? [])
            add(index.name, row)
      }
      // Resolve referenced records without traversing back into another user's identity.
      for (let i = 0; i < queue.length; i++)
        for (const [column, id] of Object.entries(queue[i])) {
          if (!column.endsWith('_id') || column === 'user_id' || id === null) continue
          const name = column.slice(0, -3) + 's'
          const row = byId.get(name)?.get(id)
          if (row) add(name, row)
        }
      for (const records of Object.values(related))
        records.sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)))
      return { user: raw as unknown as LegacyUser, related }
    })
    .sort((a, b) => a.user.id - b.user.id)
  return { complete: true, snapshotAt: run.sourceSnapshotAt, rows }
}

/**
 * Reconcile a fresh source against the last accepted local state using reviewed policy.
 * @param source Complete immutable source, including related rows.
 * @param target Last accepted local target snapshot.
 * @param options Durable target identity/seed, organisation and private decisions.
 * @returns A zero-write replay or a reviewable set of exact before/after changes.
 * @remarks Existing credentials and verified primary email are HYPE-owned. Related
 * source history is retained privately, not represented as already imported runs.
 */
export function planUserSync(
  source: UserSyncSource,
  target: Record<string, Row[]>,
  options: {
    targetIdentity: string
    seed: string
    organisationId: string
    decisions: UserDecisions
    now?: number
  },
): UserSyncPlan {
  if (!source.complete) throw new Error('Complete source snapshot required')
  const now = options.now ?? Date.now()
  const checkpoint = target.breadlineUserSyncCheckpoint.find(row => row.id === 'users')
  if (checkpoint && checkpoint.targetIdentity !== options.targetIdentity)
    throw new Error('Target identity differs from accepted baseline')
  if (checkpoint && String(checkpoint.sourceSnapshotAt) > source.snapshotAt)
    throw new Error('Source snapshot predates accepted baseline')
  const canonical = planUsers(
    source.rows.map(row => row.user),
    { users: [], accounts: [] },
    options.seed,
    options.decisions,
  )
  const sourceHash = userSyncHash(source.rows)
  const plan: UserSyncPlan = {
    version: 2,
    targetIdentity: options.targetIdentity,
    organisationId: options.organisationId,
    previousPlanHash: checkpoint ? String(checkpoint.planHash) : null,
    checkpointChanged:
      !checkpoint ||
      checkpoint.sourceHash !== sourceHash ||
      checkpoint.sourceSnapshotAt !== source.snapshotAt,
    sourceSnapshotAt: source.snapshotAt,
    baselineHash: userSyncHash(target),
    sourceHash,
    mutations: [],
    exceptions: [...canonical.exceptions],
    counts: {
      source: source.rows.length,
      excluded: canonical.excluded.length,
      created: 0,
      updated: 0,
      removed: 0,
      restored: 0,
    },
  }
  const indexes = Object.fromEntries(
    tables.map(table => [
      table,
      new Map(
        target[table].map(row => [
          canonicalJson(keys[table].map(key => row[key])),
          row,
        ]),
      ),
    ]),
  )
  const put = (table: string, after: Row, beforeOverride?: Row | null): void => {
    const key = Object.fromEntries(keys[table].map(key => [key, after[key]]))
    const before =
      beforeOverride === undefined
        ? (indexes[table].get(canonicalJson(Object.values(key))) ?? null)
        : beforeOverride
    if (before && Object.entries(after).every(([key, value]) => before[key] === value))
      return
    plan.mutations.push({ table, key, before, after })
  }
  const identityBySource = new Map(
    target.breadlineImportIdentity.map(row => [Number(row.sourceUserId), row]),
  )
  const volunteerOwners = new Map<number, Set<string>>()
  for (const identity of target.breadlineImportIdentity) {
    if (identity.sourceVolunteerId === null) continue
    const key = Number(identity.sourceVolunteerId)
    const owners = volunteerOwners.get(key) ?? new Set<string>()
    owners.add(String(identity.userId))
    volunteerOwners.set(key, owners)
  }
  const stateBySource = new Map(
    target.breadlineUserSyncState.map(row => [Number(row.sourceUserId), row]),
  )
  const userById = new Map(target.user.map(row => [String(row.id), row]))
  const ownershipByUser = new Map(
    target.breadlineImportUser.map(row => [String(row.userId), row]),
  )
  const phoneOwners = new Map(
    target.user
      .filter(row => row.telephone)
      .map(row => [String(row.telephone), String(row.id)]),
  )
  const emailOwners = new Map(
    target.user
      .filter(row => row.email)
      .map(row => [normalizedEmail(String(row.email)), String(row.id)]),
  )
  const googleOwners = new Map(
    target.account
      .filter(row => row.providerId === 'google')
      .map(row => [String(row.accountId), String(row.userId)]),
  )
  const sourceById = new Map(source.rows.map(row => [row.user.id, row]))
  const identitiesByGroup = new Map<string, ImportIdentity[]>()
  for (const identity of canonical.identities)
    identitiesByGroup.set(identity.userId, [
      ...(identitiesByGroup.get(identity.userId) ?? []),
      identity,
    ])
  const usedOwners = new Set<string>()
  const liveSourceIds = new Set<number>()
  const roles = new Map(
    target.organisationRole
      .filter(row => row.organisationId === options.organisationId)
      .map(row => [String(row.userId), { ...row }]),
  )
  const changedRoles = new Set<string>()
  // Track independent per-source grants without replacing manual or stronger role assignments.
  const setImportGrant = (userId: string, sourceId: number, active: boolean): void => {
    const before = roles.get(userId)
    const grant = JSON.parse(String(before?.grant ?? '{}')) as OrganisationRoleGrants
    const key = `breadline:${sourceId}`
    if ((active && grant[key] === 'user') || (!active && !(key in grant))) return
    if (active) grant[key] = 'user'
    else delete grant[key]
    const role = strongestOrganisationRole(grant)
    if (role)
      roles.set(userId, {
        organisationId: options.organisationId,
        userId,
        role,
        grant: canonicalJson(grant),
      })
    else roles.delete(userId)
    changedRoles.add(userId)
  }

  for (const desired of canonical.users) {
    const identities = identitiesByGroup.get(desired.id)!
    const sourceIds = identities.map(row => row.sourceUserId)
    const owners = new Set(
      sourceIds.flatMap(id =>
        identityBySource.has(id) ? [String(identityBySource.get(id)!.userId)] : [],
      ),
    )
    const id = owners.size === 1 ? [...owners][0] : desired.id
    const existing = userById.get(id)
    const reject = (reason: string): void => {
      plan.exceptions.push({ sourceUserIds: sourceIds, reason })
    }
    if (owners.size > 1 || usedOwners.has(id)) {
      reject('source_cohort_merge_or_split_requires_review')
      continue
    }
    usedOwners.add(id)
    if (
      existing &&
      (!owners.size ||
        !ownershipByUser.has(id) ||
        existing.isArchived ||
        existing.isAnonymous)
    ) {
      reject('target_identity_requires_review')
      continue
    }
    if (
      (desired.telephone &&
        phoneOwners.has(desired.telephone) &&
        phoneOwners.get(desired.telephone) !== id) ||
      identities.some(
        row =>
          (row.email &&
            emailOwners.has(row.email) &&
            emailOwners.get(row.email) !== id) ||
          (row.sourceUid &&
            googleOwners.has(row.sourceUid) &&
            googleOwners.get(row.sourceUid) !== id),
      )
    ) {
      reject('conflicting_target_identities')
      continue
    }
    // Once retained for history, a volunteer identity must not silently move to another source row.
    if (
      identities.some(row => {
        const prior = identityBySource.get(row.sourceUserId)
        return prior && prior.sourceVolunteerId !== row.sourceVolunteerId
      })
    ) {
      reject('source_volunteer_identity_changed')
      continue
    }
    if (
      identities.some(
        row =>
          row.sourceVolunteerId !== null &&
          [...(volunteerOwners.get(row.sourceVolunteerId) ?? [])].some(
            owner => owner !== id,
          ),
      )
    ) {
      reject('source_volunteer_owner_conflict')
      continue
    }
    // A deleted source row still owns its historic volunteer join; new rows cannot take it.
    for (const identity of identities)
      if (identity.sourceVolunteerId !== null)
        volunteerOwners.set(identity.sourceVolunteerId, new Set([id]))
    if (!existing) {
      if (
        target.user.some(row => row.username === desired.username) ||
        canonical.accounts
          .filter(row => row.userId === desired.id)
          .some(row => target.account.some(prior => prior.id === row.id))
      ) {
        reject('generated_identity_collision')
        continue
      }
      put('user', { ...desired, id })
      put('breadlineImportUser', {
        ...canonical.importUsers.find(row => row.userId === desired.id)!,
        userId: id,
      })
      for (const account of canonical.accounts.filter(row => row.userId === desired.id))
        put('account', { ...account, userId: id })
      plan.counts.created++
    } else {
      const resolution = options.decisions.profileResolutions?.find(
        rule =>
          rule.sourceUserIds.length === sourceIds.length &&
          rule.sourceUserIds.every(sourceId => sourceIds.includes(sourceId)),
      )
      const resolveProfile =
        resolution && ownershipByUser.get(id)?.state === 'unclaimed'
      if (resolveProfile) {
        // Operator-reviewed resolution fills the existing latent profile; it never merges owners.
        if (
          existing.email ||
          ownershipByUser.get(id)?.claimedAt != null ||
          desired.email !== resolution.email
        ) {
          reject('reviewed_profile_target_changed')
          continue
        }
        const accounts = canonical.accounts.filter(row => row.userId === desired.id)
        if (
          accounts.some(account =>
            target.account.some(
              prior =>
                prior.id === account.id &&
                (prior.userId !== id ||
                  prior.providerId !== account.providerId ||
                  prior.accountId !== account.accountId),
            ),
          )
        ) {
          reject('generated_identity_collision')
          continue
        }
        put('user', {
          id,
          name: resolution.name,
          email: desired.email,
          emailVerified: desired.emailVerified,
          image: existing.image || desired.image,
          updatedAt: now,
        })
        put('breadlineImportUser', {
          userId: id,
          telephone: desired.telephone,
          state: 'claimed',
          claimedEmail: desired.email,
        })
        for (const account of accounts)
          if (
            !target.account.some(
              prior =>
                prior.userId === id &&
                prior.providerId === account.providerId &&
                prior.accountId === account.accountId,
            )
          )
            put('account', { ...account, userId: id })
      } else put('breadlineImportUser', { userId: id, telephone: desired.telephone })
      // Compare source-owned presentation fields against their last accepted values; retain local edits.
      const previousRows = sourceIds.flatMap(sourceId => {
        const state = stateBySource.get(sourceId)
        const previous = state
          ? (JSON.parse(String(state.sourceJson)) as SourceUserSnapshot).user
          : null
        return previous ? [previous] : []
      })
      if (previousRows.length && !resolveProfile) {
        const prior = planUsers(
          previousRows,
          { users: [], accounts: [] },
          options.seed,
          options.decisions,
        ).users
        if (prior.length === 1) {
          const patch: Row = { id }
          for (const field of ['name', 'locale', 'image', 'telephone'] as const) {
            // A newly ambiguous cohort must not erase the accepted owner's presentation.
            if (
              field !== 'telephone' &&
              ownershipByUser.get(id)?.state === 'claimed' &&
              canonical.importUsers.find(row => row.userId === desired.id)?.state !==
                'claimed'
            )
              continue
            if (
              existing[field] === prior[0][field] &&
              existing[field] !== desired[field]
            )
              patch[field] = desired[field]
          }
          // Runtime claims own their profile; source state still advances without overwriting it.
          if (
            ownershipByUser.get(id)?.claimedAt == null &&
            Object.keys(patch).length > 1
          )
            put('user', { ...patch, updatedAt: now })
        }
      }
    }
    for (const identity of identities) {
      liveSourceIds.add(identity.sourceUserId)
      put('breadlineImportIdentity', { ...identity, userId: id, active: 1 })
      const row = sourceById.get(identity.sourceUserId)!
      const fingerprint = userSyncHash(row)
      const state = stateBySource.get(identity.sourceUserId)
      if (!state || state.fingerprint !== fingerprint || !state.active) {
        put('breadlineUserSyncState', {
          sourceUserId: identity.sourceUserId,
          fingerprint,
          sourceJson: canonicalJson(row),
          active: 1,
          acceptedAt: now,
        })
        if (state && !state.active) plan.counts.restored++
        else if (state) plan.counts.updated++
      }
      setImportGrant(id, identity.sourceUserId, true)
    }
  }
  // Revoke only our source grants. Tombstones keep the history crosswalk and independent account.
  for (const identity of target.breadlineImportIdentity) {
    const sourceId = Number(identity.sourceUserId)
    if (sourceId <= 0 || liveSourceIds.has(sourceId)) continue
    const state = stateBySource.get(sourceId)
    if (state?.active) {
      put('breadlineUserSyncState', { ...state, active: 0, acceptedAt: now })
      plan.counts.removed++
    } else if (!state) {
      const tombstone = { user: null, related: {}, identity }
      put('breadlineUserSyncState', {
        sourceUserId: sourceId,
        fingerprint: userSyncHash(tombstone),
        sourceJson: canonicalJson(tombstone),
        active: 0,
        acceptedAt: now,
      })
      plan.counts.removed++
    }
    put('breadlineImportIdentity', { ...identity, active: 0 })
    setImportGrant(String(identity.userId), sourceId, false)
  }
  for (const userId of changedRoles) {
    const after = roles.get(userId)
    if (after) put('organisationRole', after)
    else {
      const key = { organisationId: options.organisationId, userId }
      const before = indexes.organisationRole.get(canonicalJson(Object.values(key)))!
      plan.mutations.push({ table: 'organisationRole', key, before, after: null })
    }
  }
  return plan
}

/**
 * Apply a reviewed plan atomically to the local accepted state, rejecting stale targets.
 * @param db Local target database; caller makes a private backup first.
 * @param plan Reviewed plan with exact baseline fingerprint.
 * @param state Accepted private source baseline.
 * @param resume Whether a matching durable journal authorizes guarded crash recovery.
 * @returns Number of planned row mutations; identical replay performs no writes.
 * @remarks SQLite's immediate transaction is the writer lock. Production is a separate step.
 */
export function applyUserSync(
  db: Database,
  plan: UserSyncPlan,
  state: UserSyncLocalState = emptyUserSyncLocalState(),
  resume = false,
): number {
  if (plan.version !== 2 || plan.exceptions.length)
    throw new Error('Resolve user sync exceptions before applying')
  return db
    .transaction(() => {
      if (!resume && userSyncHash(readUserSyncTarget(db, state)) !== plan.baselineHash)
        throw new Error('Stale user sync plan')
      if (!plan.mutations.length && !plan.checkpointChanged) return 0
      for (const mutation of plan.mutations.filter(
        row => row.table !== 'breadlineUserSyncState',
      )) {
        for (const statement of userSyncRowStatements(mutation))
          db.query(statement.sql).all(...statement.values)
      }
      if (db.query('PRAGMA foreign_key_check').all().length)
        throw new Error('User sync broke referential integrity')
      return plan.mutations.length
    })
    .immediate()
}

/** Promote private source state only after all target writes have completed.
 * @param plan Successfully applied reviewed plan.
 * @param state Previous accepted private state.
 * @returns New .local-only snapshot; no production bookkeeping tables are required.
 */
export function acceptUserSyncPlan(
  plan: UserSyncPlan,
  state: UserSyncLocalState,
): UserSyncLocalState {
  const rows = new Map(state.rows.map(row => [Number(row.sourceUserId), row]))
  for (const mutation of plan.mutations.filter(
    row => row.table === 'breadlineUserSyncState',
  )) {
    if (mutation.after) rows.set(Number(mutation.key.sourceUserId), mutation.after)
    else rows.delete(Number(mutation.key.sourceUserId))
  }
  return {
    version: 1,
    rows: [...rows.values()].sort(
      (a, b) => Number(a.sourceUserId) - Number(b.sourceUserId),
    ),
    checkpoint:
      plan.checkpointChanged || plan.mutations.length
        ? {
            id: 'users',
            targetIdentity: plan.targetIdentity,
            sourceHash: plan.sourceHash,
            sourceSnapshotAt: plan.sourceSnapshotAt,
            planHash: userSyncHash(plan),
            acceptedAt: Date.now(),
          }
        : state.checkpoint,
  }
}
