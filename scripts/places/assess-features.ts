// NODE
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
// DATABASE
import { getPlatformProxy } from 'wrangler'
import { drizzle } from 'drizzle-orm/d1'
import { feature } from '../../src/lib/db/schema/feature'
import { readFeaturePlaceBaseline } from '../../src/lib/db/services/placeBaseline'
// TYPES
import type { Database } from '../../src/lib/types'
import type { D1Database } from '@cloudflare/workers-types'

/**
 * Assess all local Feature baselines before attempting a Place split.
 * @returns A private report with identities and explicit review/exclusion reasons.
 * @remarks Read-only domain queries; no remote database or association mutations.
 */
async function main(): Promise<void> {
  const [output] = process.argv.slice(2)
  if (!output) throw new Error('Usage: assess-features.ts private-output.json')
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
    const results = []
    // Report every Feature once; no candidate identity is inferred from readiness.
    for (const row of rows) {
      const result = await readFeaturePlaceBaseline(db, row.id, row.projectId)
      const reason = result.status === 'ready' ? 'ready' : result.reason
      counts[reason] = (counts[reason] ?? 0) + 1
      results.push({
        featureId: row.id,
        projectId: row.projectId,
        status: result.status,
        reason,
      })
    }
    mkdirSync(dirname(output), { recursive: true })
    writeFileSync(
      output,
      JSON.stringify({ version: 1, total: rows.length, counts, results }, null, 2) +
        '\n',
      { mode: 0o600 },
    )
    console.log(JSON.stringify({ total: rows.length, counts }))
  } finally {
    await platform.dispose()
  }
}
await main()
