// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FeatureAddressSchema } from '#lib/addresses/featureAddress.js'

const migration = readFileSync('migrations/0107_feature_saanseoi_addresses.sql', 'utf8')
describe('SaanSeoi address migration', () => {
  it('archives all old fields without changing pins, display text or feature identity, and safely reruns', () => {
    const db = new DatabaseSync(':memory:')
    try {
      db.exec(`CREATE TABLE feature(id TEXT PRIMARY KEY, geometry TEXT, addressMeta TEXT);
        CREATE TABLE featureI18n(featureId TEXT, locale TEXT, displayAddress TEXT, displayAddressGen INTEGER, addressProperties TEXT);`)
      const meta = {
        googlePlaceId: 'original',
        saanseoiAddressId: 'unverified-old-id',
        addressForwardGen: false,
      }
      const geometry = { type: 'Point', coordinates: [114, 22] }
      const properties = {
        unitNumber: 'A',
        floorNumber: '3',
        rawAddress: 'Original address',
        district: null,
      }
      db.prepare('INSERT INTO feature VALUES (?,?,?)').run(
        'same-id',
        JSON.stringify(geometry),
        JSON.stringify(meta),
      )
      db.prepare('INSERT INTO featureI18n VALUES (?,?,?,?,?)').run(
        'same-id',
        'en',
        'User display',
        0,
        JSON.stringify(properties),
      )
      db.prepare('INSERT INTO featureI18n VALUES (?,?,?,?,?)').run(
        'same-id',
        'zh-hant',
        '原有地址',
        1,
        '{}',
      )
      db.exec(migration)
      const row = db.prepare('SELECT * FROM feature').get()!
      const migrated = JSON.parse(String(row.addressMeta))
      expect(row.id).toBe('same-id')
      expect(JSON.parse(String(row.geometry))).toEqual(geometry)
      const address = FeatureAddressSchema.parse(migrated.address)
      expect(address.source.status).toBe('unresolved')
      expect(address.source.address2dId).toBeNull()
      expect(address.source.fallbackDisplay).toEqual({
        en: 'User display',
        'zh-hant': '原有地址',
      })
      expect(address.legacy).toEqual({
        addressMeta: meta,
        i18n: {
          en: {
            displayAddress: 'User display',
            displayAddressGen: 0,
            addressProperties: properties,
          },
          'zh-hant': {
            displayAddress: '原有地址',
            displayAddressGen: 1,
            addressProperties: {},
          },
        },
      })
      expect(
        db
          .prepare(
            'SELECT displayAddress, addressProperties FROM featureI18n WHERE locale=?',
          )
          .get('en'),
      ).toEqual({ displayAddress: 'User display', addressProperties: '{}' })
      // An older importer may still write legacy evidence: reruns must not erase it.
      db.exec(
        `UPDATE featureI18n SET addressProperties='{"rawAddress":"later import"}' WHERE locale='en';`,
      )
      db.exec(migration)
      expect(db.prepare('SELECT addressMeta FROM feature').get()?.addressMeta).toBe(
        row.addressMeta,
      )
      expect(
        db.prepare('SELECT addressProperties FROM featureI18n WHERE locale=?').get('en')
          ?.addressProperties,
      ).toBe('{"rawAddress":"later import"}')
    } finally {
      db.close()
    }
  })
})

it('renames retained source keys and corrections while preserving legacy evidence', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec('CREATE TABLE feature (id TEXT, addressMeta TEXT)')
    db.prepare('INSERT INTO feature VALUES (?,?)').run(
      'same',
      JSON.stringify({
        address: {
          version: 1,
          source: {
            records: {
              data: { attributes: { i18n: { en: { estateName: 'Source' } } } },
            },
          },
          overrides: { en: { estateName: 'Correction' } },
          legacy: { estateName: 'Original evidence' },
        },
      }),
    )
    const rename = readFileSync(
      'migrations/0108_feature_address_premises_name.sql',
      'utf8',
    )
    db.exec(rename)
    const once = db.prepare('SELECT addressMeta FROM feature').get()!
    const address = JSON.parse(String(once.addressMeta)).address
    expect(address.source.records.data.attributes.i18n.en).toEqual({
      premisesName: 'Source',
    })
    expect(address.overrides.en).toEqual({ premisesName: 'Correction' })
    expect(address.legacy.estateName).toBe('Original evidence')
    db.exec(rename)
    expect(db.prepare('SELECT addressMeta FROM feature').get()).toEqual(once)
  } finally {
    db.close()
  }
})
