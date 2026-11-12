import { setResearchSessionsArchived } from '#lib/db/services/fieldResearchArchive.js'
import { mergeResearchStacks } from '#lib/db/services/fieldResearch.js'
// @vitest-environment node
// TESTS
import { afterEach, describe, expect, it } from 'vitest'
// NODE
import { readFileSync } from 'node:fs'
// DRIZZLE
import { eq } from 'drizzle-orm'
// DOMAIN
import { researchCoordinates, suggestResearchStacks } from '#lib/fieldResearch/model.js'
import { runResearchQueue } from '#lib/fieldResearch/queue.js'
// SERVICES
import {
  clusterResearchImages,
  moveResearchImage,
  placeResearchStack,
} from '#lib/db/services/fieldResearch.js'
import { convertResearchStack } from '#lib/db/services/fieldResearchConversion.js'
// SCHEMA
import {
  fieldResearchSession,
  fieldResearchImage,
  fieldResearchStack,
} from '#lib/db/schema/fieldResearch.js'
// FIXTURES
import { lifecycleFixture } from './fixtures/featureLifecycle'

const stores: ReturnType<typeof lifecycleFixture>[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.sqlite.close()
})

/** Build a realistic retained session alongside the accepted Feature revision schema.
 * @returns Isolated D1 adapter enforcing the production variable ceiling.
 */
async function fixture() {
  const f = lifecycleFixture(false, false, 100)
  stores.push(f)
  f.sqlite.exec('DROP TABLE featureOrigin')
  f.sqlite.exec(readFileSync('migrations/0242_field_research.sql', 'utf8'))
  f.sqlite.exec(
    readFileSync('migrations/0244_field_research_stack_details.sql', 'utf8'),
  )
  f.sqlite.exec(readFileSync('migrations/0246_field_research_archive.sql', 'utf8'))
  f.sqlite.exec(
    `INSERT INTO user(id) VALUES ('researcher'); CREATE TABLE featureIntentPolicy(scopeType TEXT,scopeId TEXT,definition TEXT,namingRules TEXT,version INTEGER);`,
  )
  await f.db.insert(fieldResearchSession).values({
    id: 'session',
    name: 'Internal outing',
    organisationId: 'org',
    projectId: 'project',
    createdBy: 'researcher',
    createdAt: 'now',
    updatedAt: 'now',
    status: 'uploading',
  })
  return f
}

/** Seed durable captures without creating Feature images or public URLs.
 * @param f Isolated fixture. @param count Number of nearby captures. @returns Nothing.
 */
async function captures(f: Awaited<ReturnType<typeof fixture>>, count: number) {
  for (let index = 0; index < count; index++)
    await f.db.insert(fieldResearchImage).values({
      id: `capture-${index}`,
      sessionId: 'session',
      state: 'uploaded',
      filename: `${index}.jpg`,
      longitude: 114.17,
      latitude: 22.3,
      contentHash: 'a'.repeat(64),
      storageKey: `field-research/session/${index}`,
      env: 'local',
      mediaType: 'image/jpeg',
      byteSize: 10,
      createdAt: String(index).padStart(5, '0'),
      metadata: JSON.stringify({
        originalFilename: `${index}.jpg`,
        capturedAt: null,
        cameraModel: null,
        credit: null,
        coordinates: [114.17, 22.3],
        originalWidth: 10,
        originalHeight: 10,
      }),
    })
}

describe('field research capture and grouping', () => {
  it('keeps absent GPS distinct from zero and validates coordinate bounds', () => {
    expect(researchCoordinates(null, null)).toBeNull()
    expect(researchCoordinates('0', '0')).toEqual([0, 0])
    expect(researchCoordinates('91', '0')).toBeNull()
    expect(researchCoordinates('', '0')).toBeNull()
  })
  it('suggests local groups without transitive chains and handles the date line', () => {
    const images = [0, 0.0001, 0.0002].map((longitude, i) => ({
      id: String(i),
      longitude,
      latitude: 0,
    }))
    expect(suggestResearchStacks(images)).toEqual([['0', '1'], ['2']])
    expect(
      suggestResearchStacks([
        { id: 'a', latitude: 0, longitude: 179.99999 },
        { id: 'b', latitude: 0, longitude: -179.99999 },
        { id: 'c', latitude: null, longitude: null },
      ]),
    ).toEqual([['a', 'b'], ['c']])
  })
  it('processes thousands of files with at most two active workers', async () => {
    let active = 0,
      maximum = 0,
      finished = 0
    await runResearchQueue(
      Array.from({ length: 3000 }, (_, i) => i),
      async () => {
        active++
        maximum = Math.max(maximum, active)
        await Promise.resolve()
        active--
        finished++
      },
    )
    expect(maximum).toBe(2)
    expect(finished).toBe(3000)
  })
  it('clusters beyond D1 variable limits and preserves capture coordinates through extraction and manual placement', async () => {
    const f = await fixture()
    await captures(f, 125)
    await clusterResearchImages(f.db, 'session', 0)
    expect(f.sqlite.prepare('SELECT count(*) n FROM fieldResearchStack').get()?.n).toBe(
      1,
    )
    await moveResearchImage(f.db, {
      sessionId: 'session',
      revision: 1,
      imageId: 'capture-0',
      targetStackId: null,
      coordinates: [114.19, 22.35],
    })
    const split = await f.db
      .select()
      .from(fieldResearchImage)
      .where(eq(fieldResearchImage.id, 'capture-0'))
      .get()
    if (!split?.stackId) throw new Error('Expected separated stack')
    expect(
      f.sqlite
        .prepare('SELECT longitude,latitude FROM fieldResearchStack WHERE id=?')
        .get(split.stackId),
    ).toEqual({ longitude: 114.19, latitude: 22.35 })
    await placeResearchStack(f.db, {
      sessionId: 'session',
      revision: 2,
      stackId: split.stackId,
      coordinates: [114.2, 22.4],
    })
    expect(
      f.sqlite
        .prepare('SELECT longitude,latitude FROM fieldResearchImage WHERE id=?')
        .get('capture-0'),
    ).toEqual({ longitude: 114.17, latitude: 22.3 })
    await expect(
      moveResearchImage(f.db, {
        sessionId: 'session',
        revision: 2,
        imageId: 'capture-0',
        targetStackId: null,
      }),
    ).rejects.toMatchObject({ status: 409 })
    expect(f.sqlite.prepare('SELECT count(*) n FROM fieldResearchStack').get()?.n).toBe(
      2,
    )
  })
  it('merges a complete stack in one revision without moving its destination pin', async () => {
    const f = await fixture()
    await captures(f, 125)
    await clusterResearchImages(f.db, 'session', 0)
    const original = (await f.db.select().from(fieldResearchStack))[0]
    await moveResearchImage(f.db, {
      sessionId: 'session',
      revision: 1,
      imageId: 'capture-0',
      targetStackId: null,
      coordinates: [114.2, 22.4],
    })
    const target = (await f.db.select().from(fieldResearchStack)).find(
      row => row.id !== original.id,
    )!
    await mergeResearchStacks(f.db, {
      sessionId: 'session',
      revision: 2,
      sourceStackId: original.id,
      targetStackId: target.id,
    })
    expect(
      f.sqlite
        .prepare('SELECT count(*) n FROM fieldResearchImage WHERE stackId=?')
        .get(target.id)?.n,
    ).toBe(125)
    expect(
      f.sqlite
        .prepare('SELECT longitude,latitude FROM fieldResearchStack WHERE id=?')
        .get(target.id),
    ).toEqual({ longitude: 114.2, latitude: 22.4 })
    await expect(
      mergeResearchStacks(f.db, {
        sessionId: 'session',
        revision: 2,
        sourceStackId: target.id,
        targetStackId: original.id,
      }),
    ).rejects.toMatchObject({ status: 409 })
  })
  it('converts once with generic name, marker, ordered gallery and immutable origin while retaining the session', async () => {
    const f = await fixture()
    await captures(f, 2)
    await clusterResearchImages(f.db, 'session', 0)
    const stack = (await f.db.select().from(fieldResearchStack))[0]
    const input = {
      sessionId: 'session',
      revision: 1,
      stackId: stack.id,
      layerId: 'layer',
      featureType: 'object',
      actorId: 'researcher',
    }
    const id = await convertResearchStack(f.db, input)
    expect(await convertResearchStack(f.db, input)).toBe(id)
    const row = f.sqlite
      .prepare('SELECT isPublished,geometry,currentRevisionId FROM feature WHERE id=?')
      .get(id)!
    expect(row.isPublished).toBe(0)
    expect(JSON.parse(row.geometry as string)).toEqual({
      type: 'Point',
      coordinates: [114.17, 22.3],
    })
    const content = JSON.parse(
      f.sqlite
        .prepare('SELECT content FROM featureRevision WHERE id=?')
        .get(row.currentRevisionId as string)?.content as string,
    )
    expect(content.gallery.order).toEqual(['capture-0', 'capture-1'])
    expect(content.translations.en.title.value).toMatch(/^Field research /)
    expect(
      f.sqlite
        .prepare('SELECT origin,originId FROM featureOrigin WHERE featureId=?')
        .get(id),
    ).toEqual({ origin: 'field_research', originId: 'session' })
    expect(f.sqlite.prepare('SELECT count(*) n FROM fieldResearchImage').get()?.n).toBe(
      2,
    )
    await expect(
      moveResearchImage(f.db, {
        sessionId: 'session',
        revision: 2,
        imageId: 'capture-0',
        targetStackId: null,
      }),
    ).rejects.toMatchObject({ status: 409 })
  })
  it('uses the provisional stack name when creating its unpublished Feature', async () => {
    const f = await fixture()
    await captures(f, 1)
    await clusterResearchImages(f.db, 'session', 0)
    const stack = (await f.db.select().from(fieldResearchStack))[0]
    await f.db
      .update(fieldResearchStack)
      .set({ name: 'Observed shop', featureType: 'object' })
      .where(eq(fieldResearchStack.id, stack.id))
    const id = await convertResearchStack(f.db, {
      sessionId: 'session',
      revision: 1,
      stackId: stack.id,
      layerId: 'layer',
      featureType: 'object',
      actorId: 'researcher',
    })
    const row = f.sqlite
      .prepare(
        'SELECT content FROM featureRevision WHERE id=(SELECT currentRevisionId FROM feature WHERE id=?)',
      )
      .get(id)
    expect(JSON.parse(row?.content as string).translations.en.title.value).toBe(
      'Observed shop',
    )
  })
  it('rolls back every new image and Feature if conversion fails after registration', async () => {
    const f = await fixture()
    await captures(f, 2)
    await clusterResearchImages(f.db, 'session', 0)
    const stack = (await f.db.select().from(fieldResearchStack))[0]
    f.sqlite.exec(
      "CREATE TRIGGER fail_origin BEFORE INSERT ON featureOrigin BEGIN SELECT RAISE(ABORT,'test late failure'); END;",
    )
    await expect(
      convertResearchStack(f.db, {
        sessionId: 'session',
        revision: 1,
        stackId: stack.id,
        layerId: 'layer',
        featureType: 'object',
        actorId: 'researcher',
      }),
    ).rejects.toThrow()
    expect(
      f.sqlite.prepare("SELECT count(*) n FROM image WHERE id LIKE 'capture-%'").get()
        ?.n,
    ).toBe(0)
    expect(
      f.sqlite.prepare('SELECT featureId FROM fieldResearchStack').get()?.featureId,
    ).toBeNull()
  })
})

describe('research session archive', () => {
  it('archives and restores large selections without changing progress or captures', async () => {
    const f = await fixture()
    await captures(f, 3)
    f.sqlite.exec(
      `WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<120) INSERT INTO fieldResearchSession(id,name,organisationId,projectId,createdBy,createdAt,updatedAt,status) SELECT 'bulk-'||x,'Outing','org','project','researcher','now','now','organising' FROM n`,
    )
    const rows = await f.db.select().from(fieldResearchSession)
    const actor = {
      db: f.db,
      user: { id: 'researcher', superAdmin: true },
      userRoles: [],
    }
    expect(await setResearchSessionsArchived(actor, rows, true)).toBe(true)
    const archived = await f.db.select().from(fieldResearchSession)
    expect(archived).toHaveLength(121)
    expect(
      archived.every(
        row =>
          row.isArchived &&
          row.archivedBy === 'researcher' &&
          row.archivedAt &&
          row.revision === 1,
      ),
    ).toBe(true)
    expect(archived.find(row => row.id === 'session')?.status).toBe('uploading')
    expect(await f.db.select().from(fieldResearchImage)).toHaveLength(3)
    expect(await setResearchSessionsArchived(actor, archived, false)).toBe(true)
    const restored = await f.db.select().from(fieldResearchSession)
    expect(
      restored.every(
        row =>
          !row.isArchived &&
          row.archivedAt === null &&
          row.archivedBy === null &&
          row.revision === 2,
      ),
    ).toBe(true)
  })

  it('rejects stale, missing and unauthorized selections without partial updates', async () => {
    const f = await fixture()
    const actor = {
      db: f.db,
      user: { id: 'researcher', superAdmin: true },
      userRoles: [],
    }
    expect(
      await setResearchSessionsArchived(
        actor,
        [
          { id: 'session', revision: 0 },
          { id: 'missing', revision: 0 },
        ],
        true,
      ),
    ).toBe(false)
    expect(
      await setResearchSessionsArchived(actor, [{ id: 'session', revision: 1 }], true),
    ).toBe(false)
    expect(
      await setResearchSessionsArchived(
        { ...actor, user: { id: 'researcher', superAdmin: false } },
        [{ id: 'session', revision: 0 }],
        true,
      ),
    ).toBe(false)
    const [row] = await f.db.select().from(fieldResearchSession)
    expect(row.isArchived).toBe(false)
    expect(row.revision).toBe(0)
  })
})
