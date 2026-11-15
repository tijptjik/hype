// CLOUDFLARE
import { getPlatformProxy } from 'wrangler'
// DRIZZLE
import { drizzle } from 'drizzle-orm/d1'
import { and, eq } from 'drizzle-orm'
// DOMAIN
import { premisesMap, premisesMapCorrection } from '../../src/lib/db/schema/premisesMap'
import {
  readMapBundle,
  saveMapDraft,
  publishMapDraft,
} from '../../src/lib/db/services/premisesMap'
import { prepareCorrectedMap } from '../../src/lib/db/services/premisesMapCorrection'
import { mapHash, mapReleaseKey } from '../../src/lib/indoor/releases'
// TYPES
import type { Database } from '../../src/lib/types'
import type { D1Database, R2Bucket } from '@cloudflare/workers-types'

// TOC: Reviewed corrections | Local-only application
const changes = [
  {
    id: 'tai-po-sports-centre-d0ac2427',
    entity: '471cc6b4-9537-4093-ad7f-ee243a56ebc1',
    original: 'restroom.unisex.wheelchair',
    corrected: 'restroom.accessible',
    reason:
      'User-confirmed classification as Accessible toilet; retain source name and raw category in correction history.',
  },
  {
    id: 'to-kwa-wan-sports-centre-5bcd76ed',
    entity: '5b9ee28b-8143-43b6-b5af-d4d5185c770a',
    original: 'restroom.unisex.wheelchair',
    corrected: 'restroom.accessible',
    reason:
      'User-confirmed classification as Accessible toilet; retain source name and raw category in correction history.',
  },
  {
    id: 'wai-tsuen-sports-centre-25e363e0',
    entity: '713a9901-ee60-46d5-85a1-a2102d28edbc',
    original: 'restroom.unisex.wheelchair',
    corrected: 'restroom.accessible',
    reason:
      'User-confirmed classification as Accessible toilet; retain source name and raw category in correction history.',
  },
  {
    id: 'wo-hing-sports-centre-1e9ab5e8',
    entity: 'c50a19e6-7c53-46c0-9fbe-b6cf629823a7',
    original: 'restroom.unisex.wheelchair',
    corrected: 'restroom.accessible',
    reason:
      'User-confirmed classification as Accessible toilet; retain source name and raw category in correction history.',
  },
  {
    id: 'kwun-tong-mtr',
    entity: '8cab49f4-dc48-4bb4-8d16-91c4233d4acc',
    original: 'unspeciifed',
    corrected: 'corridor',
    reason:
      'User-reviewed correction: source name Corridor; replace misspelled unspecified category with corridor.',
  },
  {
    id: 'hung-hom-mtr',
    entity: 'EF29CD20-3A03-4C8F-8466-ED7C4BFCD011',
    original: 'Platform',
    corrected: 'platform',
    reason:
      'User-reviewed correction: normalize source platform category capitalization.',
  },
]
const apply = process.argv.includes('--apply')
const proxy = await getPlatformProxy<{ DB: D1Database; ASSET_RAW_DEV: R2Bucket }>({
  configPath: './wrangler.local.toml',
  remoteBindings: false,
})
try {
  const db = drizzle(proxy.env.DB) as Database
  const bucket = proxy.env.ASSET_RAW_DEV
  for (const change of changes) {
    const map = await db
      .select()
      .from(premisesMap)
      .where(eq(premisesMap.id, change.id))
      .get()
    if (process.argv.includes('--export')) {
      if (!map?.publishedHash) throw new Error('Missing published map')
      const current = await readMapBundle(bucket, change.id, map.publishedHash)
      const rows = await db
        .select()
        .from(premisesMapCorrection)
        .where(eq(premisesMapCorrection.mapId, change.id))
      const hashes = new Set([
        map.publishedHash,
        current.data.sourceSnapshotHash,
        ...rows.map(row => row.sourceSnapshotHash),
      ])
      for (const hash of hashes) {
        if (!hash) continue
        const key = mapReleaseKey(change.id, hash)
        const object = await bucket.get(key)
        if (!object) throw new Error(`Missing ${key}`)
        await Bun.write(`/tmp/hype-symbol-releases/${key}`, await object.arrayBuffer())
      }
      console.log('Exported reviewed release and retained sources', change.id)
      continue
    }
    if (process.argv.includes('--status')) {
      console.log(change.id, {
        draft: map?.draftHash,
        published: map?.publishedHash,
        draftVersion: map?.draftVersion,
        publishedVersion: map?.publishedVersion,
      })
      console.log(
        await db
          .select()
          .from(premisesMapCorrection)
          .where(
            and(
              eq(premisesMapCorrection.mapId, change.id),
              eq(premisesMapCorrection.sourceEntityId, change.entity),
            ),
          ),
      )
      continue
    }
    if (!map?.publishedHash || map.draftHash !== map.publishedHash)
      throw new Error(`Unpublished work or missing map: ${change.id}`)
    const current = await readMapBundle(bucket, change.id, map.publishedHash)
    if (
      current.data.amenity_point.features.some(
        f =>
          f.properties.amenity_id === change.entity &&
          f.properties.amenity_category === change.corrected,
      )
    ) {
      console.log('Already corrected', change.id)
      continue
    }
    const source = current.data.sourceSnapshotHash
      ? await readMapBundle(bucket, change.id, current.data.sourceSnapshotHash)
      : structuredClone(current)
    source.data.sourceDataset ??= map.kind === 'station' ? 'landsd-mtr' : map.id
    const target = source.data.amenity_point.features.find(
      f => f.properties.amenity_id === change.entity,
    )
    if (target?.properties.amenity_category !== change.original)
      throw new Error(`Source changed: ${change.id}`)
    console.log(
      change.id,
      change.original,
      '→',
      change.corrected,
      apply ? 'applying locally' : 'preview',
    )
    if (!apply) continue
    const sourceText = JSON.stringify(source)
    const sourceSnapshotHash = await mapHash(sourceText)
    await bucket.put(mapReleaseKey(change.id, sourceSnapshotHash), sourceText)
    const correction = {
      mapId: change.id,
      sourceDataset: source.data.sourceDataset,
      sourceLayer: 'amenity_point',
      sourceEntityId: change.entity,
      field: 'amenity_category',
      originalValue: change.original,
      correctedValue: change.corrected,
      sourceSnapshotHash,
      reason: change.reason,
      authorUserId: 'hype-local-agent-admin',
    }
    const existing = await db
      .select()
      .from(premisesMapCorrection)
      .where(
        and(
          eq(premisesMapCorrection.mapId, change.id),
          eq(premisesMapCorrection.sourceDataset, source.data.sourceDataset),
        ),
      )
    if (
      existing.some(
        c => c.sourceEntityId === change.entity && c.field === correction.field,
      )
    )
      throw new Error('Correction already exists; review before replacing')
    const bundle = await prepareCorrectedMap(db, bucket, {
      id: change.id,
      sourceDataset: source.data.sourceDataset,
      bundle: source,
      corrections: [...existing, correction],
    })
    if (!existing.some(c => c.sourceLayer === 'connection'))
      bundle.data.connections = current.data.connections
    const draft = await saveMapDraft(db, bucket, {
      id: change.id,
      expectedVersion: map.draftVersion,
      bundle,
      actorId: correction.authorUserId,
      correctionWrites: [db.insert(premisesMapCorrection).values(correction)],
    })
    await publishMapDraft(db, bucket, {
      id: change.id,
      hash: draft.hash,
      expectedDraftVersion: draft.version,
      expectedPublishedVersion: map.publishedVersion,
      actorId: correction.authorUserId,
    })
    console.log('Published local correction', change.id)
  }
} finally {
  await proxy.dispose()
}
