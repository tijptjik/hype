// NODE
import { resolve } from 'node:path'
// CLOUDFLARE
import { getPlatformProxy } from 'wrangler'
// DRIZZLE
import { drizzle } from 'drizzle-orm/d1'
import { eq, sql } from 'drizzle-orm'
// DOMAIN
import { saveMapDraft, publishMapDraft } from '../../src/lib/db/services/premisesMap'
import { retryBusyRead } from '../../src/lib/db/services/sqlite'
import { premisesMap, premisesMapUnit } from '../../src/lib/db/schema/premisesMap'
import { validateMapBundle, mapIdSchema } from '../../src/lib/indoor/releases'
// TYPES
import type { Database } from '../../src/lib/types'
import type { D1Database, R2Bucket } from '@cloudflare/workers-types'

// TOC: Explicit local migration input | Complete bundle upload | Stable unit binding
// Input is an ignored research export, never a bundled list of map identities.
const args = process.argv.slice(2),
  apply = args.includes('--apply'),
  refreshImport = args.includes('--refresh-import'),
  input = args.find(a => !a.startsWith('--'))
if (
  !input ||
  args.some(a => a.startsWith('--') && !['--apply', '--refresh-import'].includes(a))
)
  throw new Error(
    'Usage: dev-check bun scripts/indoor/import-map-releases.ts INPUT_INDEX [--apply] (local only)',
  )
const entries: {
  id: string
  code: string
  name: string
  nameZh: string
  kind: 'station' | 'building'
  sourceDirectory: string
  bundle: string
}[] = await Bun.file(input).json()
const proxy = await getPlatformProxy<{
  DB: D1Database
  ASSET_RAW_DEV: R2Bucket
}>({ configPath: './wrangler.local.toml', remoteBindings: false })
try {
  const db = drizzle(proxy.env.DB) as Database
  const bindings = await retryBusyRead(() =>
    db.all<{ locationId: string; sourceKey: string }>(
      sql`SELECT locationId,sourceKey FROM locationCanonicalDraft WHERE sourceKey LIKE 'landsd-%-unit:%'`,
    ),
  )
  for (const entry of entries) {
    mapIdSchema.parse(entry.id)
    const bundle = await Bun.file(entry.bundle).json()
    // Preserve schematic originals inside the immutable R2 bundle, not application assets.
    for (const level of bundle.data.level_polygon.features) {
      const path = level.properties.image_path
      if (path) {
        const root = resolve(entry.sourceDirectory),
          file = resolve(root, path)
        if (!file.startsWith(`${root}/`)) throw new Error('Invalid source artwork path')
        const bytes = await Bun.file(file).arrayBuffer()
        level.properties.image_url = `data:${path.endsWith('.png') ? 'image/png' : 'image/jpeg'};base64,${Buffer.from(bytes).toString('base64')}`
        delete level.properties.image_path
      }
    }
    validateMapBundle(bundle)
    if (!apply) {
      console.log(
        JSON.stringify({
          map: entry.id,
          units: bundle.data.unit_polygon.features.length,
          connections: bundle.data.connections.length,
        }),
      )
      continue
    }
    await db
      .insert(premisesMap)
      .values({
        id: entry.id,
        code: entry.code,
        name: entry.name,
        nameZh: entry.nameZh,
        kind: entry.kind,
        updatedBy: 'local-map-import',
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoNothing()
    const current = await db
      .select()
      .from(premisesMap)
      .where(eq(premisesMap.id, entry.id))
      .get()
    if (!current) throw new Error('Missing map')
    if (current.publishedHash && !refreshImport) {
      console.log(
        `${entry.id}: already published; use the editor for subsequent revisions`,
      )
      continue
    }
    if (refreshImport && current.updatedBy !== 'local-map-import')
      throw new Error('Cannot overwrite an edited map through migration')
    // Associate only exact canonical source identities; imports never guess occupancy or brands.
    for (const unit of bundle.data.unit_polygon.features) {
      const sourceId = String(unit.properties.unit_id)
      const matches = bindings.filter(
        row =>
          row.sourceKey === `landsd-mtr-unit:${sourceId}` ||
          row.sourceKey === `landsd-building-unit:${sourceId}`,
      )
      if (matches.length === 1)
        await db
          .insert(premisesMapUnit)
          .values({
            mapId: entry.id,
            unitId: sourceId,
            locationId: matches[0].locationId,
          })
          .onConflictDoNothing()
    }
    const draft = await saveMapDraft(db, proxy.env.ASSET_RAW_DEV, {
      id: entry.id,
      expectedVersion: current.draftVersion,
      bundle,
      actorId: 'local-map-import',
    })
    await publishMapDraft(db, proxy.env.ASSET_RAW_DEV, {
      id: entry.id,
      hash: draft.hash,
      expectedDraftVersion: draft.version,
      expectedPublishedVersion: current.publishedVersion,
      actorId: 'local-map-import',
    })
    console.log(JSON.stringify({ map: entry.id, hash: draft.hash, published: true }))
  }
} finally {
  await proxy.dispose()
}
