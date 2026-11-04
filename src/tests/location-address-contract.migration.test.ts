// @vitest-environment node
// TESTS
import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import {
  LocationFactsSnapshotSchema,
  createLocationFactsSnapshot,
} from '#lib/locations/factsSnapshot.js'
import { LocalLocationInputSchema } from '#lib/locations/local.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'

const migration = readFileSync('migrations/0144_location_address_contract.sql', 'utf8')
const columns: Record<string, string[]> = {
  locationRevision: ['facts'],
  feature: ['addressMeta'],
  featureLocation: ['acceptedOverrides'],
  featureLocationHistory: ['acceptedOverrides'],
  organisationLocation: ['overrides', 'history'],
  locationAdoptionProposal: ['evidence'],
  locationIdentityReview: ['baseline', 'projection', 'mergeReviews'],
  locationRefreshItem: ['projection'],
}

/** Build populated contract columns without requiring unrelated application tables.
 * @returns Disposable SQLite database with retained records and migration guards.
 */
function setup(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  for (const [table, fields] of Object.entries(columns))
    db.exec(
      `CREATE TABLE ${table}(id TEXT,locationId TEXT,sequence INTEGER,${fields.map(field => `${field} TEXT`).join(',')});`,
    )
  db.exec(
    "CREATE TABLE location(id TEXT,kind TEXT); INSERT INTO location VALUES ('place','unknown');",
  )
  // Migration restores the real guards; these initial guards fence the same affected tables.
  const dropped = [...migration.matchAll(/DROP TRIGGER (\w+);/g)].map(match => match[1])
  for (const name of dropped)
    db.exec(
      `CREATE TRIGGER ${name} BEFORE UPDATE ON locationRevision BEGIN SELECT RAISE(ABORT,'immutable'); END;`,
    )
  return db
}

const facts = {
  names: { en: 'Example' },
  phoneNumber: [],
  brands: [],
  location: {
    geometry: { type: 'Point' as const, coordinates: [114, 22] as [number, number] },
    address: emptyFeatureAddress().source,
  },
}

describe('strict Location kinds', () => {
  it('classifies unknown brands and building status, and rejects contradictory facts', () => {
    const branded = { ...facts, brands: [{ identifiers: {}, names: { en: 'Brand' } }] }
    expect(createLocationFactsSnapshot(branded, 'unknown').kind).toBe('establishment')
    expect(
      LocalLocationInputSchema.parse({
        state: 'manual',
        kind: 'unknown',
        facts: branded,
      }).kind,
    ).toBe('establishment')
    expect(
      createLocationFactsSnapshot({ ...facts, buildingStatus: 'standing' }, 'unknown')
        .kind,
    ).toBe('building')
    expect(() =>
      createLocationFactsSnapshot(
        { ...branded, buildingStatus: 'standing' },
        'unknown',
      ),
    ).toThrow('Conflicting')
    expect(
      LocationFactsSnapshotSchema.safeParse({
        schemaVersion: 1,
        kind: 'unknown',
        common: { names: {}, location: facts.location },
        details: { brands: [] },
      }).success,
    ).toBe(false)
  })
})

describe('Address contract migration', () => {
  it('converts all saved envelopes while preserving raw publication evidence and restoring immutability', () => {
    const db = setup()
    try {
      const raw = {
        data: {
          attributes: {
            addressSnapshotId: 'upstream-pin',
            records: { untouched: true },
          },
        },
      }
      const address = {
        status: 'resolved',
        address2dId: 'address',
        addressSnapshotId: 'pin',
        records: raw,
        divisionOverrides: {
          neighbourhoodId: 'hood',
          localityPaths: [['macro', 'hood']],
        },
      }
      const document = { address, payload: { address }, legacy: { address } }
      for (const [table, fields] of Object.entries(columns))
        for (const field of fields)
          db.prepare(`INSERT INTO ${table}(id,${field}) VALUES (?,?)`).run(
            field,
            JSON.stringify(document),
          )
      db.prepare(
        'INSERT INTO locationRevision(id,locationId,sequence,facts) VALUES (?,?,?,?)',
      ).run(
        'revision',
        'place',
        1,
        JSON.stringify({
          schemaVersion: 1,
          kind: 'unknown',
          common: {
            names: {},
            location: { geometry: facts.location.geometry, address },
          },
          details: {
            brands: [{ identifiers: {}, names: { en: 'Brand' } }],
            buildingStatus: null,
          },
        }),
      )
      db.exec('BEGIN')
      db.exec(migration)
      db.exec('COMMIT')
      for (const [table, fields] of Object.entries(columns)) {
        for (const field of fields) {
          const row = db
            .prepare(`SELECT ${field} AS body FROM ${table} WHERE id=?`)
            .get(field)!
          const value = JSON.parse(String(row.body))
          expect(value.address).toEqual({
            status: 'resolved',
            address2dId: 'address',
            snapshotId: 'pin',
            rawSource: raw,
            divisionOverrides: { localityPath: ['macro', 'hood'] },
          })
          expect(value.payload).toEqual(document.payload)
          expect(value.legacy).toEqual(document.legacy)
        }
      }
      const revision = JSON.parse(
        String(
          db.prepare("SELECT facts FROM locationRevision WHERE id='revision'").get()!
            .facts,
        ),
      )
      expect(revision.kind).toBe('establishment')
      expect(revision.details).not.toHaveProperty('buildingStatus')
      expect(db.prepare('SELECT kind FROM location').get()!.kind).toBe('establishment')
      expect(() => db.exec("UPDATE locationRevision SET facts='{}'")).toThrow(
        'immutable',
      )
    } finally {
      db.close()
    }
  })
  it('aborts contradictory legacy facts before changing data', () => {
    const db = setup()
    try {
      const value = JSON.stringify({
        schemaVersion: 1,
        kind: 'unknown',
        details: { brands: [{}], buildingStatus: 'standing' },
      })
      db.prepare('INSERT INTO locationRevision(facts) VALUES (?)').run(value)
      db.exec('BEGIN')
      expect(() => db.exec(migration)).toThrow('CHECK')
      db.exec('ROLLBACK')
      expect(db.prepare('SELECT facts FROM locationRevision').get()!.facts).toBe(value)
    } finally {
      db.close()
    }
  })
})

it('migrates authored premises type into every locale without changing source evidence', () => {
  const db = setup()
  try {
    const authored = {
      granularity: 'complex',
      i18n: {
        en: { formattedAddress: 'Example', premisesName: 'Example estate' },
        'zh-hant': { formattedAddress: '示例', premisesName: '示例屋苑' },
      },
      unit: null,
      unitI18n: {},
    }
    const document = {
      address: { authored },
      payload: { authored },
      rawSource: { authored },
    }
    for (const [table, fields] of Object.entries(columns))
      for (const field of fields)
        db.prepare(`INSERT INTO ${table}(id,${field}) VALUES (?,?)`).run(
          field,
          JSON.stringify(document),
        )
    db.exec('BEGIN')
    db.exec(readFileSync('migrations/0145_address_premises_i18n.sql', 'utf8'))
    db.exec('COMMIT')
    for (const [table, fields] of Object.entries(columns))
      for (const field of fields) {
        const value = JSON.parse(
          String(
            db.prepare(`SELECT ${field} AS body FROM ${table} WHERE id=?`).get(field)!
              .body,
          ),
        )
        expect(value.address.authored.scope).toBe('premises')
        expect(value.address.authored).not.toHaveProperty('granularity')
        expect(value.address.authored).not.toHaveProperty('premisesType')
        expect(value.address.authored.i18n.en).toEqual({
          ...authored.i18n.en,
          premisesType: 'complex',
        })
        expect(value.address.authored.i18n['zh-hant']).toEqual({
          ...authored.i18n['zh-hant'],
          premisesType: 'complex',
        })
        expect(value.payload).toEqual(document.payload)
        expect(value.rawSource).toEqual(document.rawSource)
      }
    expect(() => db.exec("UPDATE locationRevision SET facts='{}'")).toThrow('immutable')
  } finally {
    db.close()
  }
})

it('rejects conflicting per-locale premises types before migrating application rows', () => {
  const db = setup()
  try {
    const value = JSON.stringify({
      address: {
        authored: {
          scope: 'building',
          i18n: {
            en: { formattedAddress: '', premisesType: 'site' },
            'zh-hant': { formattedAddress: '', premisesType: 'complex' },
          },
          unit: null,
          unitI18n: {},
        },
      },
    })
    db.prepare('INSERT INTO feature(addressMeta) VALUES (?)').run(value)
    db.exec('BEGIN')
    expect(() =>
      db.exec(readFileSync('migrations/0145_address_premises_i18n.sql', 'utf8')),
    ).toThrow('CHECK')
    db.exec('ROLLBACK')
    expect(db.prepare('SELECT addressMeta FROM feature').get()!.addressMeta).toBe(value)
  } finally {
    db.close()
  }
})

it('removes entity fields from authored addresses while archiving originals and preserving raw source', () => {
  const db = setup()
  try {
    const original = {
      address: {
        authored: {
          scope: 'building',
          parentAddressId: 'estate',
          i18n: {
            en: {
              formattedAddress: 'Example Estate',
              premisesName: 'Example Estate',
              premisesType: 'complex',
              premisesKind: 'estate',
            },
          },
          unit: null,
          unitI18n: {},
        },
        rawSource: { parentAddressId: 'publisher-parent', premisesType: 'complex' },
      },
    }
    db.prepare(
      'INSERT INTO locationRevision(id,locationId,sequence,facts) VALUES (?,?,?,?)',
    ).run('revision', 'location', 1, JSON.stringify(original))
    db.exec(readFileSync('migrations/0146_address_content_boundary.sql', 'utf8'))
    const row = db.prepare('SELECT id,sequence,facts FROM locationRevision').get() as {
      id: string
      sequence: number
      facts: string
    }
    const result = JSON.parse(row.facts)
    expect(row.id).toBe('revision')
    expect(row.sequence).toBe(1)
    expect(result.address.authored).not.toHaveProperty('parentAddressId')
    expect(result.address.authored.i18n.en).toEqual({
      formattedAddress: 'Example Estate',
      premisesName: 'Example Estate',
    })
    expect(result.address.rawSource).toEqual(original.address.rawSource)
    const archived = db
      .prepare('SELECT body FROM addressContentMigrationEvidence')
      .get() as { body: string }
    expect(JSON.parse(archived.body)).toEqual(original.address.authored)
  } finally {
    db.close()
  }
})
