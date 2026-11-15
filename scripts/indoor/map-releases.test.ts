// TESTS
import { afterAll, beforeAll, expect, test } from 'bun:test'
// NODE
import { readFileSync } from 'node:fs'
// CLOUDFLARE
import { Miniflare } from 'miniflare'
// DRIZZLE
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
// DOMAIN
import { premisesMap } from '../../src/lib/db/schema/premisesMap'
import {
  saveMapDraft,
  publishMapDraft,
  publishedMapRelease,
  readMapBundle,
} from '../../src/lib/db/services/premisesMap'
import { layerNames, type IndoorData } from '../../src/lib/indoor/model'
import { mapReleaseKey, type MapBundle } from '../../src/lib/indoor/releases'
// TYPES
import type { Database } from '../../src/lib/types'
import type { R2Bucket } from '@cloudflare/workers-types'
const mf = new Miniflare({
  modules: true,
  script: 'export default {fetch(){return new Response("ok")}}',
  compatibilityDate: '2026-01-01',
  d1Databases: ['DB'],
  r2Buckets: ['MAPS'],
})
let db: Database, bucket: R2Bucket
beforeAll(async () => {
  const binding = await mf.getD1Database('DB')
  await binding.exec('CREATE TABLE location(id TEXT PRIMARY KEY);')
  for (const file of [
    '0255_premises_map_releases.sql',
    '0256_premises_map_draft_history.sql',
  ])
    for (const statement of readFileSync(`migrations/${file}`, 'utf8')
      .split(';')
      .filter(s => s.trim()))
      await binding.prepare(statement).run()
  db = drizzle(binding) as unknown as Database
  bucket = (await mf.getR2Bucket('MAPS')) as unknown as R2Bucket
})
afterAll(() => mf.dispose())
function bundle(): MapBundle {
  const polygon = {
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
    retrievedAt: '2026-01-01',
    connections: [],
    ...Object.fromEntries(
      layerNames.map(n => [n, { type: 'FeatureCollection', features: [] }]),
    ),
  } as IndoorData
  data.venue_polygon.features = [
    { type: 'Feature', properties: { venue_id: 'v' }, geometry: polygon },
  ]
  data.level_polygon.features = [
    { type: 'Feature', properties: { level_id: 'floor' }, geometry: polygon },
  ]
  return { schemaVersion: 1, data, documents: [] }
}
test('draft saves, publish, conflict protection, missing object and retained rollback', async () => {
  await db.insert(premisesMap).values({
    id: 'test-map',
    code: 'TEST',
    name: 'Test',
    nameZh: '',
    kind: 'building',
    updatedBy: 'editor',
    updatedAt: '2026-01-01',
  })
  const a = await saveMapDraft(db, bucket, {
    id: 'test-map',
    expectedVersion: 0,
    bundle: bundle(),
    actorId: 'editor',
  })
  expect(await publishedMapRelease(db, 'test-map', a.hash)).toBeUndefined()
  await expect(
    saveMapDraft(db, bucket, {
      id: 'test-map',
      expectedVersion: 0,
      bundle: bundle(),
      actorId: 'stale',
    }),
  ).rejects.toThrow('MAP_CONFLICT')
  expect(
    await publishMapDraft(db, bucket, {
      id: 'test-map',
      hash: a.hash,
      expectedDraftVersion: 1,
      expectedPublishedVersion: 0,
      actorId: 'editor',
    }),
  ).toBe(1)
  expect(await publishedMapRelease(db, 'test-map', a.hash)).toBeDefined()
  const edited = bundle()
  edited.documents = [{ kind: 'layout', path: 'https://example.com/updated' }]
  const b = await saveMapDraft(db, bucket, {
    id: 'test-map',
    expectedVersion: 1,
    bundle: edited,
    actorId: 'editor',
  })
  await expect(
    publishMapDraft(db, bucket, {
      id: 'test-map',
      hash: a.hash,
      expectedDraftVersion: 1,
      expectedPublishedVersion: 1,
      actorId: 'stale',
    }),
  ).rejects.toThrow('MAP_CONFLICT')
  await bucket.delete(mapReleaseKey('test-map', b.hash))
  await expect(
    publishMapDraft(db, bucket, {
      id: 'test-map',
      hash: b.hash,
      expectedDraftVersion: 2,
      expectedPublishedVersion: 1,
      actorId: 'editor',
    }),
  ).rejects.toThrow('missing')
  const current = await db
    .select()
    .from(premisesMap)
    .where(eq(premisesMap.id, 'test-map'))
    .get()
  expect(current?.publishedHash).toBe(a.hash)
  const restored = await saveMapDraft(db, bucket, {
    id: 'test-map',
    expectedVersion: 2,
    bundle: await readMapBundle(bucket, 'test-map', a.hash),
    actorId: 'editor',
  })
  expect(
    await publishMapDraft(db, bucket, {
      id: 'test-map',
      hash: restored.hash,
      expectedDraftVersion: 3,
      expectedPublishedVersion: 1,
      actorId: 'editor',
    }),
  ).toBe(2)
})

test('publication verifies enabled pairs, retains disabled pairs and fences the revised draft', async () => {
  const content = bundle()
  const geometry = content.data.level_polygon.features[0].geometry
  content.data.level_polygon.features = ['a', 'b', 'c'].map(level => ({
    type: 'Feature',
    properties: { level_id: level },
    geometry,
  }))
  content.data.unit_polygon.features = ['a', 'b', 'c'].map(level => ({
    type: 'Feature',
    properties: { unit_id: level, level_id: level, unit_category: 'stairs' },
    geometry,
  }))
  content.data.connections = ['b', 'c'].map(to => ({
    from: 'a',
    to,
    fromLevel: 'a',
    toLevel: to,
    category: 'stairs',
    evidence: 'aligned-footprints',
    enabled: to === 'b',
    direction: null,
  }))
  await db.insert(premisesMap).values({
    id: 'verification-map',
    code: 'VERIFY',
    name: 'Verify',
    nameZh: '',
    kind: 'building',
    updatedBy: 'editor',
    updatedAt: '2026-01-01',
  })
  const draft = await saveMapDraft(db, bucket, {
    id: 'verification-map',
    expectedVersion: 0,
    bundle: content,
    actorId: 'editor',
  })
  await publishMapDraft(db, bucket, {
    id: 'verification-map',
    hash: draft.hash,
    expectedDraftVersion: 1,
    expectedPublishedVersion: 0,
    actorId: 'reviewer',
  })
  const current = await db
    .select()
    .from(premisesMap)
    .where(eq(premisesMap.id, 'verification-map'))
    .get()
  expect(current?.publishedHash).not.toBe(draft.hash)
  expect(current?.draftHash).toBe(current?.publishedHash)
  expect(current?.draftVersion).toBe(2)
  if (!current?.publishedHash) throw new Error('Missing published release')
  const release = await readMapBundle(bucket, 'verification-map', current.publishedHash)
  expect(release.data.connections?.map(c => c.evidence)).toEqual([
    'editor-verified',
    'aligned-footprints',
  ])
  expect(release.data.connections?.[0].direction).toBeNull()
  expect(
    (await publishedMapRelease(db, 'verification-map', current.publishedHash))?.actorId,
  ).toBe('reviewer')
  await expect(
    publishMapDraft(db, bucket, {
      id: 'verification-map',
      hash: draft.hash,
      expectedDraftVersion: 1,
      expectedPublishedVersion: 1,
      actorId: 'stale',
    }),
  ).rejects.toThrow('MAP_CONFLICT')
})
