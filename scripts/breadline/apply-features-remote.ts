// NODE
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
// CLOUDFLARE
import { getPlatformProxy } from 'wrangler'
// PIPELINE
import { applyFeatureSyncGroup, type FeatureSyncPlan } from './lib/feature-sync-plan'
import { userSyncHash } from './lib/user-sync-contract'
import { writeUserSyncState } from './lib/user-sync-state'
// TYPES
import type { D1Database } from '@cloudflare/workers-types'

/** Apply reviewed atomic Feature groups through Wrangler's Node transport.
 * @returns Durable group cursor and final receipt.
 * @remarks Invoked only by the locked operator; the selected binding and plan hash must match.
 */
async function main(): Promise<void> {
  process.umask(0o077)
  const [planPath, target, hash, configPath, journalPath, receiptPath] =
    process.argv.slice(2)
  if (process.argv.length !== 8) throw new Error('Invalid remote feature arguments')
  const plan = JSON.parse(readFileSync(planPath, 'utf8')) as FeatureSyncPlan
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  const binding = config.d1_databases?.find(
    (r: { binding: string }) => r.binding === 'DB',
  )
  if (
    plan.version !== 1 ||
    plan.exceptions.length ||
    userSyncHash(plan) !== hash ||
    plan.targetIdentity !== target ||
    target !== `production:${binding?.database_id}` ||
    binding.database_name !== 'hype-db-prod' ||
    !binding.remote
  )
    throw new Error('Feature plan or production target differs')
  let journal = existsSync(journalPath)
    ? JSON.parse(readFileSync(journalPath, 'utf8'))
    : null
  if (journal && journal.planHash !== hash && !journal.complete)
    throw new Error('Finish pending feature plan')
  if (!journal || journal.planHash !== hash)
    journal = { planHash: hash, targetIdentity: target, nextGroup: 0, complete: false }
  if (
    journal.targetIdentity !== target ||
    !Number.isInteger(journal.nextGroup) ||
    journal.nextGroup < 0 ||
    journal.nextGroup > plan.groups.length
  )
    throw new Error('Invalid feature journal')
  writeUserSyncState(journalPath, journal)
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath,
    envFiles: [],
    persist: false,
    remoteBindings: true,
  })
  try {
    // Fail closed if the application schema has migrated since this plan was prepared.
    if (
      await proxy.env.DB.prepare(
        "SELECT 1 FROM sqlite_master WHERE name='location'",
      ).first()
    )
      throw new Error('Production no longer uses the Place schema')
    for (let i = journal.nextGroup; i < plan.groups.length; i++) {
      await applyFeatureSyncGroup(proxy.env.DB, plan.groups[i])
      journal.nextGroup = i + 1
      writeUserSyncState(journalPath, journal)
      if (journal.nextGroup % 25 === 0)
        console.log(
          JSON.stringify({
            appliedGroups: journal.nextGroup,
            total: plan.groups.length,
          }),
        )
    }
    journal.complete = true
    writeUserSyncState(journalPath, journal)
    writeFileSync(receiptPath, JSON.stringify(journal), { mode: 0o600, flag: 'wx' })
  } finally {
    await proxy.dispose()
  }
}
main().catch(error => {
  writeFileSync(
    '.local/breadline/feature-remote-error.json',
    JSON.stringify({ message: String(error), stack: error?.stack }),
    { mode: 0o600 },
  )
  console.error(
    'Remote feature import stopped. Preserve the journal and resume the same reviewed plan.',
  )
  process.exitCode = 1
})
