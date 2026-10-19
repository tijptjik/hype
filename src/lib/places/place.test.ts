import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
import { DEFAULT_PROJECT_PLACE_POLICY, ProjectPlacePolicySchema } from './model'
import type { PlaceFacts, PlaceLocation } from './model'
import { evaluatePlaceAdoption } from './policy'
import { resolveFeaturePlace } from './resolve'

const location: PlaceLocation = {
  geometry: { type: 'Point', coordinates: [114.17, 22.3] },
  address: {
    status: 'unresolved',
    address2dId: null,
    address3dId: null,
    address3dUnitId: null,
    addressSnapshotId: null,
    records: {},
    fallbackDisplay: {},
  },
}
const moved: PlaceLocation = {
  ...location,
  geometry: { type: 'Point', coordinates: [114.1701, 22.3] },
}
const facts: PlaceFacts = {
  names: { en: 'Bakery', 'zh-Hant': '麵包店' },
  phoneNumber: ['+85221234567', '+85229876543'],
  brands: [{ identifiers: { wikidata: 'Q123' }, names: { en: 'Brand' } }],
  location: moved,
}
const evidence = {
  before: location,
  after: moved,
  addressChanged: false,
  unitChanged: false,
  establishmentChanged: false,
}

describe('project-controlled Place adoption', () => {
  test('different projects independently hold or accept the same correction', () => {
    expect(evaluatePlaceAdoption(evidence).location).toBe('review')
    const result = evaluatePlaceAdoption(evidence, {
      ...DEFAULT_PROJECT_PLACE_POLICY,
      coordinates: { mode: 'withinDistance', maxMetres: 15 },
    })
    expect(result.location).toBe('adopt')
    expect(result.distanceMetres).toBeGreaterThan(10)
    expect(result.distanceMetres).toBeLessThan(11)
    expect(
      evaluatePlaceAdoption(evidence, {
        ...DEFAULT_PROJECT_PLACE_POLICY,
        coordinates: { mode: 'withinDistance', maxMetres: 5 },
      }).location,
    ).toBe('review')
  })
  test('unit changes hold the entire location even with automatic coordinates', () => {
    expect(
      evaluatePlaceAdoption(
        { ...evidence, unitChanged: true },
        {
          ...DEFAULT_PROJECT_PLACE_POLICY,
          coordinates: { mode: 'automatic' },
        },
      ),
    ).toMatchObject({ location: 'review', facts: 'adopt', reasons: ['unit'] })
  })
  test('identity review holds both facts and location', () => {
    expect(
      evaluatePlaceAdoption({ ...evidence, establishmentChanged: true }),
    ).toMatchObject({
      location: 'review',
      facts: 'review',
    })
  })
  test('unchanged records flow and malformed policies/coordinates fail', () => {
    expect(evaluatePlaceAdoption({ ...evidence, after: location }).location).toBe(
      'adopt',
    )
    expect(
      ProjectPlacePolicySchema.safeParse({
        ...DEFAULT_PROJECT_PLACE_POLICY,
        coordinates: { mode: 'withinDistance', maxMetres: -1 },
      }).success,
    ).toBe(false)
    expect(() =>
      evaluatePlaceAdoption({
        ...evidence,
        after: { ...moved, geometry: { type: 'Point', coordinates: [NaN, 22] } },
      }),
    ).toThrow('Invalid Place coordinates')
  })
})

describe('Place inheritance', () => {
  test('retains all phones and brands while location uses its accepted revision', () => {
    expect(resolveFeaturePlace(facts, location, {})).toEqual({ ...facts, location })
  })
  test('empty collections and locale suppression survive source refresh', () => {
    expect(
      resolveFeaturePlace(facts, location, {
        phoneNumber: { mode: 'override', value: [] },
        brands: { mode: 'clear' },
        names: {
          en: { mode: 'clear' },
          fr: { mode: 'override', value: 'Boulangerie' },
        },
      }),
    ).toMatchObject({
      phoneNumber: [],
      brands: null,
      names: { en: null, 'zh-Hant': '麵包店', fr: 'Boulangerie' },
    })
  })
  test('resetting an override restores inheritance', () => {
    expect(
      resolveFeaturePlace(facts, location, { phoneNumber: { mode: 'inherit' } })
        .phoneNumber,
    ).toEqual(facts.phoneNumber)
  })
})

test('additive migration preserves features and enforces Place revision ownership', () => {
  const db = new Database(':memory:')
  try {
    db.exec(`PRAGMA foreign_keys = ON;
      CREATE TABLE project (id TEXT PRIMARY KEY);
      CREATE TABLE feature (id TEXT PRIMARY KEY, title TEXT);
      INSERT INTO project VALUES ('p');
      INSERT INTO feature VALUES ('f', 'Existing bakery');`)
    db.exec(
      readFileSync(
        new URL(
          '../../../migrations/0102_place_inheritance_foundation.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    expect(db.query('SELECT title FROM feature').get()).toEqual({
      title: 'Existing bakery',
    })
    expect(() =>
      db.exec("INSERT INTO place(id, state) VALUES ('bad', 'manual')"),
    ).toThrow()
    db.exec(
      "INSERT INTO place(id, state, ownerProjectId) VALUES ('a', 'unresolved', 'p'), ('b', 'manual', 'p')",
    )
    db.exec(`INSERT INTO placeRevision(id, placeId, sequence, origin, contentHash, payload, facts)
      VALUES ('ra', 'a', 1, 'local', 'hash', '{}', '{}'), ('rb', 'b', 1, 'local', 'hash', '{}', '{}')`)
    expect(() =>
      db.exec(
        "INSERT INTO featurePlace(featureId, placeId, factsRevisionId, locationRevisionId) VALUES ('f', 'a', 'rb', 'ra')",
      ),
    ).toThrow()
    db.exec(
      "INSERT INTO featurePlace(featureId, placeId, factsRevisionId, locationRevisionId) VALUES ('f', 'a', 'ra', 'ra')",
    )
    expect(() =>
      db.exec("UPDATE placeRevision SET contentHash = 'changed' WHERE id = 'ra'"),
    ).toThrow('immutable')
    expect(() => db.exec("DELETE FROM placeRevision WHERE id = 'ra'")).toThrow(
      'immutable',
    )
    db.exec("DELETE FROM feature WHERE id = 'f'")
    expect(db.query('SELECT * FROM featurePlace').all()).toHaveLength(0)
    expect(db.query('SELECT * FROM place').all()).toHaveLength(2)
    expect(db.query('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    db.close()
  }
})
