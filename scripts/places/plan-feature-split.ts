// NODE
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
// DATABASE
import { getPlatformProxy } from 'wrangler'
import { drizzle } from 'drizzle-orm/d1'
import { featurePlace, place } from '../../src/lib/db/schema/place'
import { planUnresolvedFeatureSplit } from '../../src/lib/places/migrationPlan'
import { feature } from '../../src/lib/db/schema/feature'
import { readFeaturePlaceBaseline } from '../../src/lib/db/services/placeBaseline'
// TYPES
import type { Database } from '../../src/lib/types'
import type { D1Database } from '@cloudflare/workers-types'

/**
 * Plan unresolved splits for all eligible unlinked Features in the fresh local mirror.
 * @returns A private reproducible manifest of preserved facts, overrides, and exclusions.
 * @remarks Read-only domain queries; no remote database or association mutations.
 */
async function main(): Promise<void> {
  const [output] = process.argv.slice(2)
  if (!output) throw new Error('Usage: plan-feature-split.ts private-output.json')
  if (process.env.HYPE_DEV_STATE)
    throw new Error('Use the default remirrored local database')
  process.umask(0o077)
  const platform = await getPlatformProxy<{ DB: D1Database }>({
    configPath: './wrangler.local.toml',
    remoteBindings: false,
  })
  try {
    const db = drizzle(platform.env.DB) as Database
    const rows = await db
      .select({ id: feature.id, projectId: feature.projectId })
      .from(feature)
      .orderBy(feature.id)
    const counts: Record<string, number> = {}
    const plans = []
    const exclusions = []
    const existing = new Set(
      (await db.select({ id: featurePlace.featureId }).from(featurePlace)).map(
        row => row.id,
      ),
    )
    const placeIds = new Set(
      (await db.select({ id: place.id }).from(place)).map(row => row.id),
    )
    // Every Feature receives a proposal or explicit exclusion; no identity is guessed.
    for (const row of rows) {
      if (existing.has(row.id)) {
        counts['already-linked'] = (counts['already-linked'] ?? 0) + 1
        exclusions.push({ featureId: row.id, reason: 'already-linked' })
        continue
      }
      const baseline = await readFeaturePlaceBaseline(db, row.id, row.projectId)
      const result =
        baseline.status === 'ready'
          ? planUnresolvedFeatureSplit(baseline.baseline)
          : { status: baseline.status, reason: baseline.reason }
      if ('plan' in result) {
        if (placeIds.has(result.plan.placeId))
          throw new Error('Migration Place identity collision')
        plans.push(result.plan)
        counts.planned = (counts.planned ?? 0) + 1
      } else {
        counts[result.reason] = (counts[result.reason] ?? 0) + 1
        exclusions.push({ featureId: row.id, reason: result.reason })
      }
    }
    mkdirSync(dirname(output), { recursive: true })
    writeFileSync(
      output,
      JSON.stringify(
        {
          version: 1,
          strategy: 'unresolved-with-preserved-values',
          total: rows.length,
          counts,
          plans,
          exclusions,
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    )
    console.log(JSON.stringify({ total: rows.length, counts }))
  } finally {
    await platform.dispose()
  }
}
await main()
