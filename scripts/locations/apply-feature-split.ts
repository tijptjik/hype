// NODE
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
// DATABASE
import { getPlatformProxy } from 'wrangler'
import { drizzle } from 'drizzle-orm/d1'
// DOMAIN
import { applyUnresolvedFeatureSplit } from '../../src/lib/db/services/locationSplit'
// TYPES
import type { Database } from '../../src/lib/types'
import type { D1Database } from '@cloudflare/workers-types'
import type { UnresolvedFeatureSplit } from '../../src/lib/locations/migrationPlan'

/**
 * Apply a private split manifest to isolated state or explicitly selected primary LOCAL state.
 * @returns Count-only output and a private outcome receipt; stops on the first conflict.
 * @remarks Each Feature is atomic and replayable. Remote bindings are always disabled.
 * The --primary-local target requires an existing default state and a prior backup;
 * otherwise prepare an isolated copy of the fresh mirror before invoking this CLI.
 * A manifest is revalidated against live persisted values by the application service.
 */
async function main(): Promise<void> {
  const [manifestPath, statePath, receiptPath] = process.argv.slice(2)
  if (!manifestPath || !statePath || !receiptPath)
    throw new Error(
      'Usage: apply-feature-split.ts manifest.json <isolated-state|--primary-local> receipt.json',
    )
  const primaryLocal = statePath === '--primary-local'
  if (primaryLocal && process.env.HYPE_DEV_STATE)
    throw new Error('Primary local application cannot use HYPE_DEV_STATE')
  const state = realpathSync(primaryLocal ? '.wrangler/state/v3' : statePath)
  const root = realpathSync('.local/places')
  if (!primaryLocal && (!state.startsWith(root + sep) || !state.endsWith('-state')))
    throw new Error(
      'Split rehearsal requires an isolated .local/places/*-state directory',
    )
  const document = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (
    document.version !== 1 ||
    document.strategy !== 'unresolved-with-preserved-values' ||
    !Array.isArray(document.plans)
  )
    throw new Error('Unsupported split manifest')
  const plans = document.plans as UnresolvedFeatureSplit[]
  if (new Set(plans.map(plan => plan.featureId)).size !== plans.length)
    throw new Error('Duplicate Feature in split manifest')
  process.umask(0o077)
  const platform = await getPlatformProxy<{ DB: D1Database }>({
    configPath: './wrangler.local.toml',
    remoteBindings: false,
    persist: { path: state },
  })
  const counts: Record<string, number> = {}
  const outcomes: Array<{ featureId: string; status: string }> = []
  try {
    const db = drizzle(platform.env.DB) as Database
    for (const plan of plans) {
      const result = await applyUnresolvedFeatureSplit(
        db,
        plan,
        'migration:existing-feature-split',
      )
      counts[result.status] = (counts[result.status] ?? 0) + 1
      outcomes.push({ featureId: plan.featureId, status: result.status })
      if (result.status === 'conflict')
        throw new Error('Split conflict; inspect private receipt')
    }
    console.log(JSON.stringify({ total: plans.length, counts }))
  } finally {
    try {
      writeFileSync(
        resolve(receiptPath),
        JSON.stringify({ version: 1, total: plans.length, counts, outcomes }, null, 2) +
          '\n',
        { mode: 0o600 },
      )
    } finally {
      await platform.dispose()
    }
  }
}
await main()
