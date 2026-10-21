// NODE
import { createHash } from 'node:crypto'
// VALIDATION
import { z } from 'zod'
// DOMAIN
import { applyUnresolvedFeatureSplit } from '../../../src/lib/db/services/locationSplit'
// TYPES
import type { Database } from '../../../src/lib/types'
import type { UnresolvedFeatureSplit } from '../../../src/lib/locations/migrationPlan'

export type SplitTarget =
  | { kind: 'sqlite'; path: string }
  | {
      kind: 'remote'
      environment: 'preview' | 'production'
      accountId: string
      databaseId: string
      databaseName: string
    }
export type SplitExecutionRun = {
  startedAt: string
  completedAt?: string
  status: 'running' | 'complete' | 'conflict' | 'failed'
  outcomes: Array<{
    featureId: string
    status: 'applied' | 'already-applied' | 'conflict'
  }>
  failedFeatureId?: string
}
const header = z.object({
  version: z.literal(1),
  strategy: z.literal('unresolved-with-preserved-values'),
  plans: z.array(
    z
      .object({ featureId: z.string().min(1), projectId: z.string().min(1) })
      .passthrough(),
  ),
})

/** Validate manifest bytes and exact reviewed identity. @param bytes Private manifest. @param expectedHash SHA-256 selected by the operator. @returns Parsed split plans and their hash. */
export function readSplitManifest(
  bytes: string,
  expectedHash: string,
): { hash: string; plans: UnresolvedFeatureSplit[] } {
  const hash = createHash('sha256').update(bytes).digest('hex')
  if (!/^[a-f0-9]{64}$/.test(expectedHash) || hash !== expectedHash)
    throw new Error('SPLIT_MANIFEST_HASH_MISMATCH')
  let manifest: z.infer<typeof header>
  try {
    manifest = header.parse(JSON.parse(bytes))
  } catch {
    throw new Error('SPLIT_MANIFEST_INVALID')
  }
  if (
    new Set(manifest.plans.map(plan => plan.featureId)).size !== manifest.plans.length
  )
    throw new Error('DUPLICATE_SPLIT_FEATURE')
  // The domain service recomputes and compares every complete plan against persisted baseline data.
  return { hash, plans: manifest.plans as unknown as UnresolvedFeatureSplit[] }
}

/**
 * Select one explicitly named remote DB without inheriting unrelated application bindings.
 * @param config Parsed checked-in Wrangler configuration.
 * @param environment Explicit release environment.
 * @param expectedDatabaseId Operator-selected database ID, checked against the repository.
 * @param accountId Explicit Cloudflare account identity.
 * @returns Exact remote target; no connection or mutation occurs.
 */
export function selectSplitRemoteTarget(
  config: unknown,
  environment: string,
  expectedDatabaseId: string,
  accountId: string,
): Extract<SplitTarget, { kind: 'remote' }> {
  if (environment !== 'production' && environment !== 'preview')
    throw new Error('SPLIT_ENVIRONMENT_REQUIRED')
  if (!/^[a-f0-9]{32}$/.test(accountId)) throw new Error('SPLIT_ACCOUNT_ID_REQUIRED')
  const parsed = z
    .object({
      env: z.record(
        z.string(),
        z
          .object({
            d1_databases: z.array(
              z.object({
                binding: z.string(),
                database_id: z.string().uuid(),
                database_name: z.string().min(1),
              }),
            ),
          })
          .passthrough(),
      ),
    })
    .passthrough()
    .parse(config)
  const bindings =
    parsed.env[environment]?.d1_databases.filter(binding => binding.binding === 'DB') ??
    []
  if (bindings.length !== 1 || bindings[0]!.database_id !== expectedDatabaseId)
    throw new Error('SPLIT_DATABASE_ID_MISMATCH')
  return {
    kind: 'remote',
    environment,
    accountId,
    databaseId: bindings[0]!.database_id,
    databaseName: bindings[0]!.database_name,
  }
}

/** Isolate a remote proxy to the reviewed D1 binding. @param target Checked remote target. @returns Wrangler config with remote D1 explicitly enabled. */
export function splitProxyConfig(
  target: Extract<SplitTarget, { kind: 'remote' }>,
): Record<string, unknown> {
  return {
    name: 'hype-place-split-executor',
    compatibility_date: '2026-10-20',
    account_id: target.accountId,
    d1_databases: [
      {
        binding: 'DB',
        database_name: target.databaseName,
        database_id: target.databaseId,
        remote: true,
      },
    ],
  }
}

/**
 * Execute guarded, per-Feature transactions with a durable receipt after every outcome.
 * @param db Explicit target's primary-session domain database.
 * @param plans Hash-verified manifest; still revalidated against live values by the service.
 * @param save Persist the current run atomically; called before writes and after each step.
 * @returns Complete run; throws a stable error on conflict, SQL failure or receipt failure.
 * @remarks Earlier completed Features remain committed on failure. Resume replays all plans
 * through the service, preserving IDs/history and rejecting later edits. No source error
 * payloads or full SQL parameters are copied to receipts or console output.
 */
export async function executeFeatureSplit(
  db: Database,
  plans: UnresolvedFeatureSplit[],
  save: (run: SplitExecutionRun) => void,
): Promise<SplitExecutionRun> {
  const run: SplitExecutionRun = {
    startedAt: new Date().toISOString(),
    status: 'running',
    outcomes: [],
  }
  save(run)
  for (const plan of plans) {
    try {
      const result = await applyUnresolvedFeatureSplit(
        db,
        plan,
        'migration:existing-feature-split',
      )
      run.outcomes.push({ featureId: plan.featureId, status: result.status })
      if (result.status === 'conflict') {
        run.status = 'conflict'
        run.failedFeatureId = plan.featureId
        save(run)
        throw new Error('SPLIT_CONFLICT')
      }
      save(run)
    } catch {
      if (run.status !== 'conflict') run.status = 'failed'
      run.failedFeatureId = plan.featureId
      save(run)
      throw new Error(
        run.status === 'conflict' ? 'SPLIT_CONFLICT' : 'SPLIT_STEP_FAILED',
      )
    }
  }
  run.status = 'complete'
  run.completedAt = new Date().toISOString()
  save(run)
  return run
}
