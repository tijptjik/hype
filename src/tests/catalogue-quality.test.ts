// @vitest-environment node
// TESTS
import { expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import * as schema from '../lib/db/schema'
import { publicationSqlite } from './fixtures/publicationSqlite'
import {
  catalogueQuality,
  LOGO_QUALITIES,
  qualityFiltersFromUrl,
} from '../lib/locations/catalogueQuality'
import { catalogueQualitySql } from '../lib/db/services/catalogueQualitySql'
import { THEMES } from '../lib/themes/themes'
import type {
  CatalogueArtwork,
  CatalogueArtworkOwner,
} from '../lib/locations/catalogueArtwork'

const asset: CatalogueArtwork[string] = {
  src: '/api/identity-catalogue/logos/00000000-0000-5000-a000-000000000001',
  format: 'png',
  status: 'approved',
  background: '#ffffff',
}
it('requires both raster dimensions and explicit live coverage; SVGs scale', () => {
  expect(
    catalogueQuality({
      artwork: { logo: { ...asset, sourceWidth: 1200, sourceHeight: 300 } },
    }).resolution,
  ).toBe(false)
  expect(
    catalogueQuality({
      artwork: { logo: { ...asset, sourceWidth: 512, sourceHeight: 512 } },
    }).resolution,
  ).toBe(true)
  expect(
    catalogueQuality({ artwork: { logo: { ...asset, format: 'svg' } } }).resolution,
  ).toBe(true)
  expect(catalogueQuality({ artwork: { marker: asset } }).modes).toBe(false)
  expect(
    catalogueQuality({ artwork: { 'marker-light': asset, 'marker-dark': asset } })
      .modes,
  ).toBe(true)
  expect(catalogueQuality({ artwork: { marker: asset } }).brandMark).toBe(false)
  expect(
    catalogueQuality({ artwork: { marker: { ...asset, composition: 'brand-mark' } } })
      .brandMark,
  ).toBe(true)
})
it('keeps SQL yes/no predicates consistent with badges, including missing and candidate metadata', async () => {
  const f = publicationSqlite(schema)
  const records: CatalogueArtworkOwner[] = [
    {},
    { logo: asset.src },
    { artwork: { logo: { ...asset, sourceWidth: 512, sourceHeight: 511 } } },
    { artwork: { logo: { ...asset, sourceWidth: 512, sourceHeight: 512 } } },
    { artwork: { logo: { ...asset, format: 'svg', status: 'candidate' } } },
    {
      artwork: {
        logo: { ...asset, format: 'svg' },
        'marker-light': asset,
        'marker-dark': asset,
      },
    },
    { artwork: Object.fromEntries(THEMES.map(t => [`marker-${t.id}`, asset])) },
    {
      artwork: {
        'logo-format-shop': { ...asset, format: 'svg' },
        marker: { ...asset, composition: 'brand-mark' },
      },
    },
  ]
  try {
    f.sqlite.exec('CREATE TABLE records(id INTEGER,content TEXT)')
    records.forEach((r, i) => {
      f.sqlite.prepare('INSERT INTO records VALUES(?,?)').run(i, JSON.stringify(r))
    })
    for (const { key } of LOGO_QUALITIES)
      for (const value of [true, false]) {
        const rows = await f.db.all<{ id: number }>(
          sql`SELECT id FROM records r WHERE ${catalogueQualitySql({ [key]: value })} ORDER BY id`,
        )
        expect(rows.map(r => r.id)).toEqual(
          records.flatMap((r, i) => (catalogueQuality(r)[key] === value ? [i] : [])),
        )
      }
    const combined = await f.db.all<{ id: number }>(
      sql`SELECT id FROM records r WHERE ${catalogueQualitySql({ svg: true, modes: true })} LIMIT 1`,
    )
    expect(combined).toEqual([{ id: 5 }])
  } finally {
    f.sqlite.close()
  }
})
it('ignores unknown URL values without turning them into negative filters', () => {
  expect(
    qualityFiltersFromUrl(
      new URLSearchParams(
        'logo-svg=no&logo-modes=yes&logo-themes=maybe&organisation=org',
      ),
    ),
  ).toEqual({ svg: false, modes: true })
})

it('filters catalogue provenance independently of feature origins and combines it with quality', async () => {
  const { searchIdentityCatalogue } = await import(
    '../lib/db/services/identityCatalogue'
  )
  const f = publicationSqlite(schema)
  try {
    f.sqlite.exec(`CREATE TABLE identityCatalogue(id TEXT,kind TEXT,version INTEGER,groupId TEXT);
      CREATE TABLE identityCatalogueRevisionContent(catalogueId TEXT,version INTEGER,content TEXT);
      CREATE TABLE identityCatalogueSource(catalogueId TEXT,source TEXT,sourceId TEXT);
      CREATE TABLE identityCatalogueI18n(catalogueId TEXT,version INTEGER,name TEXT);`)
    for (const [id, kind] of [
      ['mtr', 'brand'],
      ['local', 'brand'],
      ['group', 'group'],
    ]) {
      f.sqlite.prepare('INSERT INTO identityCatalogue VALUES(?,?,1,NULL)').run(id, kind)
      f.sqlite
        .prepare('INSERT INTO identityCatalogueRevisionContent VALUES(?,1,?)')
        .run(
          id,
          JSON.stringify({
            i18n: {
              en: { name: id },
              'zh-Hans': { name: id },
              'zh-Hant': { name: id },
            },
            artwork: { logo: { ...asset, format: 'svg' } },
          }),
        )
    }
    f.sqlite.exec(
      "INSERT INTO identityCatalogueSource VALUES('mtr','brand:mtr-business-label','source-1')",
    )
    const db = f.db
    expect(
      (
        await searchIdentityCatalogue(db, 'brand', '', undefined, false, null, {
          origin: 'brand:mtr-business-label',
          quality: { svg: true },
        })
      ).map(r => r.id),
    ).toEqual(['mtr'])
    expect(
      (
        await searchIdentityCatalogue(db, 'brand', '', undefined, false, null, {
          origin: 'unrecorded',
        })
      ).map(r => r.id),
    ).toEqual(['local'])
    expect(
      await searchIdentityCatalogue(db, 'group', '', undefined, false, null, {
        quality: { svg: false },
      }),
    ).toEqual([])
  } finally {
    f.sqlite.close()
  }
})
