// TESTS
import { afterAll, beforeAll, expect, test } from 'bun:test'
// NODE
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
// DRIZZLE
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
// DOMAIN
import type { IndoorData } from '../../../src/lib/indoor/model'
import type { MapBundle } from '../../../src/lib/indoor/releases'
import {
  premisesMap,
  premisesMapCorrection,
} from '../../../src/lib/db/schema/premisesMap'
import { systemTask } from '../../../src/lib/db/schema/systemTask'
import {
  readMapBundle,
  saveMapDraft,
  publishMapDraft,
} from '../../../src/lib/db/services/premisesMap'
import { prepareCorrectedMap } from '../../../src/lib/db/services/premisesMapCorrection'
import { contentHash, sha256 } from './content'
import { fetchLayer, pageTotal, type Snapshot } from './fetch'
import { compareSnapshot, publishSnapshot, readSnapshot } from './refresh'
import { parseTarget } from './cli'
// TYPES
import type { Database } from '../../../src/lib/types'
import type { R2Bucket } from '@cloudflare/workers-types'

const { Miniflare, convertV4MiniflareOptions } = createRequire(
  import.meta.resolve('wrangler/package.json'),
)('miniflare')
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: 'export default {fetch(){return new Response("ok")}}',
    compatibilityDate: '2026-11-01',
    d1Databases: ['DB'],
    r2Buckets: ['MAPS'],
  }),
)
let db: Database, bucket: R2Bucket, root: string
const venue = '11111111-1111-4111-8111-111111111111'
const id = 'test-building-11111111'
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'indoor-refresh-test-'))
  const binding = await mf.getD1Database('DB')
  await binding.exec('CREATE TABLE location(id TEXT PRIMARY KEY);')
  await binding.exec('CREATE TABLE user(id TEXT PRIMARY KEY);')
  await binding.exec("INSERT INTO user VALUES ('reviewer');")
  for (const file of [
    '0255_premises_map_releases.sql',
    '0256_premises_map_draft_history.sql',
    '0257_premises_map_correction.sql',
    '0258_system_task.sql',
  ])
    for (const statement of readFileSync(`migrations/${file}`, 'utf8')
      .replace(/^--.*$/gm, '')
      .split(';')
      .filter(s => s.trim()))
      await binding.prepare(statement).run()
  db = drizzle(binding) as Database
  bucket = (await mf.getR2Bucket('MAPS')) as R2Bucket
})
afterAll(async () => {
  await mf.dispose()
  await rm(root, { recursive: true, force: true })
})

/** Minimal valid upstream building. @returns Source bundle. */
function source(): MapBundle {
  const geometry = {
    type: 'Polygon' as const,
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ],
  }
  const data = {
    venue_polygon: { type: 'FeatureCollection', features: [] },
    level_polygon: { type: 'FeatureCollection', features: [] },
    unit_polygon: { type: 'FeatureCollection', features: [] },
    opening_line: { type: 'FeatureCollection', features: [] },
    amenity_point: { type: 'FeatureCollection', features: [] },
    occupant_point: { type: 'FeatureCollection', features: [] },
    retrievedAt: '2026-01-01',
    connections: [],
    sourceDataset: 'landsd-building',
  } as IndoorData
  data.venue_polygon.features.push({
    type: 'Feature',
    properties: { venue_id: venue, venue_name_en: 'Test Building', venue_name_zh: '' },
    geometry,
  })
  data.level_polygon.features.push({
    type: 'Feature',
    properties: { venue_id: venue, level_id: 'floor', level_name_en: 'Ground floor' },
    geometry,
  })
  return { schemaVersion: 1, documents: [], data }
}

/** Save a test snapshot with independently retained hashes. @param bundle Source bundle. @returns Directory. */
async function snapshot(bundle: MapBundle): Promise<string> {
  const sourceVenue = String(bundle.data.venue_polygon.features[0].properties.venue_id)
  const directory = await mkdtemp(join(root, 'snapshot-'))
  const text = JSON.stringify(bundle)
  await Bun.write(join(directory, 'bundle.json.gz'), gzipSync(text))
  const manifest: Snapshot = {
    schemaVersion: 1,
    target: 'local',
    dataset: 'buildings',
    fetchedAt: new Date().toISOString(),
    inventoryIds: [sourceVenue],
    entries: [
      {
        venueId: sourceVenue,
        bundle: 'bundle.json.gz',
        hash: sha256(text),
        contentHash: contentHash(bundle),
      },
    ],
  }
  await Bun.write(join(directory, 'snapshot.json'), JSON.stringify(manifest))
  return directory
}

test('content hashing ignores transport metadata but detects exact geometry and attributes', () => {
  const a = source(),
    b = structuredClone(a)
  b.data.retrievedAt = '2026-02-01'
  b.data.venue_polygon.features[0].id = 'changed-transport-id'
  b.data.venue_polygon.features[0].properties.bbox = [1, 2, 3, 4]
  expect(contentHash(a)).toBe(contentHash(b))
  b.data.level_polygon.features[0].properties.level_name_en = 'Mezzanine'
  expect(contentHash(a)).not.toBe(contentHash(b))
  const c = structuredClone(a)
  if (c.data.level_polygon.features[0].geometry.type === 'Polygon')
    c.data.level_polygon.features[0].geometry.coordinates[0][1][0] += 0.000000001
  expect(contentHash(a)).not.toBe(contentHash(c))
})

test('pagination accepts remaining totals and rejects duplicates and incomplete pages', async () => {
  expect(pageTotal(3, 2, 1)).toBe(3)
  expect(() => pageTotal(3, 2, 5)).toThrow()
  let calls = 0
  const request = async () =>
    new Response(
      JSON.stringify({
        type: 'FeatureCollection',
        totalFeatures: calls++ ? 1 : 3,
        features:
          calls === 1
            ? [{ properties: { venue_id: 'a' } }, { properties: { venue_id: 'b' } }]
            : [{ properties: { venue_id: 'c' } }],
      }),
    )
  expect(
    await fetchLayer('buildings', 'venue_polygon', [], async () => {}, request),
  ).toHaveLength(3)
  const duplicate = async () =>
    new Response(
      JSON.stringify({
        type: 'FeatureCollection',
        totalFeatures: 2,
        features: [
          { properties: { venue_id: 'a' } },
          { properties: { venue_id: 'a' } },
        ],
      }),
    )
  await expect(
    fetchLayer('buildings', 'venue_polygon', [], async () => {}, duplicate),
  ).rejects.toThrow('duplicate')
  const truncated = async () =>
    new Response(
      JSON.stringify({ type: 'FeatureCollection', totalFeatures: 2, features: [] }),
    )
  await expect(
    fetchLayer('buildings', 'venue_polygon', [], async () => {}, truncated),
  ).rejects.toThrow('Truncated')
})

test('targets are mandatory and cross-target snapshots are rejected', async () => {
  expect(() => parseTarget(undefined)).toThrow()
  expect(() => parseTarget('production')).toThrow()
  expect(parseTarget('prod')).toBe('prod')
  await expect(readSnapshot(await snapshot(source()), 'prod')).rejects.toThrow(
    'target mismatch',
  )
})

test('new and changed source publishes once, replays corrections and creates atomic review tasks', async () => {
  const original = source(),
    first = await snapshot(original)
  expect((await compareSnapshot(db, bucket, first, 'local'))[0].status).toBe('new')
  await publishSnapshot(db, bucket, first, 'local')
  const initial = await db
    .select()
    .from(premisesMap)
    .where(eq(premisesMap.id, id))
    .get()
  expect(initial?.publishedVersion).toBe(1)
  expect(await db.select().from(systemTask)).toHaveLength(1)
  const same = structuredClone(original)
  same.data.retrievedAt = '2026-02-01'
  expect(
    (await publishSnapshot(db, bucket, await snapshot(same), 'local'))[0].status,
  ).toBe('unchanged')
  expect(await db.select().from(systemTask)).toHaveLength(1)
  if (!initial?.publishedHash) throw new Error('Missing publication')
  const published = await readMapBundle(bucket, id, initial.publishedHash)
  await db.insert(premisesMapCorrection).values({
    mapId: id,
    sourceDataset: 'landsd-building',
    sourceLayer: 'level_polygon',
    sourceEntityId: 'floor',
    field: 'level_name_en',
    originalValue: 'Ground floor',
    correctedValue: 'Entrance landing',
    sourceSnapshotHash: String(published.data.sourceSnapshotHash),
    reason: 'Actual access landing',
    authorUserId: 'reviewer',
  })
  // First materialize the curated label, as the editor would, before upstream changes elsewhere.
  published.data.level_polygon.features[0].properties.level_name_en = 'Entrance landing'
  const curated = await saveMapDraft(db, bucket, {
    id,
    expectedVersion: initial.draftVersion,
    bundle: published,
    actorId: 'reviewer',
  })
  await publishMapDraft(db, bucket, {
    id,
    hash: curated.hash,
    expectedDraftVersion: curated.version,
    expectedPublishedVersion: 1,
    actorId: 'reviewer',
  })
  const changed = structuredClone(same)
  changed.data.venue_polygon.features[0].properties.venue_phone = '123'
  const changedDir = await snapshot(changed)
  expect((await publishSnapshot(db, bucket, changedDir, 'local'))[0].status).toBe(
    'changed',
  )
  const current = await db
    .select()
    .from(premisesMap)
    .where(eq(premisesMap.id, id))
    .get()
  if (!current?.publishedHash) throw new Error('Missing publication')
  const latest = await readMapBundle(bucket, id, current.publishedHash)
  expect(latest.data.level_polygon.features[0].properties.level_name_en).toBe(
    'Entrance landing',
  )
  expect(
    await db
      .select()
      .from(systemTask)
      .where(eq(systemTask.type, 'map-upstream-published')),
  ).toHaveLength(2)
  await expect(
    publishMapDraft(db, bucket, {
      id,
      hash: current.publishedHash,
      expectedDraftVersion: current.draftVersion,
      expectedPublishedVersion: 0,
      actorId: 'stale',
      upstreamReview: { sourceSnapshotHash: 'stale', name: 'Stale' },
    }),
  ).rejects.toThrow()
  expect(
    await db
      .select()
      .from(systemTask)
      .where(eq(systemTask.type, 'map-upstream-published')),
  ).toHaveLength(2)
  await saveMapDraft(db, bucket, {
    id,
    expectedVersion: current.draftVersion,
    bundle: latest,
    actorId: 'reviewer',
  })
  changed.data.venue_polygon.features[0].properties.venue_phone = '456'
  // A draft with a different hash is protected even if upstream changes again.
  latest.data.level_polygon.features[0].properties.level_name_en = 'Unpublished edit'
  const draftRow = await db
    .select()
    .from(premisesMap)
    .where(eq(premisesMap.id, id))
    .get()
  if (!draftRow) throw new Error('Missing draft')
  await saveMapDraft(db, bucket, {
    id,
    expectedVersion: draftRow.draftVersion,
    bundle: latest,
    actorId: 'reviewer',
  })
  expect(
    (await publishSnapshot(db, bucket, await snapshot(changed), 'local'))[0].status,
  ).toBe('blocked')
  expect(
    (await db.select().from(premisesMap).where(eq(premisesMap.id, id)).get())
      ?.publishedHash,
  ).toBe(current.publishedHash)
})

test('feature ordering and property key ordering do not create false updates', () => {
  const a = source()
  a.data.amenity_point.features = ['a', 'b'].map(amenity_id => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [1, 2] },
    properties: { amenity_id, level_id: 'floor' },
  }))
  const b = structuredClone(a)
  b.data.amenity_point.features.reverse()
  b.data.amenity_point.features[0].properties = { level_id: 'floor', amenity_id: 'b' }
  expect(contentHash(a)).toBe(contentHash(b))
})

test('missing source baselines are review blockers rather than guessed matches', async () => {
  const raw = source()
  const legacyId = 'legacy-building'
  // The same source UUID must never be claimed by two publications.
  raw.data.venue_polygon.features[0].properties.venue_id =
    '22222222-2222-4222-8222-222222222222'
  raw.data.level_polygon.features[0].properties.venue_id =
    raw.data.venue_polygon.features[0].properties.venue_id
  await db.insert(premisesMap).values({
    id: legacyId,
    code: 'LEGACY',
    name: 'Legacy',
    nameZh: '',
    kind: 'building',
    updatedBy: 'reviewer',
    updatedAt: '2026-01-01',
  })
  const draft = await saveMapDraft(db, bucket, {
    id: legacyId,
    expectedVersion: 0,
    bundle: raw,
    actorId: 'reviewer',
  })
  await publishMapDraft(db, bucket, {
    id: legacyId,
    hash: draft.hash,
    expectedDraftVersion: draft.version,
    expectedPublishedVersion: 0,
    actorId: 'reviewer',
  })
  const directory = await snapshot(raw)
  const manifest = await Bun.file(join(directory, 'snapshot.json')).json()
  manifest.inventoryIds = [raw.data.venue_polygon.features[0].properties.venue_id]
  manifest.entries[0].venueId = manifest.inventoryIds[0]
  await Bun.write(join(directory, 'snapshot.json'), JSON.stringify(manifest))
  const report = await compareSnapshot(db, bucket, directory, 'local')
  expect(report.find(row => row.mapId === legacyId)?.status).toBe('blocked')
  expect(report.find(row => row.mapId === id)?.status).toBe('missing')
})

test('interrupted importer drafts resume only for the identical source content', async () => {
  const raw = source(),
    resumedId = 'resumable-building-33333333'
  raw.data.venue_polygon.features[0].properties.venue_id =
    '33333333-3333-4333-8333-333333333333'
  raw.data.level_polygon.features[0].properties.venue_id =
    raw.data.venue_polygon.features[0].properties.venue_id
  raw.data.venue_polygon.features[0].properties.venue_name_en = 'Resumable Building'
  await db.insert(premisesMap).values({
    id: resumedId,
    code: 'BLDG-33333333-3333-4333-8333-333333333333',
    name: 'Resumable Building',
    nameZh: '',
    kind: 'building',
    updatedBy: 'indoor-dataops',
    updatedAt: '2026-01-01',
  })
  const corrected = await prepareCorrectedMap(db, bucket, {
    id: resumedId,
    sourceDataset: 'landsd-building',
    bundle: raw,
  })
  const saved = await saveMapDraft(db, bucket, {
    id: resumedId,
    expectedVersion: 0,
    bundle: corrected,
    actorId: 'indoor-dataops',
  })
  const report = await publishSnapshot(db, bucket, await snapshot(raw), 'local')
  expect(report.find(row => row.mapId === resumedId)?.publishedReleaseHash).toBe(
    saved.hash,
  )
  expect(
    (await db.select().from(premisesMap).where(eq(premisesMap.id, resumedId)).get())
      ?.publishedVersion,
  ).toBe(1)
  expect(
    await db.select().from(systemTask).where(eq(systemTask.resourceId, resumedId)),
  ).toHaveLength(1)
  const changed = structuredClone(raw)
  changed.data.venue_polygon.features[0].properties.venue_phone = '123'
  const next = await prepareCorrectedMap(db, bucket, {
    id: resumedId,
    sourceDataset: 'landsd-building',
    bundle: changed,
  })
  await saveMapDraft(db, bucket, {
    id: resumedId,
    expectedVersion: saved.version,
    bundle: next,
    actorId: 'indoor-dataops',
  })
  changed.data.venue_polygon.features[0].properties.venue_phone = '456'
  expect(
    (await compareSnapshot(db, bucket, await snapshot(changed), 'local')).find(
      row => row.mapId === resumedId,
    )?.status,
  ).toBe('blocked')
})
