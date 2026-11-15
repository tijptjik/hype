// TESTS
import { afterAll, beforeAll, expect, test } from 'bun:test'
// NODE
import { readFileSync } from 'node:fs'
// CLOUDFLARE
import { createRequire } from 'node:module'
// Resolve Wrangler's pinned emulator rather than relying on a hoisted transitive package.
const { Miniflare, convertV4MiniflareOptions } = createRequire(
  import.meta.resolve('wrangler/package.json'),
)('miniflare')
// DRIZZLE
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
// DOMAIN
import { premisesMap, premisesMapCorrection } from '../../src/lib/db/schema/premisesMap'
import {
  saveMapDraft,
  publishMapDraft,
  publishedMapRelease,
  readMapBundle,
} from '../../src/lib/db/services/premisesMap'
import { layerNames, type IndoorData } from '../../src/lib/indoor/model'
import {
  validateMapBundle,
  mapReleaseKey,
  type MapBundle,
} from '../../src/lib/indoor/releases'
import { saveMapConnectionCurations } from '../../src/lib/db/services/premisesMapConnection'
import { prepareCorrectedMap } from '../../src/lib/db/services/premisesMapCorrection'
import { systemTask } from '../../src/lib/db/schema/systemTask'
// TYPES
import type { Database } from '../../src/lib/types'
import type { R2Bucket } from '@cloudflare/workers-types'
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: 'export default {fetch(){return new Response("ok")}}',
    compatibilityDate: '2026-01-01',
    d1Databases: ['DB'],
    r2Buckets: ['MAPS'],
  }),
)
let db: Database, bucket: R2Bucket
beforeAll(async () => {
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

test('source refresh materializes corrections, deduplicates issues and blocks unresolved publication', async () => {
  await db.insert(premisesMap).values({
    id: 'correction-map',
    code: 'CORRECTION',
    name: 'Correction map',
    nameZh: '',
    kind: 'station',
    updatedBy: 'reviewer',
    updatedAt: '2026-01-01',
  })
  const raw = bundle()
  raw.data.level_polygon.features[0].properties.level_name_en = 'Platform Level'
  const initial = await prepareCorrectedMap(db, bucket, {
    id: 'correction-map',
    sourceDataset: 'landsd-mtr',
    bundle: raw,
  })
  await db.insert(premisesMapCorrection).values({
    mapId: 'correction-map',
    sourceDataset: 'landsd-mtr',
    sourceLayer: 'level_polygon',
    sourceEntityId: 'floor',
    field: 'level_name_en',
    originalValue: 'Platform Level',
    correctedValue: 'Exit B Staircase',
    sourceSnapshotHash: initial.data.sourceSnapshotHash!,
    reason: 'Exit B access',
    authorUserId: 'reviewer',
  })
  const corrected = await prepareCorrectedMap(db, bucket, {
    id: 'correction-map',
    sourceDataset: 'landsd-mtr',
    bundle: raw,
  })
  expect(corrected.data.level_polygon.features[0].properties.level_name_en).toBe(
    'Exit B Staircase',
  )
  expect(raw.data.level_polygon.features[0].properties.level_name_en).toBe(
    'Platform Level',
  )
  const changed = structuredClone(raw)
  changed.data.level_polygon.features[0].properties.level_name_en = 'New function'
  const blocked = await prepareCorrectedMap(db, bucket, {
    id: 'correction-map',
    sourceDataset: 'landsd-mtr',
    bundle: changed,
  })
  const again = await prepareCorrectedMap(db, bucket, {
    id: 'correction-map',
    sourceDataset: 'landsd-mtr',
    bundle: changed,
  })
  expect(again.data.correctionIssues).toEqual(blocked.data.correctionIssues)
  expect(await db.select().from(systemTask)).toHaveLength(1)
  const draft = await saveMapDraft(db, bucket, {
    id: 'correction-map',
    expectedVersion: 0,
    bundle: blocked,
    actorId: 'reviewer',
  })
  await expect(
    publishMapDraft(db, bucket, {
      id: 'correction-map',
      hash: draft.hash,
      expectedDraftVersion: draft.version,
      expectedPublishedVersion: 0,
      actorId: 'reviewer',
    }),
  ).rejects.toThrow('MAP_CORRECTIONS_UNRESOLVED')
  const adopted = structuredClone(raw)
  adopted.data.level_polygon.features[0].properties.level_name_en = 'Exit B Staircase'
  const resolved = await prepareCorrectedMap(db, bucket, {
    id: 'correction-map',
    sourceDataset: 'landsd-mtr',
    bundle: adopted,
  })
  expect(resolved.data.correctionIssues).toEqual([])
  expect(await db.select().from(systemTask)).toHaveLength(1)
  expect((await db.select().from(systemTask))[0].isReviewed).toBe(true)
  expect(
    (await db.select().from(systemTask)).find(
      row => row.type === 'map-correction-upstream-adopted',
    )?.reviewOutcome,
  ).toBe('accepted')
  // A stale editor cannot update the correction independently of the draft pointer.
  await expect(
    saveMapDraft(db, bucket, {
      id: 'correction-map',
      expectedVersion: 0,
      bundle: corrected,
      actorId: 'reviewer',
      correctionWrites: [
        db
          .update(premisesMapCorrection)
          .set({ correctedValue: 'Stale overwrite' })
          .where(eq(premisesMapCorrection.mapId, 'correction-map')),
      ],
    }),
  ).rejects.toThrow()
  expect(
    (
      await db
        .select()
        .from(premisesMapCorrection)
        .where(eq(premisesMapCorrection.mapId, 'correction-map'))
    )[0].correctedValue,
  ).toBe('Exit B Staircase')
  const publishable = await saveMapDraft(db, bucket, {
    id: 'correction-map',
    expectedVersion: draft.version,
    bundle: corrected,
    actorId: 'reviewer',
  })
  await publishMapDraft(db, bucket, {
    id: 'correction-map',
    hash: publishable.hash,
    expectedDraftVersion: publishable.version,
    expectedPublishedVersion: 0,
    actorId: 'reviewer',
  })
  const published = await db
    .select()
    .from(premisesMap)
    .where(eq(premisesMap.id, 'correction-map'))
    .get()
  const served = await readMapBundle(
    bucket,
    'correction-map',
    published!.publishedHash!,
  )
  expect(served.data.level_polygon.features[0].properties.level_name_en).toBe(
    'Exit B Staircase',
  )
})

test('connection curations retain both entrance sides across refresh and fence stale authors', async () => {
  const id = 'connection-curation-map'
  await db.insert(premisesMap).values({
    id,
    code: 'LINK',
    name: 'Connection test',
    nameZh: '',
    kind: 'station',
    updatedBy: 'reviewer',
    updatedAt: 'now',
  })
  const raw = bundle()
  const floor = raw.data.level_polygon.features[0]
  raw.data.level_polygon.features.push({
    ...structuredClone(floor),
    properties: { level_id: 'upper' },
  })
  raw.data.unit_polygon.features = ['lower-stairs', 'upper-stairs'].map(
    (unit_id, index) => ({
      ...structuredClone(floor),
      properties: {
        unit_id,
        level_id: index ? 'upper' : 'floor',
        unit_category: 'stairs',
      },
    }),
  )
  const base = await prepareCorrectedMap(db, bucket, {
    id,
    sourceDataset: 'landsd-mtr',
    bundle: raw,
  })
  await saveMapDraft(db, bucket, {
    id,
    expectedVersion: 0,
    bundle: base,
    actorId: 'reviewer',
  })
  const connection = {
    from: 'lower-stairs',
    to: 'upper-stairs',
    fromLevel: 'floor',
    toLevel: 'upper',
    category: 'stairs' as const,
    evidence: 'editor-verified' as const,
    direction: 'both' as const,
    enabled: true,
    fromEntrance: { polygonIndex: 0, edgeIndex: 0 },
    toEntrance: { polygonIndex: 0, edgeIndex: 2 },
  }
  await saveMapConnectionCurations(db, bucket, {
    id,
    expectedVersion: 1,
    connections: [connection],
    reason: 'Verified both entrances',
    actorId: 'reviewer',
  })
  const rows = await db
    .select()
    .from(premisesMapCorrection)
    .where(eq(premisesMapCorrection.mapId, id))
  expect(rows).toHaveLength(1)
  expect(rows[0].originalValue).toBeNull()
  expect(rows[0].authorUserId).toBe('reviewer')
  const replay = await prepareCorrectedMap(db, bucket, {
    id,
    sourceDataset: 'landsd-mtr',
    bundle: raw,
  })
  expect(replay.data.connections).toEqual([connection])
  expect(replay.data.correctionIssues).toEqual([])
  await expect(
    saveMapConnectionCurations(db, bucket, {
      id,
      expectedVersion: 1,
      connections: [{ ...connection, enabled: false }],
      reason: 'Stale',
      actorId: 'reviewer',
    }),
  ).rejects.toThrow('MAP_CONFLICT')
  expect(
    JSON.parse(
      (
        await db
          .select()
          .from(premisesMapCorrection)
          .where(eq(premisesMapCorrection.mapId, id))
      )[0].correctedValue,
    ).enabled,
  ).toBe(true)
  const changed = structuredClone(raw)
  changed.data.unit_polygon.features[1].geometry = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [11, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ],
  }
  const conflict = await prepareCorrectedMap(db, bucket, {
    id,
    sourceDataset: 'landsd-mtr',
    bundle: changed,
  })
  expect(conflict.data.correctionIssues).toHaveLength(1)
  expect(conflict.data.connections).toEqual([])
  const missing = structuredClone(raw)
  missing.data.unit_polygon.features.pop()
  expect(
    (
      await prepareCorrectedMap(db, bucket, {
        id,
        sourceDataset: 'landsd-mtr',
        bundle: missing,
      })
    ).data.correctionIssues,
  ).toHaveLength(1)
  const adopted = structuredClone(raw)
  adopted.data.connections = [connection]
  expect(
    (
      await prepareCorrectedMap(db, bucket, {
        id,
        sourceDataset: 'landsd-mtr',
        bundle: adopted,
      })
    ).data.correctionIssues,
  ).toEqual([])
  const task = await db.select().from(systemTask).where(eq(systemTask.resourceId, id))
  expect(task).toHaveLength(1)
  expect(task[0].isReviewed).toBe(true)
  expect(task[0].type).toBe('map-correction-upstream-adopted')
  await expect(
    saveMapConnectionCurations(db, bucket, {
      id,
      expectedVersion: 2,
      connections: [
        { ...connection, fromEntrance: { polygonIndex: 0, edgeIndex: 99 } },
      ],
      reason: 'Invalid edge',
      actorId: 'reviewer',
    }),
  ).rejects.toThrow('Invalid connection entrance side')
  await saveMapConnectionCurations(db, bucket, {
    id,
    expectedVersion: 2,
    connections: [],
    reason: 'Connection no longer available',
    actorId: 'reviewer',
  })
  const disabled = await prepareCorrectedMap(db, bucket, {
    id,
    sourceDataset: 'landsd-mtr',
    bundle: raw,
  })
  expect(disabled.data.connections?.[0].enabled).toBe(false)
  expect(disabled.data.connections?.[0].toEntrance).toEqual(connection.toEntrance)
})

test('multipart government openings retain all segments and reject malformed lines', () => {
  const input = bundle()
  input.data.opening_line.features = [
    {
      type: 'Feature',
      properties: {
        level_id: input.data.level_polygon.features[0].properties.level_id,
      },
      geometry: {
        type: 'MultiLineString',
        coordinates: [
          [
            [0, 0],
            [1, 1],
          ],
          [
            [1, 1],
            [2, 0],
          ],
        ],
      },
    },
  ]
  expect(validateMapBundle(input).data.opening_line.features).toHaveLength(1)
  input.data.opening_line.features[0].geometry = {
    type: 'MultiLineString',
    coordinates: [[[0, 0]]],
  }
  expect(() => validateMapBundle(input)).toThrow('Malformed geometry')
})
