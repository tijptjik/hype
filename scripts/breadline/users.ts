// NODE
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
// BUN
import { Database } from 'bun:sqlite'
// PIPELINE
import { parseUserDecisions } from './lib/user-decisions'
import { backupMirror } from './lib/backup'
import { targetArguments, type ImportTarget } from './lib/pipeline'
import {
  planUsers,
  userPlanSql,
  type LegacyUser,
  type TargetIdentitySnapshot,
} from './lib/users'

interface D1Config {
  d1_databases?: Array<{ binding: string; database_id: string }>
  env?: {
    production?: { d1_databases?: Array<{ binding: string; database_id: string }> }
  }
}

/**
 * Read identity fields only from an explicitly selected D1 destination.
 * @param target Local or production Hype database.
 * @returns Users and accounts needed for matching, never token/session columns.
 */
async function readTarget(target: ImportTarget): Promise<TargetIdentitySnapshot> {
  const command =
    'SELECT id,email,username,emailVerified,isArchived,isAnonymous FROM user; SELECT id,userId,providerId,accountId FROM account;'
  const child = Bun.spawn(
    [
      'bun',
      'run',
      'wrangler',
      'd1',
      'execute',
      ...targetArguments(target),
      '--command',
      command,
      '--json',
    ],
    { stdout: 'pipe', stderr: 'ignore' },
  )
  const output = await new Response(child.stdout).text()
  if ((await child.exited) !== 0)
    throw new Error('Unable to read destination identities')
  const response = JSON.parse(output) as Array<{ success: boolean; results: unknown[] }>
  if (
    response.length !== 2 ||
    response.some(result => result.success !== true || !Array.isArray(result.results))
  )
    throw new Error('Unexpected destination response')
  return {
    users: response[0].results,
    accounts: response[1].results,
  } as TargetIdentitySnapshot
}

/**
 * Prepare an offline-only user mapping and review SQL without applying any writes.
 * @returns Nothing. Prints aggregate counts and private artifact paths only.
 */
async function main(): Promise<void> {
  process.umask(0o077)
  let target: ImportTarget | undefined
  let mirror = '.local/breadline/mirror.sqlite'
  let targetSnapshot: string | undefined
  let decisionsPath = '.local/breadline/user-decisions.json'
  let explicitDecisions = false
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    const option = args[i]
    const value = args[++i]
    if (!value || value.startsWith('--')) throw new Error('Missing option value')
    if (option === '--target' && (value === 'local' || value === 'production'))
      target = value
    else if (option === '--mirror') mirror = value
    else if (option === '--target-snapshot') targetSnapshot = value
    else if (option === '--decisions') {
      decisionsPath = value
      explicitDecisions = true
    } else throw new Error('Unknown option; this command does not accept --apply')
  }
  if (!target) throw new Error('Explicit target required')
  const configPath = target === 'local' ? 'wrangler.local.toml' : 'wrangler.toml'
  const config = Bun.TOML.parse(readFileSync(configPath, 'utf8')) as D1Config
  const binding = (
    target === 'local' ? config.d1_databases : config.env?.production?.d1_databases
  )?.find(entry => entry.binding === 'DB')
  if (!binding?.database_id) throw new Error('Missing target database binding')
  const targetIdentity = `${target}:${binding.database_id}`
  const directory = resolve('.local/breadline/users', target)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const statePath = resolve(directory, 'identity-seed.json')
  // Persist the ID seed before planning, so retries cannot assign different user IDs.
  try {
    writeFileSync(
      statePath,
      JSON.stringify({
        version: 1,
        targetIdentity,
        seed: randomBytes(32).toString('hex'),
      }),
      { mode: 0o600, flag: 'wx' },
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  const state = JSON.parse(readFileSync(statePath, 'utf8'))
  if (
    state.version !== 1 ||
    state.targetIdentity !== targetIdentity ||
    !/^[a-f0-9]{64}$/.test(state.seed)
  )
    throw new Error('Offline ID state does not match target')
  let destination: TargetIdentitySnapshot
  if (targetSnapshot) {
    const db = new Database(resolve(targetSnapshot), { readonly: true })
    try {
      destination = db.transaction(() => ({
        users: db
          .query(
            'SELECT id,email,username,emailVerified,isArchived,isAnonymous FROM user',
          )
          .all(),
        accounts: db.query('SELECT id,userId,providerId,accountId FROM account').all(),
      }))() as TargetIdentitySnapshot
    } finally {
      db.close()
    }
  } else destination = await readTarget(target)
  const sourcePath = backupMirror(resolve(mirror))
  const source = new Database(sourcePath, { readonly: true })
  let rows: LegacyUser[]
  let checkpoints: unknown[]
  try {
    rows = source
      .query(
        'SELECT id,volunteer_id,uid,email,name,telephone,locale,picture,created_at,last_updated_at FROM breadline__public__users ORDER BY id',
      )
      .all() as LegacyUser[]
    checkpoints = source
      .query(
        "SELECT sourceTable, checkpoint FROM _breadline_sync_state WHERE sourceTable IN ('users','volunteers')",
      )
      .all()
  } finally {
    source.close()
  }
  const decisions =
    existsSync(decisionsPath) || explicitDecisions
      ? parseUserDecisions(JSON.parse(readFileSync(decisionsPath, 'utf8')))
      : parseUserDecisions({ version: 1, merges: [], excludeEmails: [] })
  const plan = planUsers(rows, destination, state.seed, decisions)
  const runPath = resolve(directory, randomUUID())
  mkdirSync(runPath, { mode: 0o700 })
  // Crosswalks and identity snapshots stay outside Git and outside the Hype database.
  const manifest = {
    version: 1,
    targetIdentity,
    targetSnapshot: targetSnapshot ? resolve(targetSnapshot) : 'live-d1-read',
    targetHash: createHash('sha256').update(JSON.stringify(destination)).digest('hex'),
    sourcePath,
    checkpoints,
    plannedAt: new Date().toISOString(),
    decisions,
    decisionsPath: existsSync(decisionsPath) ? resolve(decisionsPath) : null,
    ...plan,
  }
  writeFileSync(resolve(runPath, 'plan.json'), JSON.stringify(manifest, null, 2), {
    mode: 0o600,
    flag: 'wx',
  })
  writeFileSync(
    resolve(runPath, 'target-identities.json'),
    JSON.stringify(destination),
    { mode: 0o600, flag: 'wx' },
  )
  writeFileSync(
    resolve(runPath, 'review.sql'),
    plan.targetChanges.length
      ? '-- BLOCKED: reconcile targetChanges in plan.json, then replan before generating insert SQL.\n'
      : userPlanSql(plan),
    {
      mode: 0o600,
      flag: 'wx',
    },
  )
  console.log(
    JSON.stringify(
      { ...plan.counts, pendingTargetChanges: plan.targetChanges.length },
      null,
      2,
    ),
  )
  console.log(`Private user-import review: ${runPath}`)
  console.log(
    'No database writes performed. Source snapshot dates are recorded in plan.json.',
  )
}

main().catch(() => {
  console.error(
    'User planning failed. Use --target local|production [--mirror path] [--target-snapshot path] [--decisions path]. No import was applied; error details suppressed to protect identity data.',
  )
  process.exitCode = 1
})
