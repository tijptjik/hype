// CLOUDFLARE
import { getPlatformProxy } from 'wrangler'
// LOCAL DEVELOPMENT
import { getDevPersona } from './config'
import { seedDevPersonas } from './seed'
import { prepareLocalDivisions } from './prepare-divisions'
import {
  parseFeatureSpatialBackfillOptions,
  runFeatureSpatialBackfill,
} from '../backfill-feature-spatial-index'
// TYPES
import type { D1Database } from '@cloudflare/workers-types'

/**
 * Restores local spatial/division data and reserved agent users after a production mirror.
 * @returns Nothing after both backfills and both development personas are ready.
 * @remarks Uses only the default local mirror. Missing cells must fail the post-command
 * rather than silently leave a map with incomplete results. Remove the temporary
 * backfill step once production mirrors reliably include populated spatial indexes.
 */
export async function prepareLocalMirror(): Promise<void> {
  if (process.env.HYPE_DEV_STATE)
    throw new Error('Mirror preparation uses default local D1; unset HYPE_DEV_STATE')
  getDevPersona({
    ...process.env,
    HYPE_DEV_PERSONA: 'admin',
    HYPE_LOCAL_R2: '1',
  })

  // Reuse the resumable, geometry-guarded backfill until production includes H3 cells.
  await runFeatureSpatialBackfill(
    parseFeatureSpatialBackfillOptions([
      '--batch-size',
      '100',
      '--max-batches',
      '1000',
    ]),
  )
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: './wrangler.local.toml',
    remoteBindings: false,
  })
  try {
    const pending = await proxy.env.DB
      .prepare(
        "SELECT count(*) AS count FROM feature WHERE spatialIndex IS NULL AND json_extract(geometry, '$.type') = 'Point'",
      )
      .first<{ count: number }>()
    if (!pending || pending.count > 0)
      throw new Error(
        `Spatial backfill incomplete: ${pending?.count ?? 'unknown'} point features remain; inspect invalid geometry or rerun db:mirror:post:local`,
      )
    await seedDevPersonas(proxy.env.DB)
    await prepareLocalDivisions(proxy.env.DB)
    console.info(
      'Local mirror ready: spatial cells and divisions populated; both agent users initialized.',
    )
  } finally {
    await proxy.dispose()
  }
}

if (import.meta.main) await prepareLocalMirror()
