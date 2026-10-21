// NODE
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  openSync,
  closeSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
// DATABASE
import { drizzle } from 'drizzle-orm/d1'
// DOMAIN
import {
  executeFeatureSplit,
  readSplitManifest,
  selectSplitRemoteTarget,
  splitProxyConfig,
} from './lib/split-execution'
import { openSqliteDomain } from './lib/sqlite-domain'
// TYPES
import type { Database } from '../../src/lib/types'
import type { D1Database } from '@cloudflare/workers-types'
import type { SplitExecutionRun, SplitTarget } from './lib/split-execution'

type Receipt = {
  version: 1
  manifestHash: string
  target: SplitTarget
  runs: SplitExecutionRun[]
}

/** Replace a private execution receipt atomically. @param path Explicit receipt path. @param value Audit envelope. @returns Nothing. */
function saveReceipt(path: string, value: Receipt): void {
  const temporary = `${path}.${crypto.randomUUID()}.tmp`
  try {
    writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', {
      mode: 0o600,
      flag: 'wx',
    })
    renameSync(temporary, path)
  } finally {
    rmSync(temporary, { force: true })
  }
}

/**
 * Describe an exact split execution target, or apply only when --apply is supplied.
 * @returns Count-only output and an append-preserving receipt for explicit execution.
 * @remarks Description never connects to Cloudflare. Remote execution uses only the
 * selected DB binding, remote:true, no local persistence and a first-primary session.
 * This command does not apply schema migrations, import donors or deploy application code.
 */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      manifest: { type: 'string' },
      sha256: { type: 'string' },
      receipt: { type: 'string' },
      sqlite: { type: 'string' },
      remote: { type: 'string' },
      help: { type: 'boolean' },
      'account-id': { type: 'string' },
      'database-id': { type: 'string' },
      apply: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  })
  if (values.help) {
    console.log(
      'Usage: execute-feature-split.ts --manifest FILE --sha256 SHA256 --receipt FILE (--sqlite FILE | --remote preview|production --account-id ACCOUNT --database-id UUID) [--apply]\nWithout --apply, describes the target offline and makes no connection.',
    )
    return
  }
  if (!values.manifest || !values.sha256 || !values.receipt)
    throw new Error('SPLIT_MANIFEST_HASH_AND_RECEIPT_REQUIRED')
  if (Boolean(values.sqlite) === Boolean(values.remote))
    throw new Error('SPLIT_EXACTLY_ONE_TARGET_REQUIRED')
  const manifestPath = resolve(values.manifest),
    receiptPath = resolve(values.receipt)
  const manifest = readSplitManifest(readFileSync(manifestPath, 'utf8'), values.sha256)
  let target: SplitTarget
  if (values.sqlite) {
    if (values['account-id'] || values['database-id'])
      throw new Error('SPLIT_MIXED_TARGET_OPTIONS')
    target = { kind: 'sqlite', path: resolve(values.sqlite) }
    if (!existsSync(target.path)) throw new Error('SPLIT_LOCAL_DATABASE_MISSING')
  } else {
    target = selectSplitRemoteTarget(
      Bun.TOML.parse(readFileSync('wrangler.toml', 'utf8')),
      values.remote!,
      values['database-id'] ?? '',
      values['account-id'] ?? '',
    )
  }
  if (
    [
      manifestPath,
      resolve('wrangler.toml'),
      ...(target.kind === 'sqlite' ? [target.path] : []),
    ].includes(receiptPath)
  )
    throw new Error('SPLIT_RECEIPT_INPUT_COLLISION')
  // Offline description is the default; even Wrangler is loaded only for explicit remote execution.
  if (!values.apply) {
    console.log(
      JSON.stringify({
        mode: 'describe-only',
        target,
        manifestHash: manifest.hash,
        features: manifest.plans.length,
      }),
    )
    return
  }
  process.umask(0o077)
  const lockPath = receiptPath + '.lock'
  let lock: number
  try {
    lock = openSync(lockPath, 'wx', 0o600)
  } catch {
    throw new Error('SPLIT_RECEIPT_IN_USE_OR_UNWRITABLE')
  }
  try {
    writeFileSync(
      lock,
      JSON.stringify({ pid: process.pid, manifestHash: manifest.hash, target }),
    )
    let receipt: Receipt = { version: 1, manifestHash: manifest.hash, target, runs: [] }
    if (existsSync(receiptPath)) {
      const prior = JSON.parse(readFileSync(receiptPath, 'utf8')) as Receipt
      if (
        prior.version !== 1 ||
        prior.manifestHash !== manifest.hash ||
        JSON.stringify(prior.target) !== JSON.stringify(target) ||
        !Array.isArray(prior.runs)
      )
        throw new Error('SPLIT_RECEIPT_TARGET_MISMATCH')
      receipt = prior
    }
    const index = receipt.runs.length
    const save = (run: SplitExecutionRun): void => {
      receipt.runs[index] = run
      saveReceipt(receiptPath, receipt)
    }
    let db: Database
    let dispose: () => Promise<void>
    if (target.kind === 'sqlite') {
      const local = openSqliteDomain(target.path)
      db = local.db
      dispose = async () => local.close()
    } else {
      const directory = mkdtempSync(join(tmpdir(), 'hype-place-split-proxy-'))
      const configPath = join(directory, 'wrangler.json')
      writeFileSync(configPath, JSON.stringify(splitProxyConfig(target)), {
        mode: 0o600,
      })
      try {
        const { getPlatformProxy } = await import('wrangler')
        const platform = await getPlatformProxy<{ DB: D1Database }>({
          configPath,
          envFiles: [],
          persist: false,
          remoteBindings: true,
        })
        try {
          db = drizzle(platform.env.DB.withSession('first-primary')) as Database
        } catch (error) {
          await platform.dispose()
          throw error
        }
        dispose = async () => {
          try {
            await platform.dispose()
          } finally {
            rmSync(directory, { recursive: true, force: true })
          }
        }
      } catch {
        rmSync(directory, { recursive: true, force: true })
        throw new Error('SPLIT_REMOTE_CONNECTION_FAILED')
      }
    }
    try {
      const run = await executeFeatureSplit(db, manifest.plans, save)
      const counts: Record<string, number> = {}
      for (const outcome of run.outcomes)
        counts[outcome.status] = (counts[outcome.status] ?? 0) + 1
      console.log(
        JSON.stringify({
          status: run.status,
          target,
          manifestHash: manifest.hash,
          counts,
        }),
      )
    } finally {
      await dispose()
    }
  } finally {
    closeSync(lock)
    rmSync(lockPath, { force: true })
  }
}
await main().catch(error => {
  console.error(
    error instanceof Error && /^SPLIT_|^DUPLICATE_SPLIT_/.test(error.message)
      ? error.message
      : 'SPLIT_EXECUTION_FAILED',
  )
  process.exitCode = 1
})
