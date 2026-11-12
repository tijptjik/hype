// NODE
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs'
import { resolve } from 'node:path'
// SQLITE
import { Database } from 'bun:sqlite'
// REBUILD
import { prepareLocalRevisions } from './prepare-local-revisions'
import { recoverRebuildMedia } from './recover-rebuild-media'
import { backfillPreparedMessaging } from '../messaging/rebuild-stage'
import { restoreD1Export } from './restore-d1-export'
import { convertExistingLocations } from './convert-locations'
import { openSqliteDomain } from '../locations/lib/sqlite-domain'
import { seedDevPersonas } from './seed'
import { prepareMockSpatial } from './mock-spatial'
export { prepareMockSpatial } from './mock-spatial'
import { planBreadlineFeatures } from '../breadline/features'
import {
  userPlanSql,
  type LegacyUser,
  type TargetIdentitySnapshot,
} from '../breadline/lib/users'
import { parseUserDecisions } from '../breadline/lib/user-decisions'
import { applyRebuildAdoptions } from '../breadline/lib/target-adoption'
import { planLocalLatentUsers } from '../breadline/lib/local-users'
import { buildSyncSql } from '../sync-map-styles'
import { reconcilePreparedUsers } from './reconcile-users'
// TYPES
import type { UserSyncLocalState } from '../breadline/lib/user-sync-contract'

/**
 * Read matching inputs without exposing credentials or session data in receipts.
 * @param path Local destination being rebuilt.
 * @returns Identity snapshot for the existing Breadline planner.
 */
function identities(path: string): TargetIdentitySnapshot {
  const db = new Database(path, { readonly: true })
  try {
    return {
      users: db
        .query(
          'SELECT id,email,username,emailVerified,isArchived,isAnonymous,telephone FROM user',
        )
        .all(),
      accounts: db.query('SELECT id,userId,providerId,accountId FROM account').all(),
      importUsers: db
        .query('SELECT userId,telephone,state,claimedEmail FROM breadlineImportUser')
        .all(),
      identities: db
        .query(
          'SELECT sourceUserId,sourceVolunteerId,userId,email,name,sourceUid FROM breadlineImportIdentity',
        )
        .all(),
    } as TargetIdentitySnapshot
  } finally {
    db.close()
  }
}

/**
 * Rebuild the normal development database from retained fresh exports.
 * @returns Nothing after a private receipt and optional local installation.
 * @remarks Never accepts a production destination. Production exports are read-only;
 * mock data is a separate stage, absent from deployment and migration commands.
 */
async function main(): Promise<void> {
  process.umask(0o077)
  let apply = false,
    mocks = true,
    inputs: string | undefined
  let messagingOrganisation: string | undefined
  let identityReview: string | undefined
  let resume: string | undefined
  let recoveryManifest: string | undefined
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    if (
      args[i] === '--recovery-manifest' &&
      args[i + 1] &&
      !args[i + 1].startsWith('--')
    )
      recoveryManifest = resolve(args[++i])
    else if (args[i] === '--apply') apply = true
    else if (args[i] === '--no-mocks') mocks = false
    else if (args[i] === '--resume' && args[i + 1] && !args[i + 1].startsWith('--'))
      resume = resolve(args[++i])
    else if (
      args[i] === '--messaging-organisation' &&
      args[i + 1] &&
      !args[i + 1].startsWith('--')
    )
      messagingOrganisation = args[++i]
    else if (args[i] === '--inputs' && args[i + 1] && !args[i + 1].startsWith('--'))
      inputs = resolve(args[++i])
    else if (
      args[i] === '--identity-review' &&
      args[i + 1] &&
      !args[i + 1].startsWith('--')
    )
      identityReview = resolve(args[++i])
    else
      throw new Error(
        'Usage: rebuild.ts [--apply] [--resume prepared-directory] [--inputs retained-export-directory] [--no-mocks] [--recovery-manifest private-manifest.json] [--identity-review private-review.json] [--messaging-organisation CODE]',
      )
  }
  if (
    process.env.HYPE_DEV_STATE ||
    process.env.CLOUDFLARE_ENV ||
    (process.env.ENVIRONMENT && process.env.ENVIRONMENT !== 'local')
  )
    throw new Error(
      'Unset alternate state/environment: this command targets normal local development only',
    )
  const config = Bun.TOML.parse(readFileSync('wrangler.local.toml', 'utf8')) as {
    vars: { ENVIRONMENT?: string }
    d1_databases: Array<{
      binding: string
      remote?: boolean
      database_name: string
      database_id: string
    }>
  }
  const bindings = config.d1_databases.filter(row => row.binding === 'DB')
  if (
    bindings.length !== 1 ||
    bindings[0].remote ||
    bindings[0].database_name !== 'hype-db-local' ||
    config.vars.ENVIRONMENT !== 'local'
  )
    throw new Error('Expected the explicit local DB binding')
  const namespace = resolve('.wrangler/state/v3/d1/miniflare-D1DatabaseObject')
  const candidates = readdirSync(namespace).filter(name =>
    /^[a-f0-9]{64}\.sqlite$/.test(name),
  )
  if (candidates.length !== 1)
    throw new Error('Expected exactly one normal local D1 database')
  const destination = resolve(namespace, candidates[0])
  mkdirSync('.local/dev-rebuilds', { recursive: true, mode: 0o700 })
  const lock = '.local/dev-rebuilds/active.lock'
  const directory =
    resume ??
    resolve(
      '.local/dev-rebuilds',
      new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID(),
    )
  mkdirSync(directory, { mode: 0o700, recursive: true })
  let step = 'exports'
  const receipt: Record<string, unknown> = resume
    ? JSON.parse(readFileSync(resolve(directory, 'receipt.json'), 'utf8'))
    : {
        version: 1,
        createdAt: new Date().toISOString(),
        destination,
        targetIdentity: `local:${bindings[0].database_id}`,
        mocks,
        applied: false,
      }
  if (resume) {
    if (
      !directory.startsWith(resolve('.local/dev-rebuilds') + '/') ||
      receipt.targetIdentity !== `local:${bindings[0].database_id}` ||
      receipt.destination !== destination ||
      receipt.applied ||
      !receipt.userReconciliation
    )
      throw new Error(
        'Resume requires an unapplied local rebuild with completed user reconciliation',
      )
    inputs = String(receipt.inputs)
    mocks = Boolean(receipt.mocks)
  }
  mkdirSync(lock)
  const seedPath = '.local/breadline/users/local/identity-seed.json'
  let state: { seed: string; targetIdentity: string }
  let reconciliation: ReturnType<typeof reconcilePreparedUsers>
  /** Run a command privately. @param command Literal command arguments. @param label Private log name. @returns Standard output after success. */
  async function run(command: string[], label: string): Promise<string> {
    const log = resolve(directory, label + '.log')
    const child = Bun.spawn(command, { stdout: 'pipe', stderr: 'pipe' })
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    writeFileSync(log, stdout + '\n' + stderr)
    if (code !== 0) throw new Error(`${label} failed; inspect ${log}`)
    return stdout
  }
  const dbPath = resolve(directory, 'prepared.sqlite')
  const operation = (action: string, ...values: string[]) =>
    run(
      ['python3', 'scripts/dev/rebuild-database.py', action, dbPath, ...values],
      action + '-' + randomUUID(),
    )
  try {
    if (!inputs) {
      inputs = resolve(directory, 'inputs')
      mkdirSync(inputs, { mode: 0o700 })
      const schemaPath = resolve(inputs, 'schema.json')
      const command = [
        'bun',
        'wrangler',
        'd1',
        'execute',
        'hype-db-prod',
        '--remote',
        '--env',
        'production',
        '--config',
        'wrangler.toml',
        '--command',
        'SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY type,name',
        '--json',
      ]
      writeFileSync(schemaPath, await run(command, 'hype-schema'))
      const objects = JSON.parse(readFileSync(schemaPath, 'utf8'))[0].results as {
        type: string
        name: string
        sql: string
      }[]
      const tables = objects
        .filter(
          row =>
            row.type === 'table' &&
            !row.name.startsWith('sqlite_') &&
            !row.name.startsWith('_cf_') &&
            !row.name.startsWith('featureSearchFts'),
        )
        .map(row => row.name)
      await run(
        [
          'bun',
          'wrangler',
          'd1',
          'export',
          'hype-db-prod',
          '--remote',
          '--env',
          'production',
          '--config',
          'wrangler.toml',
          '--output',
          resolve(inputs, 'hype.sql'),
          '--skip-confirmation',
          ...tables.flatMap(name => ['--table', name]),
        ],
        'hype-export',
      )
      await run(
        [
          'bun',
          '--env-file=.dev.vars',
          'run',
          'scripts/breadline/sync-source.ts',
          '--full',
          '--mirror',
          resolve(inputs, 'breadline.sqlite'),
        ],
        'breadline-export',
      )
    }
    receipt.inputs = inputs
    const inputHashes = Object.fromEntries(
      ['schema.json', 'hype.sql', 'breadline.sqlite'].map(name => [
        name,
        createHash('sha256')
          .update(readFileSync(resolve(inputs!, name)))
          .digest('hex'),
      ]),
    )
    if (resume && JSON.stringify(inputHashes) !== JSON.stringify(receipt.inputHashes))
      throw new Error('Retained exports changed since preparation')
    receipt.inputHashes = inputHashes
    if (!resume) {
      step = 'restore'
      console.info('Restoring HYPE and applying migrations…')
      receipt.restore = restoreD1Export(
        resolve(inputs, 'hype.sql'),
        resolve(inputs, 'schema.json'),
        dbPath,
      )
      step = 'migrations'
      await operation('migrate', resolve(directory, 'migrations.json'))
      step = 'existing-feature-locations'
      receipt.locationSplit = await convertExistingLocations(dbPath, directory)
      step = 'breadline-users'
      // Keep target-specific IDs stable across every rebuild; decisions are retained as reproducible inputs.
      mkdirSync(resolve('.local/breadline/users/local'), {
        recursive: true,
        mode: 0o700,
      })
      if (!existsSync(seedPath))
        writeFileSync(
          seedPath,
          JSON.stringify({
            version: 1,
            targetIdentity: receipt.targetIdentity,
            seed: randomBytes(32).toString('hex'),
          }),
          { flag: 'wx' },
        )
      state = JSON.parse(readFileSync(seedPath, 'utf8'))
      if (
        state.targetIdentity !== receipt.targetIdentity ||
        !/^[a-f0-9]{64}$/.test(state.seed)
      )
        throw new Error('Mismatched local identity seed')
      writeFileSync(resolve(directory, 'identity-seed.json'), JSON.stringify(state))
      // A fresh production mirror needs production's accepted source state and decisions,
      // including reviewed distinct-person phone overrides; retain them with this rebuild.
      const manifest = JSON.parse(
        readFileSync('.local/breadline/users/production/accepted-sync.json', 'utf8'),
      ) as {
        version: number
        targetIdentity: string
        acceptedState: string
        decisions: string
      }
      const production = Bun.TOML.parse(readFileSync('wrangler.toml', 'utf8')) as {
        env: {
          production: { d1_databases: Array<{ binding: string; database_id: string }> }
        }
      }
      const productionDb = production.env.production.d1_databases.filter(
        row => row.binding === 'DB',
      )
      if (
        manifest.version !== 1 ||
        productionDb.length !== 1 ||
        manifest.targetIdentity !== `production:${productionDb[0].database_id}`
      )
        throw new Error(
          'Production user reconciliation baseline does not match the exported target',
        )
      const acceptedState = JSON.parse(
        readFileSync(manifest.acceptedState, 'utf8'),
      ) as UserSyncLocalState
      if (
        acceptedState.version !== 1 ||
        !Array.isArray(acceptedState.rows) ||
        acceptedState.checkpoint?.targetIdentity !== manifest.targetIdentity
      )
        throw new Error('Invalid accepted production user source state')
      writeFileSync(
        resolve(directory, 'user-source-baseline.json'),
        JSON.stringify(acceptedState),
      )
      writeFileSync(
        resolve(directory, 'user-baseline-manifest.json'),
        JSON.stringify(manifest),
      )
      const decisions = parseUserDecisions(
        JSON.parse(readFileSync(manifest.decisions, 'utf8')),
      )
      writeFileSync(
        resolve(directory, 'user-decisions.json'),
        JSON.stringify(decisions),
      )
      receipt.userReconciliationInputs = {
        productionTarget: manifest.targetIdentity,
        sourceStateSha256: createHash('sha256')
          .update(JSON.stringify(acceptedState))
          .digest('hex'),
        decisionsSha256: createHash('sha256')
          .update(JSON.stringify(decisions))
          .digest('hex'),
        identitySeedSha256: createHash('sha256')
          .update(JSON.stringify(state))
          .digest('hex'),
      }
      const source = new Database(resolve(inputs, 'breadline.sqlite'), {
        readonly: true,
      })
      const rows = source
        .query(
          'SELECT id,volunteer_id,uid,email,name,telephone,locale,picture,created_at,last_updated_at FROM breadline__public__users ORDER BY id',
        )
        .all() as LegacyUser[]
      source.close()
      // Explicit reviewed target adoption runs only on the newly prepared offline database.
      if (identityReview) {
        receipt.identityAdoption = applyRebuildAdoptions(
          dbPath,
          rows,
          identityReview,
          state.seed,
          decisions,
          resolve(directory, 'identity-adoption'),
        )
      }
      reconciliation = reconcilePreparedUsers({
        databasePath: dbPath,
        sourcePath: resolve(inputs, 'breadline.sqlite'),
        directory: resolve(directory, 'user-reconciliation'),
        targetIdentity: String(receipt.targetIdentity),
        seed: state.seed,
        decisions,
        acceptedState,
      })
      receipt.users = reconciliation.counts
      receipt.userReconciliation = reconciliation
    } else {
      state = JSON.parse(readFileSync(resolve(directory, 'identity-seed.json'), 'utf8'))
      reconciliation = receipt.userReconciliation as ReturnType<
        typeof reconcilePreparedUsers
      >
      if (reconciliation.status !== 'passed')
        throw new Error('Cannot resume failed user reconciliation')
      await operation('migrate', resolve(directory, 'resume-migrations.json'))
    }
    if (!receipt.features) {
      step = 'breadline-features'
      console.info('Importing Breadline Features…')
      const featureSql = resolve(directory, 'features.sql')
      planBreadlineFeatures([
        '--source',
        resolve(inputs, 'breadline.sqlite'),
        '--target',
        dbPath,
        '--output',
        featureSql,
      ])
      await operation('sql', featureSql)
      receipt.features = JSON.parse(readFileSync(featureSql + '.receipt.json', 'utf8'))
      const replaySql = resolve(directory, 'features-replay.sql')
      planBreadlineFeatures([
        '--source',
        resolve(inputs, 'breadline.sqlite'),
        '--target',
        dbPath,
        '--output',
        replaySql,
      ])
      if (JSON.parse(readFileSync(replaySql + '.receipt.json', 'utf8')).created !== 0)
        throw new Error('Feature replay creates records')
    }
    if (!receipt.revisions) {
      step = 'dataset-kinds'
      await operation('kinds', resolve(directory, 'kinds.json'))
      receipt.kinds = JSON.parse(
        readFileSync(resolve(directory, 'kinds.json'), 'utf8'),
      ).counts
      step = 'policies'
      await operation('policies', resolve(directory, 'policies.v1.jsonl'))
      const styles = resolve(directory, 'map-styles.sql')
      writeFileSync(styles, buildSyncSql('local', false))
      await operation('sql', styles)
      if (mocks && !receipt.mockSpatial) {
        step = 'mocks'
        const local = openSqliteDomain(dbPath)
        try {
          await seedDevPersonas(local.binding)
        } finally {
          local.close()
        }
        const fixtures = JSON.parse(
          readFileSync('.local/breadline/local-users.json', 'utf8'),
        )
        writeFileSync(resolve(directory, 'local-users.json'), JSON.stringify(fixtures))
        const plan = planLocalLatentUsers(fixtures, identities(dbPath), state.seed)
        if (plan.exceptions.length) throw new Error('Local user fixtures conflict')
        const mockSql = resolve(directory, 'mock-users.sql')
        writeFileSync(mockSql, userPlanSql(plan))
        await operation('sql', mockSql)
        const command = [
          'python3',
          'scripts/locations/seed-lifecycle.py',
          '--db',
          dbPath,
          '--organisation',
          'KpeoIsOhgyP-',
          '--project',
          'vGBvWfSZNELM',
          '--layer',
          '0bf1RYWdpaAt',
          '--apply',
        ]
        await run(command, 'lifecycle-mocks')
        await run(command, 'lifecycle-replay')
        await run(
          ['bun', 'run', 'scripts/dev/seed-tasks.ts', dbPath, '--apply'],
          'task-mocks',
        )
        await run(
          ['bun', 'run', 'scripts/dev/seed-tasks.ts', dbPath, '--apply'],
          'task-replay',
        )
        receipt.mockSpatial = prepareMockSpatial(dbPath)
        if (prepareMockSpatial(dbPath) !== 0)
          throw new Error('Mock spatial replay differs')
        const audit = await run(
          [
            'python3',
            'scripts/locations/audit-lifecycle-fixtures.py',
            '--db',
            dbPath,
            '--base-url',
            'http://127.0.0.1:4173',
            '--markdown',
            resolve(directory, 'scenarios.md'),
          ],
          'fixture-audit',
        )
        const auditResult = JSON.parse(audit)
        writeFileSync(resolve(directory, 'fixture-audit.json'), audit)
        if (!auditResult.fixturePassed)
          throw new Error('A–Z mock starting-state audit failed')
        receipt.mockScenarios = auditResult.scenarios.length
      }
      if (messagingOrganisation) {
        step = 'messaging-availability'
        receipt.messagingAvailability = await backfillPreparedMessaging(
          dbPath,
          messagingOrganisation,
          run,
        )
      }
    }
    step = 'revision-baselines'
    console.info('Initializing verified revision baselines…')
    if (!receipt.revisions) {
      if (recoveryManifest)
        receipt.mediaRecoveryCohorts = await recoverRebuildMedia(
          dbPath,
          directory,
          recoveryManifest,
        )
      receipt.revisions = await prepareLocalRevisions(dbPath, directory)
    }
    step = 'dependent-migrations'
    await operation('migrate', resolve(directory, 'dependent-migrations.json'))
    step = 'translation-schema-audit'
    receipt.i18n = JSON.parse(
      await run(
        [
          'python3',
          'scripts/dev/audit-i18n-storage.py',
          dbPath,
          resolve(directory, 'i18n-storage.json'),
        ],
        'i18n-storage',
      ),
    )
    receipt.counts = JSON.parse(await operation('check'))
    if (apply) {
      step = 'install'
      if (reconciliation.status !== 'passed')
        throw new Error('User reconciliation must pass before installation')
      const backup = resolve(directory, 'before-development.sqlite')
      await operation('install', destination, backup)
      receipt.applied = true
      receipt.backup = backup
      // Retain the accepted local checkpoint for incremental syncs after installation.
      writeFileSync(
        '.local/breadline/users/local/accepted-sync.json',
        JSON.stringify(
          {
            version: 1,
            targetIdentity: receipt.targetIdentity,
            seedFile: resolve(seedPath),
            decisions: resolve(directory, 'user-decisions.json'),
            acceptedState: reconciliation.statePath,
            acceptedDatabase: destination,
            sourceSnapshot: resolve(inputs, 'breadline.sqlite'),
            acceptedPlanHash: reconciliation.planHash,
            reconciliationReceipt: resolve(
              directory,
              'user-reconciliation/receipt.json',
            ),
          },
          null,
          2,
        ) + '\n',
      )
    }
    receipt.status = 'passed'
    console.info(
      `Development rebuild ${apply ? 'installed' : 'prepared'}: ${directory}`,
    )
  } catch (error) {
    receipt.status = 'failed'
    receipt.failedStep = step
    receipt.error = error instanceof Error ? error.message : String(error)
    console.error(`Rebuild receipt: ${resolve(directory, 'receipt.json')}`)
    throw error
  } finally {
    writeFileSync(
      resolve(directory, 'receipt.json'),
      JSON.stringify(receipt, null, 2) + '\n',
    )
    rmSync(lock, { recursive: true })
  }
}

if (import.meta.main)
  main().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
