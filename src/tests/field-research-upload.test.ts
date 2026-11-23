// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { publicationSqlite } from './fixtures/publicationSqlite'
import type { Database } from '#lib/types.js'

const context = vi.hoisted(() => ({
  db: null as unknown,
  user: { id: 'admin', superAdmin: true, isAnonymous: false },
}))
vi.mock('#lib/fieldResearch/server.js', () => ({
  researchRequest: async () => ({ db: context.db, user: context.user }),
}))
import { GET, POST } from '../routes/api/fieldresearch/[session]/images/[image]/+server'

const stores: ReturnType<typeof publicationSqlite>[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.sqlite.close()
})

/** Prepare private capture storage and an observable R2 binding.
 * @returns Fixture database and route event builder.
 */
function fixture() {
  const f = publicationSqlite({}, 100)
  stores.push(f)
  context.db = f.db as unknown as Database
  f.sqlite.exec(
    `PRAGMA foreign_keys=ON; CREATE TABLE user(id TEXT PRIMARY KEY); CREATE TABLE organisation(id TEXT PRIMARY KEY,code TEXT); CREATE TABLE project(id TEXT PRIMARY KEY); CREATE TABLE layer(id TEXT PRIMARY KEY); CREATE TABLE feature(id TEXT PRIMARY KEY,organisationId TEXT,contributorId TEXT); INSERT INTO user VALUES('admin'); INSERT INTO organisation VALUES('org','hkghostsigns'); INSERT INTO project VALUES('project');`,
  )
  f.sqlite.exec(readFileSync('migrations/0242_field_research.sql', 'utf8'))
  f.sqlite.exec(
    readFileSync('migrations/0244_field_research_stack_details.sql', 'utf8'),
  )
  f.sqlite.exec(readFileSync('migrations/0246_field_research_archive.sql', 'utf8'))
  f.sqlite.exec(
    readFileSync('migrations/0261_field_research_configuration.sql', 'utf8'),
  )
  f.sqlite.exec(
    "INSERT INTO fieldResearchSession(id,name,organisationId,projectId,createdBy,createdAt,updatedAt) VALUES('session','Private outing','org','project','admin','now','now')",
  )
  let object: {
    body: Uint8Array
    size: number
    customMetadata: Record<string, string>
  } | null = null
  const bucket = {
    put: vi.fn(
      async (
        _key: string,
        body: ArrayBuffer,
        options: { customMetadata: Record<string, string> },
      ) => {
        if (object) return null
        object = {
          body: new Uint8Array(body),
          size: body.byteLength,
          customMetadata: options.customMetadata,
        }
        return {}
      },
    ),
    head: vi.fn(async () => object),
    get: vi.fn(async () => object),
  }
  const event = (id = 'image-one', coordinates: number[] | null = [114.17, 22.3]) => {
    const form = new FormData()
    form.set(
      'file',
      new File([new Uint8Array([255, 216, 255, 224])], 'capture.jpg', {
        type: 'image/jpeg',
      }),
    )
    form.set(
      'metadata',
      JSON.stringify({
        originalFilename: 'capture.jpg',
        capturedAt: null,
        cameraModel: null,
        credit: null,
        coordinates,
        originalWidth: 1,
        originalHeight: 1,
      }),
    )
    return {
      request: new Request(`http://localhost/api/fieldresearch/session/images/${id}`, {
        method: 'POST',
        headers: { origin: 'http://localhost' },
        body: form,
      }),
      params: { session: 'session', image: id },
      locals: { platform: { env: { ENVIRONMENT: 'local', ASSET_RAW_DEV: bucket } } },
      url: new URL(`http://localhost/api/fieldresearch/session/images/${id}`),
    } as unknown as Parameters<typeof POST>[0]
  }
  return { ...f, bucket, event }
}

describe('provisional image storage', () => {
  it('persists R2 bytes and extent without Feature association; replay does not duplicate writes', async () => {
    const f = fixture()
    expect((await POST(f.event())).status).toBe(200)
    expect((await POST(f.event())).status).toBe(200)
    expect(f.bucket.put).toHaveBeenCalledTimes(1)
    expect(
      f.sqlite.prepare('SELECT state,stackId FROM fieldResearchImage').get(),
    ).toEqual({ state: 'uploaded', stackId: null })
    expect(
      f.sqlite.prepare('SELECT west,south,east,north FROM fieldResearchSession').get(),
    ).toEqual({ west: 114.17, south: 22.3, east: 114.17, north: 22.3 })
    expect(f.sqlite.prepare('SELECT count(*) n FROM feature').get()?.n).toBe(0)
  })
  it('keeps failed uploads retryable and reuses an original after a lost database confirmation', async () => {
    const f = fixture()
    f.sqlite.exec(
      "CREATE TRIGGER fail_confirmation BEFORE UPDATE OF state ON fieldResearchImage BEGIN SELECT RAISE(ABORT,'confirmation failed'); END",
    )
    await expect(POST(f.event())).rejects.toThrow()
    expect(f.sqlite.prepare('SELECT state FROM fieldResearchImage').get()?.state).toBe(
      'uploading',
    )
    f.sqlite.exec('DROP TRIGGER fail_confirmation')
    await POST(f.event())
    expect(f.bucket.head).toHaveBeenCalledTimes(1)
    expect(f.sqlite.prepare('SELECT count(*) n FROM fieldResearchImage').get()?.n).toBe(
      1,
    )
    const response = await GET(f.event())
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
  it('rejects cross-origin writes and keeps missing GPS out of the session extent', async () => {
    const f = fixture()
    const event = f.event()
    event.request.headers.set('origin', 'https://elsewhere.example')
    await expect(POST(event)).rejects.toMatchObject({ status: 403 })
    expect(f.bucket.put).not.toHaveBeenCalled()
    await POST(f.event('image-one', null))
    expect(
      f.sqlite.prepare('SELECT west,south,east,north FROM fieldResearchSession').get(),
    ).toEqual({ west: null, south: null, east: null, north: null })
  })
  it('rejects anonymous users before obtaining a database or image binding', async () => {
    const actual = await vi.importActual<typeof import('#lib/fieldResearch/server.js')>(
      '#lib/fieldResearch/server.js',
    )
    await expect(
      actual.researchRequest(
        {
          user: { id: 'ordinary', superAdmin: false, isAnonymous: true },
          session: {},
        } as App.Locals,
        'session',
      ),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      actual.researchRequest({} as App.Locals, 'session'),
    ).rejects.toMatchObject({
      status: 401,
    })
  })
  it('backfills the confirmed organisations once and preserves explicit provenance', () => {
    const f = fixture()
    f.sqlite.exec(`CREATE TABLE organisationRole(organisationId TEXT,userId TEXT,role TEXT); INSERT INTO user VALUES('member'); INSERT INTO user VALUES('owner'); INSERT INTO user VALUES('visitor');
      INSERT INTO organisationRole VALUES('org','member','member'),('org','owner','owner'),('org','visitor','user');
      INSERT INTO feature VALUES('member-feature','org','member'),('owner-feature','org','owner'),('visitor-feature','org','visitor'),('missing-author','org',NULL);
      INSERT INTO organisation VALUES('food','hkfoodworks'),('city','cityrecorder'),('culture','cmef'),('eu','eunic'),('other','other');
      INSERT INTO feature VALUES('food-feature','food','visitor'),('city-feature','city',NULL),('culture-feature','culture',NULL),('eu-feature','eu',NULL),('other-feature','other',NULL);
      INSERT INTO featureOrigin VALUES('food-feature','field_research','session','now','admin');`)
    const migration = readFileSync(
      'migrations/0243_feature_origin_backfill.sql',
      'utf8',
    )
    f.sqlite.exec(migration)
    f.sqlite.exec(migration)
    const rows = f.sqlite
      .prepare('SELECT featureId,origin FROM featureOrigin ORDER BY featureId')
      .all()
    expect(Object.fromEntries(rows.map(row => [row.featureId, row.origin]))).toEqual({
      'member-feature': 'admin_contribution',
      'owner-feature': 'admin_contribution',
      'visitor-feature': 'app_contribution',
      'missing-author': 'app_contribution',
      'food-feature': 'field_research',
      'city-feature': 'admin_contribution',
      'culture-feature': 'admin_contribution',
      'eu-feature': 'admin_contribution',
    })
  })
})
