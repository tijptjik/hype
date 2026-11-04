// NODE
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
// BUN
import { Database } from 'bun:sqlite'
// PIPELINE
import { backupMirror } from './lib/backup'
import { parseUserDecisions } from './lib/user-decisions'
import {
  acceptUserSyncPlan,
  applyUserSync,
  planUserSync,
  readUserSyncSource,
  readUserSyncTarget,
  userSyncHash,
  type UserSyncPlan,
} from './lib/user-sync'

import {
  lockUserSyncState,
  readUserSyncState,
  writeUserSyncState,
} from './lib/user-sync-state'

/**
 * Plan or apply a private user sync against an explicitly selected local accepted state.
 * @returns Completion with aggregate counts and private receipt paths only.
 * @remarks No production export, network access, provider discovery or source refresh.
 */
async function main(): Promise<void> {
  process.umask(0o077)
  const args = new Map<string, string>()
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i],
      value = process.argv[i + 1]
    if (
      ![
        '--state',
        '--database',
        '--mirror',
        '--seed-file',
        '--decisions',
        '--organisation',
        '--out',
        '--apply-plan',
        '--expect-hash',
      ].includes(key) ||
      !value ||
      value.startsWith('--') ||
      args.has(key)
    )
      throw new Error('Invalid sync arguments')
    args.set(key, value)
  }
  const required = (key: string): string => {
    const value = args.get(key)
    if (!value) throw new Error(`Missing ${key}`)
    return value
  }
  const databasePath = resolve(required('--database'))
  const applyPath = args.get('--apply-plan')
  const statePath = resolve(required('--state'))
  const release = lockUserSyncState(statePath)
  const state = readUserSyncState(statePath)
  const db = new Database(databasePath, { readonly: !applyPath, strict: true })
  try {
    if (applyPath) {
      const plan = JSON.parse(readFileSync(resolve(applyPath), 'utf8')) as UserSyncPlan
      if (userSyncHash(plan) !== required('--expect-hash'))
        throw new Error('Reviewed plan hash differs')
      db.exec('PRAGMA foreign_keys=ON')
      const beforeImage = backupMirror(databasePath)
      const journalPath = statePath + '.local-journal.json'
      const prior = existsSync(journalPath)
        ? JSON.parse(readFileSync(journalPath, 'utf8'))
        : null
      const hash = userSyncHash(plan)
      if (prior && !prior.complete && prior.planHash !== hash)
        throw new Error('Finish the pending local plan first')
      const accepted = state.checkpoint?.planHash === hash
      const resume = prior?.planHash === hash
      if (
        !accepted &&
        !resume &&
        userSyncHash(readUserSyncTarget(db, state)) !== plan.baselineHash
      )
        throw new Error('Local baseline changed')
      writeUserSyncState(journalPath, { planHash: hash, complete: false })
      const mutations = accepted ? 0 : applyUserSync(db, plan, state, resume)
      const nextState = accepted ? state : acceptUserSyncPlan(plan, state)
      writeUserSyncState(statePath, nextState)
      writeUserSyncState(journalPath, { planHash: hash, complete: true })
      const receipt = {
        planHash: userSyncHash(plan),
        targetIdentity: plan.targetIdentity,
        databasePath,
        beforeImage,
        mutations,
        acceptedHash: userSyncHash(readUserSyncTarget(db, nextState)),
        appliedAt: new Date().toISOString(),
      }
      const receiptPath = `${resolve(applyPath)}.${randomUUID()}.receipt.json`
      writeFileSync(receiptPath, JSON.stringify(receipt, null, 2), {
        mode: 0o600,
        flag: 'wx',
      })
      console.log(JSON.stringify({ mutations, receiptPath }))
      return
    }
    const seedState = JSON.parse(readFileSync(required('--seed-file'), 'utf8')) as {
      version: number
      seed: string
      targetIdentity: string
    }
    if (
      seedState.version !== 1 ||
      !/^[a-f0-9]{64}$/.test(seedState.seed) ||
      !/^(local|production):/.test(seedState.targetIdentity)
    )
      throw new Error('Invalid durable seed')
    const decisions = parseUserDecisions(
      JSON.parse(readFileSync(required('--decisions'), 'utf8')),
    )
    const organisation = db
      .query('SELECT id FROM organisation WHERE code=? AND isArchived=0')
      .get(required('--organisation')) as { id: string } | null
    if (!organisation) throw new Error('Organisation not found')
    const sourcePath = backupMirror(resolve(required('--mirror')))
    const sourceDb = new Database(sourcePath, { readonly: true })
    try {
      const target = db.transaction(() => readUserSyncTarget(db, state))()
      const plan = planUserSync(readUserSyncSource(sourceDb), target, {
        ...seedState,
        organisationId: organisation.id,
        decisions,
      })
      const directory = resolve(required('--out'))
      mkdirSync(directory, { recursive: true, mode: 0o700 })
      const planPath = resolve(directory, `${randomUUID()}.plan.json`)
      writeFileSync(planPath, JSON.stringify(plan), { mode: 0o600, flag: 'wx' })
      console.log(
        JSON.stringify(
          {
            ...plan.counts,
            exceptions: plan.exceptions.length,
            mutations: plan.mutations.length,
            checkpointChanged: plan.checkpointChanged,
            planPath,
            planHash: userSyncHash(plan),
            sourcePath,
          },
          null,
          2,
        ),
      )
    } finally {
      sourceDb.close()
    }
  } finally {
    db.close()
    release()
  }
}

main().catch(error => {
  // Inputs and SQLite errors can contain personal data; details remain in private plans.
  console.error(
    'User sync stopped without publishing identity data. Check arguments, complete source coverage, schema and the private review plan.',
  )
  process.exitCode = 1
})
