// NODE
import { readFileSync, writeFileSync } from 'node:fs'
// CLOUDFLARE
import { getPlatformProxy } from 'wrangler'
// ROLLOUT
import {
  abortBeforeMigration,
  rebaseUnstarted,
  applyGroups,
  digest,
  journal,
  markVerified,
  pause,
  verifyRows,
  verifySchema,
} from './contract'
import { abortDataRelease, finishDataRelease, rebaseDataRelease } from './data-release'
// TYPES
import type { D1Database } from '@cloudflare/workers-types'
import type { Plan } from './contract'

/** Operate the pinned D1 binding using Wrangler's supported remote proxy under Node.
 * @returns Completion with a private receipt.
 * @remarks Bun orchestrates artifacts; Node owns the remote binding transport. No arbitrary SQL input or alternate target is accepted.
 */
async function main(): Promise<void> {
  const [operation, planPath, configPath, output] = process.argv.slice(2)
  if (
    ![
      'rebase-data',
      'abort-data',
      'check',
      'finish-data',
      'pause',
      'apply',
      'verify',
      'status',
      'abort',
      'rebase',
      'source',
    ].includes(operation) ||
    !output
  )
    throw new Error('Invalid rollout operation')
  const plan = JSON.parse(readFileSync(planPath, 'utf8')) as Plan
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  const binding = config.d1_databases?.find(
    (b: { binding: string }) => b.binding === 'DB',
  )
  if (
    !binding?.remote ||
    !['production', 'preview'].includes(config.vars?.ENVIRONMENT) ||
    plan.version !== 1 ||
    plan.target !== `${config.vars.ENVIRONMENT}:${binding.database_id}` ||
    binding.database_name !==
      `hype-db-${config.vars.ENVIRONMENT === 'production' ? 'prod' : 'preview'}`
  )
    throw new Error('Rollout binding/target differs')
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath,
    envFiles: [],
    persist: false,
    remoteBindings: true,
  })
  try {
    const db = proxy.env.DB
    if (operation === 'abort-data') {
      const original = JSON.parse(
        readFileSync(planPath + '.application-journal.json', 'utf8'),
      )
      await abortDataRelease(db, plan, original)
    }
    if (operation === 'check') {
      const state = await journal(db)
      if (
        state?.phase !== 'active' ||
        state.planHash !== plan.parentHash ||
        state.nextGroup !== plan.parentCursor
      )
        throw new Error('Active application differs from data release parent')
      await verifySchema(db, plan.initialSchema)
      await verifyRows(db, plan.initial)
    }
    if (operation === 'rebase-data') {
      const original = JSON.parse(
        readFileSync(planPath + '.application-journal.json', 'utf8'),
      )
      const predecessor = JSON.parse(
        readFileSync(planPath + '.predecessor.json', 'utf8'),
      ).planHash
      await rebaseDataRelease(db, plan, predecessor, original)
    }
    if (operation === 'finish-data') {
      const original = JSON.parse(
        readFileSync(planPath + '.application-journal.json', 'utf8'),
      )
      await finishDataRelease(db, plan, original)
    }
    if (operation === 'rebase') await rebaseUnstarted(db, plan)
    let sourceMatches = true
    if (operation === 'source') {
      const state = await journal(db)
      if (!state || state.planHash !== digest(plan))
        throw new Error('Wrong source journal')
      if (state.nextGroup === 0 && state.phase === 'paused')
        try {
          await verifySchema(db, plan.initialSchema)
          await verifyRows(db, plan.initial)
        } catch (error) {
          if (
            error instanceof Error &&
            /^(Snapshot differs:|Schema differs)/.test(error.message)
          )
            sourceMatches = false
          else throw error
        }
    }
    if (operation === 'abort') await abortBeforeMigration(db, plan)
    if (operation === 'pause') await pause(db, plan)
    if (operation === 'apply') {
      const state = await journal(db)
      if (!state || state.planHash !== digest(plan))
        throw new Error('Wrong rollout journal')
      if (state.phase === 'paused' && state.nextGroup === 0) {
        await verifySchema(db, plan.initialSchema)
        await verifyRows(db, plan.initial)
      }
      await applyGroups(db, plan)
    }
    if (operation === 'verify') await markVerified(db, plan)
    writeFileSync(
      output,
      JSON.stringify(
        {
          target: plan.target,
          planHash: digest(plan),
          journal: { ...(await journal(db)), sourceMatches },
          operation,
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    )
  } finally {
    await proxy.dispose()
  }
}
main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
