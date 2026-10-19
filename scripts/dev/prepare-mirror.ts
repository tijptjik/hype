// CLOUDFLARE
import { getPlatformProxy } from 'wrangler'
// LOCAL DEVELOPMENT
import { getDevPersona } from './config'
import { seedDevPersonas } from './seed'
import { prepareLocalDivisions } from './prepare-divisions'
// TYPES
import type { D1Database } from '@cloudflare/workers-types'

/**
 * Checks mirrored spatial data and prepares divisions and reserved agent users.
 * @returns Nothing after spatial validation, division preparation and persona initialization.
 * @remarks Uses only the default local mirror. Missing cells must fail the post-command
 * rather than silently leave a map with incomplete results. Spatial backfills are
 * explicit one-off repairs; ordinary feature writes maintain their own indexes.
 */
export async function prepareLocalMirror(): Promise<void> {
  if (process.env.HYPE_DEV_STATE)
    throw new Error('Mirror preparation uses default local D1; unset HYPE_DEV_STATE')
  getDevPersona({
    ...process.env,
    HYPE_DEV_PERSONA: 'admin',
    HYPE_LOCAL_R2: '1',
  })

  // Production mirrors already include H3 cells; validate instead of rebuilding.
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
        `Spatial backfill incomplete: ${pending?.count ?? 'unknown'} point features remain; inspect invalid geometry and run feature:spatial:backfill --require-complete explicitly`,
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
