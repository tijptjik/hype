// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { BuildingDetailsSchema } from '#lib/locations/factsDetails.js'
import {
  createLocationFactsSnapshot,
  readLocationFacts,
  serializeLocationFacts,
  LocationFactsSnapshotSchema,
} from '#lib/locations/factsSnapshot.js'
import { projectLandsdBuildingDetails } from '#lib/locations/landsdBuilding.js'
import { resolveFeatureLocation } from '#lib/locations/resolve.js'
import { planLocationAdoption } from '#lib/locations/adoption.js'
import type { LocationFacts } from '#lib/locations/model.js'

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
      addressSnapshotId: null,
      records: {},
      fallbackDisplay: { en: 'Retained address' },
    },
  },
}
const landsd = {
  BuildingCSUID: '2899032335T20050430',
  BuildingID: 1105760103,
  GeoRefNo: '2899032335',
  BuildingBlockType: 'Tower',
  Status: 'Active',
  BaseHeight: 63.1,
  TopHeight: 66.6,
  Storeys: 16,
  StoreysInBasement: 0,
  Shape_Area: 171.27415305665085,
  DateCreate: '20050430',
  DateStamp: '20130712',
  OBJECTID: 1,
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
      common: { names: facts.names },
      details: { brands: [{ identifiers: {}, names: { en: 'Brand' } }] },
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
  it('allows an addressless building without establishment fields and retains typed details across projection edits', () => {
    const details = projectLandsdBuildingDetails(landsd, {
      releaseId: '2026-09-21',
      geometryRevisionId: 'geometry-1',
    })
    const snapshot = LocationFactsSnapshotSchema.parse({
      schemaVersion: 1,
      kind: 'building',
      common: { names: facts.names, location: { geometry: facts.location.geometry } },
      details,
    })
    expect(snapshot).not.toHaveProperty('common.phoneNumber')
    expect(snapshot.details).not.toHaveProperty('brands')
    const projected = readLocationFacts(snapshot)
    expect(projected.phoneNumber).toEqual([])
    expect(projected.location.address.fallbackDisplay).toEqual({})
    const next = JSON.parse(
      serializeLocationFacts({ ...projected, names: { en: 'Corrected building' } }),
    )
    expect(next.details).toEqual(details)
    expect(next.common.names.en).toBe('Corrected building')
    expect(resolveFeatureLocation(projected, projected.location, {}).entity).toEqual(
      projected.entity,
    )
  })
  it('rejects establishment fields on buildings, building-only fields on establishments, and unsupported roofing/material properties', () => {
    const base = { schemaVersion: 1, common: { names: {}, location: facts.location } }
    for (const details of [
      { brands: [] },
      { operatingStatus: 'open' },
      { roofShape: 'flat' },
      { material: 'concrete' },
    ])
      expect(
        LocationFactsSnapshotSchema.safeParse({ ...base, kind: 'building', details })
          .success,
      ).toBe(false)
    expect(
      LocationFactsSnapshotSchema.safeParse({
        ...base,
        kind: 'establishment',
        details: { brands: [], storeysAboveGround: 3 },
      }).success,
    ).toBe(false)
    expect(
      LocationFactsSnapshotSchema.safeParse({
        ...base,
        kind: 'natural',
        details: { classification: { scheme: 'overture', category: 'mountain' } },
      }).success,
    ).toBe(true)
  })
  it('preserves LandsD source facts without interpreting inventory status or record dates as physical lifecycle', () => {
    const details = projectLandsdBuildingDetails(landsd)
    expect(details).toMatchObject({
      structureType: 'tower',
      storeysAboveGround: 16,
      storeysBelowGround: 0,
      elevations: { verticalDatum: 'HKPD', baseMetres: 63.1, topMetres: 66.6 },
      heightMetres: 3.5,
      heightMethod: 'top_minus_base',
      source: {
        inventory: 'landsd',
        buildingCSUID: landsd.BuildingCSUID,
        recordStatus: 'Active',
        recordCreatedOn: '2005-04-30',
      },
    })
    expect(details).not.toHaveProperty('buildingStatus')
    expect(details).not.toHaveProperty('constructionDate')
    expect(details.source).not.toHaveProperty('OBJECTID')
    expect(
      projectLandsdBuildingDetails({ ...landsd, BaseHeight: null, TopHeight: 66.6 }),
    ).not.toHaveProperty('heightMetres')
    expect(
      projectLandsdBuildingDetails({ ...landsd, BaseHeight: -16, TopHeight: -9.3 }),
    ).toMatchObject({ heightMetres: 6.7 })
    expect(
      projectLandsdBuildingDetails({ ...landsd, BaseHeight: 70, TopHeight: 66.6 }),
    ).not.toHaveProperty('heightMetres')
    expect(() =>
      projectLandsdBuildingDetails({ ...landsd, DateCreate: '20260230' }),
    ).toThrow()
  })
  it('keeps LandsD and Overture inventories distinct and pins footprint references to an immutable geometry revision', () => {
    const details = projectLandsdBuildingDetails(landsd, {
      releaseId: '2026-09-21',
      geometryRevisionId: 'geometry-1',
    })
    expect(
      BuildingDetailsSchema.safeParse({
        ...details,
        footprint: { ...details.footprint, inventory: 'overture' },
      }).success,
    ).toBe(false)
    expect(
      BuildingDetailsSchema.safeParse({
        ...details,
        footprint: {
          mode: 'reference',
          inventory: 'landsd',
          sourceRecordId: 'id',
          releaseId: 'latest',
        },
      }).success,
    ).toBe(false)
    for (const alias of ['latest', 'CURRENT'])
      for (const field of ['releaseId', 'geometryRevisionId'])
        expect(
          BuildingDetailsSchema.safeParse({
            ...details,
            footprint: { ...details.footprint, [field]: alias },
          }).success,
        ).toBe(false)
    expect(
      BuildingDetailsSchema.safeParse({ ...details, heightMetres: 66.6 }).success,
    ).toBe(false)
  })
  it('compares building-specific facts under the existing Project review policy', () => {
    const old = readLocationFacts(
      createLocationFactsSnapshot(
        { ...facts, entity: { kind: 'building', details: { storeysAboveGround: 3 } } },
        'building',
      ),
    )
    const next = {
      ...old,
      entity: { kind: 'building' as const, details: { storeysAboveGround: 4 } },
    }
    const revision = {
      id: 'old',
      locationId: 'l',
      sequence: 1,
      ssId: null,
      origin: 'local' as const,
      facts: old,
      payload: {},
    }
    const plan = planLocationAdoption({
      facts: revision,
      location: revision,
      candidate: { ...revision, id: 'new', sequence: 2, facts: next },
      overrides: {},
      policy: {
        version: 1,
        coordinates: { mode: 'automatic' },
        address: 'automatic',
        unit: 'automatic',
        establishment: 'review',
      },
    })
    expect(plan.decision.facts).toBe('review')
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
        operatingStatus: null,
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
      ).toThrow('versioned typed facts')
    } finally {
      db.close()
    }
  })
})
