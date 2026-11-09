import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
import { DEFAULT_PROJECT_LOCATION_POLICY, ProjectLocationPolicySchema } from './model'
import type { LocationFacts, LocationPosition } from './model'
import { evaluateLocationAdoption } from './policy'
import { resolveFeatureLocation } from './resolve'
import { applyFeatureLocationEdits } from './edits'
import { preserveFeatureLocationBaseline } from './baseline'

const location: LocationPosition = {
  geometry: { type: 'Point', coordinates: [114.17, 22.3] },
  address: {
    status: 'unresolved',
    address2dId: null,
    address3dId: null,
    address3dUnitId: null,
    snapshotId: null,
    rawSource: {},
    fallbackDisplay: {},
  },
}
const moved: LocationPosition = {
  ...location,
  geometry: { type: 'Point', coordinates: [114.1701, 22.3] },
}
const facts: LocationFacts = {
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

describe('project-controlled Location adoption', () => {
  test('different projects independently hold or accept the same correction', () => {
    expect(evaluateLocationAdoption(evidence).location).toBe('review')
    const result = evaluateLocationAdoption(evidence, {
      ...DEFAULT_PROJECT_LOCATION_POLICY,
      coordinates: { mode: 'withinDistance', maxMetres: 15 },
    })
    expect(result.location).toBe('adopt')
    expect(result.distanceMetres).toBeGreaterThan(10)
    expect(result.distanceMetres).toBeLessThan(11)
    expect(
      evaluateLocationAdoption(evidence, {
        ...DEFAULT_PROJECT_LOCATION_POLICY,
        coordinates: { mode: 'withinDistance', maxMetres: 5 },
      }).location,
    ).toBe('review')
  })
  test('unit changes hold the entire location even with automatic coordinates', () => {
    expect(
      evaluateLocationAdoption(
        { ...evidence, unitChanged: true },
        {
          ...DEFAULT_PROJECT_LOCATION_POLICY,
          coordinates: { mode: 'follow' },
        },
      ),
    ).toMatchObject({ location: 'review', facts: 'adopt', reasons: ['unit'] })
  })
  test('identity review holds both facts and location', () => {
    expect(
      evaluateLocationAdoption({ ...evidence, establishmentChanged: true }),
    ).toMatchObject({
      location: 'review',
      facts: 'review',
    })
  })
  test('unchanged records flow and malformed policies/coordinates fail', () => {
    expect(evaluateLocationAdoption({ ...evidence, after: location }).location).toBe(
      'adopt',
    )
    expect(
      ProjectLocationPolicySchema.safeParse({
        ...DEFAULT_PROJECT_LOCATION_POLICY,
        coordinates: { mode: 'withinDistance', maxMetres: -1 },
      }).success,
    ).toBe(false)
    expect(() =>
      evaluateLocationAdoption({
        ...evidence,
        after: { ...moved, geometry: { type: 'Point', coordinates: [NaN, 22] } },
      }),
    ).toThrow('Invalid Location coordinates')
  })
})

describe('Location inheritance', () => {
  test('retains all phones and brands while location uses its accepted revision', () => {
    expect(resolveFeatureLocation(facts, location, {})).toEqual({ ...facts, location })
  })
  test('empty collections and locale suppression survive source refresh', () => {
    expect(
      resolveFeatureLocation(facts, location, {
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
      resolveFeatureLocation(facts, location, { phoneNumber: { mode: 'inherit' } })
        .phoneNumber,
    ).toEqual(facts.phoneNumber)
  })
})

test('additive migration preserves features and enforces Location revision ownership', () => {
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

describe('initial Feature–Location baseline preservation', () => {
  test('equal fields inherit and continue receiving upstream updates', () => {
    const baseline = { ...facts, location }
    const overrides = preserveFeatureLocationBaseline(baseline, facts, location)
    expect(overrides).toEqual({})
    expect(
      resolveFeatureLocation({ ...facts, names: { en: 'New name' } }, moved, overrides),
    ).toEqual({ ...facts, names: { en: 'New name' }, location: moved })
  })

  test('preserves differing translations, empty arrays, and the entire location', () => {
    const baseline = {
      names: { en: 'Collection counter', fr: 'Boulangerie' },
      phoneNumber: [],
      brands: [],
      location,
    }
    const overrides = preserveFeatureLocationBaseline(baseline, facts, moved)
    expect(overrides.names?.['zh-Hant']).toEqual({ mode: 'clear' })
    expect(overrides.phoneNumber).toEqual({ mode: 'override', value: [] })
    expect(overrides.location).toEqual({ mode: 'override', value: location })
    expect(resolveFeatureLocation(facts, moved, overrides)).toEqual({
      ...baseline,
      names: { ...baseline.names, 'zh-Hant': null },
    })
    expect(
      resolveFeatureLocation(
        { ...facts, names: { ...facts.names, es: 'Panadería' } },
        moved,
        overrides,
      ).names.es,
    ).toBe('Panadería')
  })

  test('keeps explicit suppression distinct from empty collections', () => {
    const baseline = {
      names: { en: null, fr: null },
      phoneNumber: null,
      brands: null,
      location: null,
    }
    const overrides = preserveFeatureLocationBaseline(baseline, facts, location)
    expect(overrides.names?.fr).toEqual({ mode: 'clear' })
    expect(overrides.phoneNumber).toEqual({ mode: 'clear' })
    expect(overrides.brands).toEqual({ mode: 'clear' })
    expect(overrides.location).toEqual({ mode: 'clear' })
    expect(resolveFeatureLocation(facts, moved, overrides)).toEqual({
      ...baseline,
      names: { en: null, fr: null, 'zh-Hant': null },
    })
  })

  test('ignores object key order but preserves array order and copies corrections', () => {
    const baseline = structuredClone({ ...facts, location })
    baseline.location.geometry = { coordinates: [114.17, 22.3], type: 'Point' }
    baseline.brands[0] = { names: { en: 'Brand' }, identifiers: { wikidata: 'Q123' } }
    expect(preserveFeatureLocationBaseline(baseline, facts, location)).toEqual({})
    baseline.phoneNumber.reverse()
    const overrides = preserveFeatureLocationBaseline(baseline, facts, location)
    baseline.phoneNumber.push('+85221111111')
    expect(resolveFeatureLocation(facts, location, overrides).phoneNumber).toEqual([
      '+85229876543',
      '+85221234567',
    ])
  })
})

describe('persisted association privacy', () => {
  test('guards links and ancestry changes while allowing shared Locations', () => {
    const db = new Database(':memory:')
    try {
      db.exec(`PRAGMA foreign_keys=ON;
        CREATE TABLE project(id TEXT PRIMARY KEY);
        CREATE TABLE feature(id TEXT PRIMARY KEY, projectId TEXT NOT NULL, isDraft INTEGER NOT NULL DEFAULT 0);
        INSERT INTO project VALUES ('p'), ('q');
        INSERT INTO feature(id,projectId,isDraft) VALUES ('f','p',0), ('other','q',0), ('draft','p',1);`)
      db.exec(readFileSync('migrations/0102_place_inheritance_foundation.sql', 'utf8'))
      db.exec(readFileSync('migrations/0109_place_association_scope.sql', 'utf8'))
      db.exec(`INSERT INTO place(id,state,ownerProjectId) VALUES ('local','manual','p');
        INSERT INTO place(id,state,ssId) VALUES ('shared','linked','ss');`)
      const insertRevision =
        db.prepare(`INSERT INTO placeRevision(id,placeId,sequence,origin,contentHash,payload,facts)
        VALUES (?, ?, 1, 'local', 'hash', '{}', ?)`)
      insertRevision.run('lr', 'local', JSON.stringify(facts))
      insertRevision.run('sr', 'shared', JSON.stringify(facts))
      const link = db.prepare(
        `INSERT INTO featurePlace(featureId,placeId,factsRevisionId,locationRevisionId) VALUES (?,?,?,?)`,
      )
      expect(() => link.run('other', 'local', 'lr', 'lr')).toThrow('scope mismatch')
      expect(() => link.run('draft', 'shared', 'sr', 'sr')).toThrow('scope mismatch')
      link.run('f', 'local', 'lr', 'lr')
      expect(() => db.exec("UPDATE feature SET projectId='q' WHERE id='f'")).toThrow(
        'scope mismatch',
      )
      expect(() => db.exec("UPDATE feature SET isDraft=1 WHERE id='f'")).toThrow(
        'scope mismatch',
      )
      expect(() =>
        db.exec("UPDATE place SET ownerProjectId='q' WHERE id='local'"),
      ).toThrow('scope mismatch')
      link.run('other', 'shared', 'sr', 'sr')
      expect(() =>
        db.exec(
          "UPDATE featurePlace SET placeId='local', factsRevisionId='lr', locationRevisionId='lr' WHERE featureId='other'",
        ),
      ).toThrow('scope mismatch')
      expect(() =>
        db.exec("UPDATE place SET ownerProjectId='p' WHERE id='shared'"),
      ).toThrow('scope mismatch')
      db.exec("UPDATE feature SET projectId='p' WHERE id='other'")
      expect(db.query('SELECT count(*) AS n FROM featurePlace').get()).toEqual({ n: 2 })
      expect(db.query('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      db.close()
    }
  })
})

describe('normal Feature edits on inherited values', () => {
  test('unchanged values keep inheriting while explicit existing choices survive', () => {
    const before = { ...facts, location }
    const current = {
      names: { en: { mode: 'override' as const, value: facts.names.en } },
    }
    expect(applyFeatureLocationEdits(current, before, structuredClone(before))).toEqual(
      current,
    )
    expect(applyFeatureLocationEdits({}, before, structuredClone(before))).toEqual({})
  })
  test('only edited locales and arrays change, with atomic location replacement', () => {
    const before = { ...facts, location }
    const after = {
      ...before,
      names: { ...before.names, en: 'Local title' },
      phoneNumber: [],
      location: structuredClone(moved),
    }
    const overrides = applyFeatureLocationEdits({}, before, after)
    expect(overrides).toEqual({
      names: { en: { mode: 'override', value: 'Local title' } },
      phoneNumber: { mode: 'override', value: [] },
      location: { mode: 'override', value: moved },
    })
    expect(resolveFeatureLocation(facts, location, overrides)).toEqual(after)
    after.location.geometry.coordinates[0] += 1
    expect(overrides.location).not.toEqual({ mode: 'override', value: after.location })
  })
  test('clears removed translations without suppressing untouched locales', () => {
    const before = { ...facts, location }
    const after = { ...before, names: { en: facts.names.en }, brands: null }
    const overrides = applyFeatureLocationEdits({}, before, after)
    expect(overrides).toEqual({
      names: { 'zh-Hant': { mode: 'clear' } },
      brands: { mode: 'clear' },
    })
  })
})
