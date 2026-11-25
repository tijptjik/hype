// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { exteriorGalleryModel } from '#lib/locations/exterior/gallery.server.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
import type { Database } from '#lib/types.js'

it('uses the active comparison and only its latest exact-geometry front view', async () => {
  const { db, sqlite } = publicationSqlite({}, 100)
  const file = `comparison-${'ab'.repeat(32)}.glb`
  const get = vi.fn().mockResolvedValue({ json: async () => ({ file }) })
  const platform = {
    env: { ENVIRONMENT: 'local', LOCAL_EXTERIOR_COMPARISONS: { get } },
  } as unknown as App.Platform
  try {
    sqlite.exec(`CREATE TABLE locationExteriorAlignment(locationId TEXT,assetId TEXT,geometryId TEXT,revision INTEGER,alignment TEXT);
      INSERT INTO locationExteriorAlignment VALUES
      ('building:test','asset','asset',8,'{"frontViewId":"view-1"}'),
      ('building:test','asset','${file}',1,'{"frontViewId":"view-2"}'),
      ('building:test','asset','${file}',2,'{"frontViewId":"view-4"}');`)
    const model = {
      id: 'building:test',
      assetId: 'asset',
      sourceModelId: 'assembly',
      frontViewId: 'view-1',
    }
    expect(
      await exteriorGalleryModel(db as unknown as Database, platform, model),
    ).toEqual({
      exteriorUrl: `/api/location-exterior/building%3Atest/asset/${file}`,
      frontViewId: 'view-4',
      exteriorVariant: 'AI-generated',
    })
    sqlite.exec(`DELETE FROM locationExteriorAlignment WHERE geometryId='${file}'`)
    expect(
      (await exteriorGalleryModel(db as unknown as Database, platform, model))
        .frontViewId,
    ).toBeNull()
    get.mockResolvedValue(null)
    expect(
      await exteriorGalleryModel(db as unknown as Database, platform, model),
    ).toEqual({
      exteriorUrl: '/api/location-exterior/building%3Atest/asset/assembly.gltf',
      frontViewId: 'view-1',
      exteriorVariant: null,
    })
    expect(
      await exteriorGalleryModel(db as unknown as Database, platform, {
        ...model,
        assetId: null,
      }),
    ).toEqual({
      exteriorUrl: null,
      frontViewId: null,
      exteriorVariant: null,
    })
  } finally {
    sqlite.close()
  }
})
