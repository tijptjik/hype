// NODE
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  renameSync,
  statSync,
} from 'node:fs'
import { resolve, join } from 'node:path'
// DEPLOYMENT
import { deployWorker } from '../cloud/deploy-worker'
import { restoreD1Export } from '../dev/restore-d1-export'
// ROLLOUT
import {
  prepareRelease,
  releaseSourceHash,
  releaseSourceFiles,
} from './production/prepare'
import {
  matchingBrandingHash,
  retainMatchingBranding,
} from './production/matching-branding'
import { digest } from './production/contract'
import { checkpoint, verifyLocalBackup } from './production/recovery'
import { readQueues, setQueueMaintenance } from './production/queues'
// TYPES
import type { Journal, Plan } from './production/contract'

type Environment = 'production' | 'preview'
type Binding = { binding: string; database_id: string; database_name: string }

/** Run a literal argument vector with private output. @param command Process arguments. @param log Private log file. @returns Standard output, or throws before the next release stage. */
async function run(command: string[], log: string): Promise<string> {
  const child = Bun.spawn(command, { stdout: 'pipe', stderr: 'pipe' })
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  writeFileSync(log, out + '\n' + err, { mode: 0o600 })
  if (code !== 0) throw new Error(`Release stage failed; inspect ${log}`)
  return out
}
/** Fingerprint an isolated application bundle before reuse. @param directory Bundle directory. @returns Content hash. */
export function artifactHash(directory: string): string {
  const files: [string, string][] = []
  const walk = (path: string, prefix: string): void => {
    for (const name of readdirSync(path).sort()) {
      const file = join(path, name),
        key = prefix + name
      if (statSync(file).isDirectory()) walk(file, key + '/')
      else files.push([key, digest(readFileSync(file).toString('base64'))])
    }
  }
  walk(directory, '')
  return digest(files)
}
/** Require the newly deployed app to report the exact pinned release. @param origin Production/preview app origin. @param release Plan hash. @param active Whether writes must already be open. @returns Successful health proof. */
export async function verifyDeployment(
  origin: string,
  release: string,
  active = false,
): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const response = await fetch(new URL('/api/health/revisions', origin), {
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      })
      const health = (await response.json()) as {
        contract: number
        release: string
        ready: boolean
        phase: string
      }
      if (
        response.ok &&
        health.contract === 1 &&
        health.release === release &&
        health.ready &&
        (!active || health.phase === 'active')
      )
        return
    } catch {
      /* Deployment propagation may briefly serve the preceding release. */
    }
    if (attempt < 5) await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error(
    'Deployed worker health/release verification failed; maintenance remains closed unless activation already committed',
  )
}
/** Prepare or resume the independent revision rollout. @returns Completion with retained artifacts. @remarks No Breadline source is opened or merged; production is mutated only with --apply. A failed live run stays fenced and resumes from D1, not a local success flag. */
export async function main(args: string[]): Promise<void> {
  process.umask(0o077)
  const environment = args.shift() as Environment
  if (!['production', 'preview'].includes(environment))
    throw new Error('Expected production or preview')
  let apply = false,
    abort = false,
    localBackup = false,
    curationInput: string | undefined,
    directory: string | undefined
  while (args.length) {
    const arg = args.shift()
    if (arg === '--apply') apply = true
    else if (arg === '--abort-before-migration') abort = true
    else if (arg === '--local-backup') localBackup = true
    else if (arg === '--curation-package' && args[0])
      curationInput = resolve(args.shift()!)
    else if (arg === '--run-dir' && args[0]) directory = resolve(args.shift()!)
    else
      throw new Error(
        'Usage: rollout.ts production|preview [--apply] [--local-backup] [--run-dir DIRECTORY] [--curation-package DIRECTORY]',
      )
  }
  if (abort && (!directory || apply))
    throw new Error('Abort requires --run-dir and cannot use --apply')
  const config = Bun.TOML.parse(readFileSync('wrangler.toml', 'utf8')) as {
    account_id: string
    compatibility_date: string
    env: Record<
      Environment,
      {
        d1_databases: Binding[]
        vars: { PUBLIC_ORIGIN: string }
        queues?: { producers: { queue: string }[] }
      }
    >
  }
  if (process.env.CLOUDFLARE_ACCOUNT_ID !== config.account_id)
    throw new Error('Deployment and recovery accounts differ')
  const bindings = config.env[environment].d1_databases.filter(b => b.binding === 'DB')
  if (
    bindings.length !== 1 ||
    bindings[0].database_name !==
      `hype-db-${environment === 'production' ? 'prod' : 'preview'}`
  )
    throw new Error('Unexpected deployment database')
  const binding = bindings[0],
    target = `${environment}:${binding.database_id}`
  directory ??= resolve(
    '.local/revision-deployments',
    new Date().toISOString().replaceAll(':', '-'),
  )
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  // Retain this operator's backup destination for every retry of the same run.
  const localMarker = join(directory, 'local-backup.target')
  if (existsSync(localMarker)) {
    if (readFileSync(localMarker, 'utf8') !== target)
      throw new Error('Local backup target differs')
    localBackup = true
  } else if (localBackup) {
    writeFileSync(localMarker, target, { flag: 'wx', mode: 0o600 })
  }
  const selectionPath = join(directory, 'selected-plan.json')
  let selected = existsSync(selectionPath)
    ? JSON.parse(readFileSync(selectionPath, 'utf8')).directory
    : 'initial'
  if (!/^(initial|fenced-[0-9]+|migrated-[0-9]+)$/.test(selected))
    throw new Error('Invalid retained plan directory')
  let planPath = join(directory, selected, 'release', 'plan.json')
  if (
    curationInput &&
    (environment !== 'production' ||
      (existsSync(planPath) && !existsSync(join(directory, 'matching-and-branding'))))
  )
    throw new Error('Select production curation before preparing this run')
  const curation = abort ? undefined : retainMatchingBranding(directory, curationInput)
  const remoteConfig = join(directory, 'remote.json')
  writeFileSync(
    remoteConfig,
    JSON.stringify({
      name: 'hype-revision-rollout',
      account_id: config.account_id,
      compatibility_date: config.compatibility_date,
      vars: { ENVIRONMENT: environment },
      d1_databases: [{ ...binding, remote: true }],
    }),
    { mode: 0o600 },
  )
  const wrangler = ['bun', 'wrangler']
  if (abort && !existsSync(planPath)) throw new Error('Abort requires a retained plan')
  /** Export a consistent source checkpoint and rehearse without touching live data. @param snapshotDirectory New retained artifact directory. @returns Complete release plan. */
  const snapshot = async (snapshotDirectory: string): Promise<Plan> => {
    mkdirSync(snapshotDirectory, { mode: 0o700 })
    console.info(
      'Exporting production source and rehearsing independent revision enrollment…',
    )
    const raw = JSON.parse(
      await run(
        [
          ...wrangler,
          'd1',
          'execute',
          binding.database_name,
          '--remote',
          '--env',
          environment,
          '--config',
          'wrangler.toml',
          '--command',
          'SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY type,name',
          '--json',
        ],
        join(snapshotDirectory, 'schema.log'),
      ),
    )
    raw[0].results = raw[0].results.filter(
      (r: { name: string }) => !/^(_revisionDeployment|revision_deploy_)/.test(r.name),
    )
    const schemaPath = join(snapshotDirectory, 'schema.json')
    writeFileSync(schemaPath, JSON.stringify(raw), { mode: 0o600 })
    const tables = raw[0].results
      .filter(
        (r: { type: string; name: string }) =>
          r.type === 'table' && !/^(sqlite_|_cf_|featureSearchFts)/.test(r.name),
      )
      .map((r: { name: string }) => r.name)
    const sqlPath = join(snapshotDirectory, 'source.sql')
    await run(
      [
        ...wrangler,
        'd1',
        'export',
        binding.database_name,
        '--remote',
        '--env',
        environment,
        '--config',
        'wrangler.toml',
        '--output',
        sqlPath,
        '--skip-confirmation',
        ...tables.flatMap((t: string) => ['--table', t]),
      ],
      join(snapshotDirectory, 'export.log'),
    )
    restoreD1Export(sqlPath, schemaPath, join(snapshotDirectory, 'source.sqlite'))
    if (localBackup) await verifyLocalBackup(snapshotDirectory)
    return await prepareRelease(
      join(snapshotDirectory, 'source.sqlite'),
      join(snapshotDirectory, 'release'),
      target,
      undefined,
      { featureLifecycle: 'current', matchingBranding: curation },
    )
  }
  if (!existsSync(planPath)) await snapshot(join(directory, selected))
  let plan = JSON.parse(readFileSync(planPath, 'utf8')) as Plan
  if (plan.target !== target || (!abort && plan.sourceHash !== releaseSourceHash()))
    throw new Error(
      'Source/target differs from the retained release; do not resume with different code',
    )
  if (
    !abort &&
    plan.matchingBrandingHash !==
      (curation ? matchingBrandingHash(curation) : undefined)
  )
    throw new Error('Retained curation selection differs from this plan')
  let release = digest(plan)
  console.info(`Prepared revision deployment ${release}: ${directory}`)
  if (!apply && !abort) return
  if (apply && curation)
    await run(
      [
        'bun',
        'migrations/pending/matching-and-branding/transfer-media.ts',
        curation,
        '--verify-production',
      ],
      join(directory, 'curation-media.log'),
    )
  // Build before pausing; retries reuse the exact retained bundle, never silently rebuild it.
  const artifact = join(directory, 'application'),
    artifactReceipt = join(directory, 'application.json')
  if (abort) {
    // Cancellation never needs to build or replace an application bundle.
  } else if (existsSync(artifact)) {
    if (
      !existsSync(artifactReceipt) ||
      JSON.parse(readFileSync(artifactReceipt, 'utf8')).hash !== artifactHash(artifact)
    )
      throw new Error('Retained application bundle differs')
  } else {
    await run(
      ['bun', 'run', `build:cf:${environment === 'production' ? 'prod' : 'preview'}`],
      join(directory, 'build.log'),
    )
    if (plan.sourceHash !== releaseSourceHash())
      throw new Error('Release source changed during build')
    cpSync('.svelte-kit/cloudflare', artifact, { recursive: true, dereference: true })
    writeFileSync(
      artifactReceipt,
      JSON.stringify({ hash: artifactHash(artifact), release }),
      { mode: 0o600, flag: 'wx' },
    )
  }
  await run(
    [
      'bun',
      'build',
      'scripts/revisions/production/remote.ts',
      '--target=node',
      '--packages=external',
      '--outfile',
      join(directory, 'remote.mjs'),
    ],
    join(directory, 'remote-build.log'),
  )
  const remote = async (
    operation: string,
  ): Promise<Journal & { sourceMatches: boolean }> => {
    const output = join(directory, operation + '.json')
    await run(
      [
        'node',
        join(directory, 'remote.mjs'),
        operation,
        planPath,
        remoteConfig,
        output,
      ],
      join(directory, operation + '.log'),
    )
    return JSON.parse(readFileSync(output, 'utf8')).journal
  }
  const queueNames = (config.env[environment].queues?.producers ?? [])
    .map(q => q.queue)
    .sort()
  const queues = (paused: boolean): Promise<void> =>
    setQueueMaintenance(
      config.account_id,
      queueNames,
      join(directory, 'queues.json'),
      paused,
      (command, label) =>
        run(
          [...command, '--config', 'wrangler.toml', '--env', environment],
          join(directory, label + '.log'),
        ),
    )
  if (abort) {
    await remote('abort')
    if (existsSync(join(directory, 'queues.json'))) await queues(false)
    console.info('Unstarted rollout cancelled; prior queue delivery state restored')
    return
  }
  const recover = async (label: string) => {
    if (localBackup) {
      await verifyLocalBackup(join(directory, 'initial'))
      if (selected !== 'initial') await verifyLocalBackup(join(directory, selected))
      return
    }
    await checkpoint(
      directory,
      environment === 'production' ? 'hype-assets-raw-prod' : 'hype-assets-raw-preview',
      label,
    )
  }
  try {
    const sourceDirectory = join(directory, 'source')
    if (!existsSync(sourceDirectory)) {
      for (const file of releaseSourceFiles()) {
        const destination = join(sourceDirectory, file)
        mkdirSync(resolve(destination, '..'), { recursive: true })
        cpSync(file, destination)
      }
    }
    const sourceFiles = releaseSourceFiles()
    const capturedHash = digest(
      sourceFiles.map(file => [
        file,
        digest(readFileSync(join(sourceDirectory, file)).toString('base64')),
      ]),
    )
    if (capturedHash !== plan.sourceHash)
      throw new Error('Retained recovery source differs')
    writeFileSync(
      join(directory, 'source-inventory.json'),
      JSON.stringify(sourceFiles),
      { mode: 0o600 },
    )
    if (plan.sourceHash !== releaseSourceHash())
      throw new Error('Source changed before checkpoint')
    if (!existsSync(join(directory, 'queues.json')))
      writeFileSync(
        join(directory, 'queues.json'),
        JSON.stringify(await readQueues(config.account_id, queueNames)),
        { mode: 0o600, flag: 'wx' },
      )
    await recover('prepared')
    await queues(true)
    if (plan.parentHash) await remote('rebase')
    await remote('pause')
    if (!(await remote('source')).sourceMatches) {
      console.info(
        'Source changed during preflight; capturing a fresh checkpoint under maintenance…',
      )
      const parentHash = release
      selected = 'fenced-' + Date.now()
      plan = await snapshot(join(directory, selected))
      plan.parentHash = parentHash
      plan.parentCursor = 0
      planPath = join(directory, selected, 'release', 'plan.json')
      writeFileSync(planPath, JSON.stringify(plan) + '\n', { mode: 0o600 })
      writeFileSync(selectionPath + '.tmp', JSON.stringify({ directory: selected }), {
        mode: 0o600,
      })
      renameSync(selectionPath + '.tmp', selectionPath)
      release = digest(plan)
      await recover('fenced-plan')
      await remote('rebase')
    }
    console.info('D1 writers fenced. Applying journaled migrations and baselines…')
    // Migration SQL can generate IDs. Capture the actual migrated source before preparing enrollment IDs/references.
    const migrated = await remote('migrate')
    if (
      migrated.phase === 'paused' &&
      migrated.schemaBoundary > 0 &&
      migrated.nextGroup === migrated.schemaBoundary
    ) {
      const parentHash = release,
        parentCursor = migrated.nextGroup
      selected = 'migrated-' + Date.now()
      plan = await snapshot(join(directory, selected))
      plan.parentHash = parentHash
      plan.parentCursor = parentCursor
      planPath = join(directory, selected, 'release', 'plan.json')
      writeFileSync(planPath, JSON.stringify(plan) + '\n', { mode: 0o600 })
      writeFileSync(selectionPath + '.tmp', JSON.stringify({ directory: selected }), {
        mode: 0o600,
      })
      renameSync(selectionPath + '.tmp', selectionPath)
      release = digest(plan)
      await recover('migrated-plan')
      await remote('rebase')
    }
    const applied = await remote('apply')
    if (applied.phase === 'active') {
      await verifyDeployment(config.env[environment].vars.PUBLIC_ORIGIN, release, true)
      await queues(false)
      console.info('This release is already active')
      return
    }
    await remote('verify')
    if (plan.sourceHash !== releaseSourceHash())
      throw new Error('Release source changed; maintenance stays closed')
    await run(
      [
        ...wrangler,
        'deploy',
        '--config',
        'workers/asset-service/wrangler.toml',
        '--env',
        environment,
      ],
      join(directory, 'asset-deploy.log'),
    )
    if (
      JSON.parse(readFileSync(artifactReceipt, 'utf8')).hash !== artifactHash(artifact)
    )
      throw new Error('Application artifact changed before deployment')
    const deployed = await deployWorker(environment, release, {
      main: join(artifact, '_worker.js'),
      assets: artifact,
    })
    if (deployed !== 0) throw new Error('Application deployment failed')
    const origin = config.env[environment].vars.PUBLIC_ORIGIN
    await verifyDeployment(origin, release)
    await recover('verified')
    if (plan.sourceHash !== releaseSourceHash())
      throw new Error('Source changed before activation')
    await remote('activate')
    await verifyDeployment(origin, release, true)
    await queues(false)
    writeFileSync(
      join(directory, 'completed.json'),
      JSON.stringify(
        {
          target,
          release,
          active: true,
          breadlineIntegration: false,
          at: new Date().toISOString(),
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    )
    console.info(`Revision deployment active: ${directory}`)
  } catch (error) {
    console.error(
      `Release stopped. Preserve ${directory}; inspect the D1 journal and resume this exact plan. Do not restore the old app over new revisions.`,
    )
    throw error
  }
}
if (import.meta.main)
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
