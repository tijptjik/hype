// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { LocationFootprintSchema } from '#lib/locations/footprint.js'
import { LocalLocationInputSchema } from '#lib/locations/local.js'
import { AvailableDiscoveryTypeSchema } from '#lib/locations/kinds.js'
import {
  createLocationFactsSnapshot,
  readLocationFacts,
  serializeLocationFacts,
  LocationFactsSnapshotSchema,
} from '#lib/locations/factsSnapshot.js'
import { resolveFeatureLocation } from '#lib/locations/resolve.js'
import { planLocationAdoption } from '#lib/locations/adoption.js'
import type { LocationFacts } from '#lib/locations/model.js'
import type { LocationFootprint } from '#lib/locations/footprint.js'

const facts: LocationFacts = {
  names: { en: 'Example' },
  phoneNumber: [],
  brands: [],
  location: {
    geometry: { type: 'Point', coordinates: [114.17, 22.3] },
    address: {
      status: 'unresolved',
      address2dId: null,
      address3dId: null,
      address3dUnitId: null,
      snapshotId: null,
      rawSource: {},
      fallbackDisplay: { en: 'Retained address' },
    },
  },
}
const footprint = {
  mode: 'inline' as const,
  geometry: {
    type: 'Polygon' as const,
    coordinates: [
      [
        [114.17, 22.3],
        [114.171, 22.3],
        [114.171, 22.301],
        [114.17, 22.3],
      ],
    ],
  },
} satisfies LocationFootprint
const geometryReference = {
  mode: 'reference',
  ssId: 'canonical-entity',
  releaseId: '2026-09-21',
  geometryRevisionId: 'geometry-1',
}

describe('typed Location facts snapshots', () => {
  it('captures a kind and schema version while retaining the established display projection', () => {
    const snapshot = createLocationFactsSnapshot(
      {
        ...facts,
        phoneNumber: ['+85223456789'],
        brands: [{ identifiers: {}, names: { en: 'Brand' } }],
      },
      'establishment',
    )
    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      kind: 'establishment',
      i18n: { en: { name: 'Example' } },
      details: { brands: [{ identifiers: {}, i18n: { en: { name: 'Brand' } } }] },
    })
    expect(snapshot).not.toHaveProperty('names')
    expect(readLocationFacts(snapshot)).toEqual({
      ...facts,
      phoneNumber: ['+85223456789'],
      brands: [{ identifiers: {}, names: { en: 'Brand' } }],
    })
    expect(() => serializeLocationFacts(facts)).toThrow('explicit Location kind')
    expect(() => readLocationFacts({ ...snapshot, schemaVersion: 99 })).toThrow()
  })
  it('allows an addressless building and retains its optional extent across projection edits', () => {
    const snapshot = LocationFactsSnapshotSchema.parse({
      schemaVersion: 1,
      kind: 'building',
      i18n: { en: { name: 'Example' } },
      common: {
        footprint,
        location: { geometry: facts.location.geometry },
      },
      details: {},
    })
    expect(snapshot).not.toHaveProperty('common.phoneNumber')
    expect(snapshot.details).not.toHaveProperty('brands')
    const projected = readLocationFacts(snapshot)
    expect(projected.phoneNumber).toEqual([])
    expect(projected.location.address.fallbackDisplay).toEqual({})
    const next = JSON.parse(
      serializeLocationFacts({ ...projected, names: { en: 'Corrected building' } }),
    )
    expect(next.common.footprint).toEqual(footprint)
    expect(next.i18n.en.name).toBe('Corrected building')
    expect(resolveFeatureLocation(projected, projected.location, {}).footprint).toEqual(
      footprint,
    )
  })

  it.each(['building', 'establishment', 'natural', 'unknown'] as const)(
    'supports optional shared geometry for %s without inventing upstream data',
    kind => {
      const snapshot = createLocationFactsSnapshot({ ...facts, footprint }, kind)
      expect(snapshot.common.footprint).toEqual(footprint)
      expect(readLocationFacts(snapshot).footprint).toEqual(footprint)
      expect(createLocationFactsSnapshot(facts, kind).common).not.toHaveProperty(
        'footprint',
      )
      expect(snapshot.details).not.toHaveProperty('footprint')
    },
  )

  it('keeps detailed publisher building attributes out of core HYPE facts', () => {
    const base = {
      schemaVersion: 1,
      kind: 'building',
      i18n: {},
      common: createLocationFactsSnapshot(facts, 'building').common,
    }
    for (const details of [
      { source: { inventory: 'landsd', buildingCSUID: 'source-record' } },
      { structureType: 'tower' },
      { storeysAboveGround: 16 },
      { storeysBelowGround: 1 },
      { elevations: { verticalDatum: 'HKPD', topMetres: 66.6 } },
      { heightMetres: 3.5 },
      { footprint },
      { brands: [] },
      { roofShape: 'flat' },
      { material: 'concrete' },
    ])
      expect(LocationFactsSnapshotSchema.safeParse({ ...base, details }).success).toBe(
        false,
      )
    expect(
      LocationFactsSnapshotSchema.safeParse({
        ...base,
        details: { buildingStatus: 'standing' },
      }).success,
    ).toBe(true)
  })

  it('validates polygons, multipolygons and immutable SaanSeoi references without accepting download URLs', () => {
    expect(LocationFootprintSchema.parse(footprint)).toEqual(footprint)
    expect(
      LocationFootprintSchema.parse({
        mode: 'inline',
        geometry: {
          type: 'MultiPolygon',
          coordinates: [footprint.geometry.coordinates],
        },
      }),
    ).toMatchObject({ mode: 'inline', geometry: { type: 'MultiPolygon' } })
    expect(LocationFootprintSchema.parse(geometryReference)).toEqual(geometryReference)
    for (const alias of ['latest', 'CURRENT'])
      for (const field of ['releaseId', 'geometryRevisionId'])
        expect(
          LocationFootprintSchema.safeParse({ ...geometryReference, [field]: alias })
            .success,
        ).toBe(false)
    for (const coordinates of [
      [],
      [
        [
          [114, 22],
          [115, 22],
          [115, 23],
          [116, 24],
        ],
      ],
      [
        [
          [181, 22],
          [115, 22],
          [115, 23],
          [181, 22],
        ],
      ],
    ])
      expect(
        LocationFootprintSchema.safeParse({
          mode: 'inline',
          geometry: { type: 'Polygon', coordinates },
        }).success,
      ).toBe(false)
    expect(
      LocationFootprintSchema.safeParse({ ...geometryReference, ssId: '' }).success,
    ).toBe(false)
    expect(
      LocationFootprintSchema.safeParse({
        ...geometryReference,
        url: 'https://example.com/latest.geojson',
      }).success,
    ).toBe(false)
  })

  it.each(['manual', 'unresolved'] as const)(
    'supports local building footprints in %s state while source discovery stays disabled',
    state => {
      expect(
        LocalLocationInputSchema.parse({
          state,
          kind: 'building',
          facts: { ...facts, footprint },
        }).facts.footprint,
      ).toEqual(footprint)
      expect(
        LocalLocationInputSchema.safeParse({
          state,
          kind: 'building',
          facts: { ...facts, footprint: geometryReference },
        }).success,
      ).toBe(false)
      expect(AvailableDiscoveryTypeSchema.safeParse('building').success).toBe(false)
      expect(AvailableDiscoveryTypeSchema.safeParse('natural').success).toBe(false)
    },
  )

  it('reviews footprint changes under the Project facts policy and preserves an Organisation correction', () => {
    const old = readLocationFacts(
      createLocationFactsSnapshot({ ...facts, footprint }, 'building'),
    )
    const next: LocationFacts = {
      ...old,
      footprint: {
        ...footprint,
        geometry: {
          ...footprint.geometry,
          coordinates: [
            [
              [114.17, 22.3],
              [114.172, 22.3],
              [114.172, 22.302],
              [114.17, 22.3],
            ],
          ],
        },
      },
    }
    const revision = {
      id: 'old',
      locationId: 'l',
      version: 1,
      ssId: null,
      origin: 'local' as const,
      facts: old,
      rawSource: {},
    }
    const policy = {
      version: 1,
      relocation: 'review',
      coordinates: { mode: 'follow' },
      address: 'follow',
      unit: 'follow',
      establishment: 'review',
    }
    const input = {
      facts: revision,
      location: revision,
      candidate: { ...revision, id: 'new', version: 2, facts: next },
      overrides: {},
      policy,
    }
    expect(planLocationAdoption(input).decision.facts).toBe('review')
    const accepted = planLocationAdoption({
      ...input,
      policy: { ...policy, sameSources: true, establishment: 'follow' },
    })
    expect(accepted.effective.footprint).toEqual(next.footprint)
    const cleared = planLocationAdoption({
      ...input,
      overrides: { footprint: { mode: 'clear' } },
    })
    expect(cleared.effective.footprint).toBeNull()
  })

  it('migrates old revisions using their captured historical kind and preserves source evidence, IDs and effective values', () => {
    const db = new DatabaseSync(':memory:')
    try {
      db.exec(
        "CREATE TABLE locationRevision(id TEXT PRIMARY KEY,locationId TEXT,sequence INTEGER,origin TEXT,ssId TEXT,contentHash TEXT,payload TEXT,facts TEXT); CREATE TRIGGER location_revision_no_update BEFORE UPDATE ON locationRevision BEGIN SELECT RAISE(ABORT,'immutable'); END;",
      )
      const insert = db.prepare('INSERT INTO locationRevision VALUES(?,?,?,?,?,?,?,?)')
      insert.run(
        'original',
        'l',
        1,
        'local',
        null,
        'hash',
        JSON.stringify({ kind: 'existing-feature-split' }),
        JSON.stringify({ ...facts, successorLocationId: null, operatingStatus: null }),
      )
      insert.run(
        'reclassified',
        'l',
        2,
        'local',
        null,
        'hash2',
        JSON.stringify({
          kind: 'organisation-baseline-edit',
          typeChange: { before: 'unknown', after: 'building' },
        }),
        JSON.stringify({ ...facts, buildingStatus: 'standing' }),
      )
      insert.run(
        'later',
        'l',
        3,
        'local',
        null,
        'hash3',
        JSON.stringify({ kind: 'local-address-edit' }),
        JSON.stringify({ ...facts, buildingStatus: 'standing' }),
      )
      const before = db
        .prepare(
          'SELECT id,contentHash,payload FROM locationRevision ORDER BY sequence',
        )
        .all()
      db.exec(readFileSync('migrations/0142_location_facts_snapshots.sql', 'utf8'))
      db.exec('CREATE VIEW featureAcceptedNamingLocation AS SELECT 1')
      db.exec(readFileSync('migrations/0238_location_i18n.sql', 'utf8'))
      const rows = db
        .prepare('SELECT facts FROM locationRevision ORDER BY sequence')
        .all()
      expect(rows.map(row => JSON.parse(String(row.facts)).kind)).toEqual([
        'unknown',
        'building',
        'building',
      ])
      expect(readLocationFacts(String(rows[0].facts))).toEqual({
        ...facts,
        successorLocationId: null,
      })
      expect(
        db
          .prepare(
            'SELECT id,contentHash,payload FROM locationRevision ORDER BY sequence',
          )
          .all(),
      ).toEqual(before)
      expect(() =>
        db.exec("UPDATE locationRevision SET contentHash='changed'"),
      ).toThrow('immutable')
      expect(() =>
        insert.run(
          'legacy',
          'l',
          4,
          'local',
          null,
          'hash4',
          '{}',
          JSON.stringify(facts),
        ),
      ).toThrow('locale-first i18n content')
    } finally {
      db.close()
    }
  })
})

it('stores localized identity and address labels under locale-first i18n', () => {
  const input: LocationFacts = {
    ...facts,
    names: { en: 'AROME Bakery', 'zh-Hant': '東海堂' },
    branch: { en: 'Central', 'zh-Hant': '中環' },
    format: { en: 'AROME Bakery' },
    branchId: '0012',
    brands: [{ identifiers: { source: 'arome' }, names: { en: 'AROME' } }],
    location: {
      ...facts.location,
      address: {
        ...facts.location.address,
        displayOverrides: { en: 'Reviewed address' },
      },
    },
  }
  const snapshot = createLocationFactsSnapshot(input, 'establishment')
  expect(snapshot.i18n).toEqual({
    en: {
      name: 'AROME Bakery',
      branch: 'Central',
      format: 'AROME Bakery',
      displayAddress: 'Retained address',
      displayAddressOverride: 'Reviewed address',
    },
    'zh-Hant': { name: '東海堂', branch: '中環' },
  })
  expect(snapshot.common).not.toHaveProperty('names')
  expect(snapshot.common.location.address).not.toHaveProperty('fallbackDisplay')
  expect(snapshot.common.location.address).not.toHaveProperty('displayOverrides')
  expect(snapshot.details).not.toHaveProperty('branch')
  expect(snapshot.details).not.toHaveProperty('format')
  expect(snapshot.details).toMatchObject({
    branchId: '0012',
    brands: [{ i18n: { en: { name: 'AROME' } } }],
  })
  expect(readLocationFacts(snapshot)).toEqual(input)
})
