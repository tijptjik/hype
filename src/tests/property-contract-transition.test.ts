// @vitest-environment node
// TESTING
import { expect, it } from 'vitest'
// SERVICES
import {
  isCompatiblePropertyTransition,
  preparePropertyContractTransition,
} from '#lib/db/services/propertyContractTransition.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
// TYPES
import type { Database } from '#lib/types.js'

const text = {
  component: 'InputField',
  dataType: 'text',
  cardinality: 'one',
  isTranslatable: false,
  dateResolution: 'day',
  timeMaxHour: 24,
}

it.each([
  ['TextareaField', 'text', 'free text', true],
  ['InputField', 'number', '12.50', true],
  ['InputField', 'number', 'twelve', false],
  ['InputField', 'date', '2026-02-30', false],
  ['InputField', 'date', '2026-11-11', true],
  ['InputField', 'boolean', 'true', true],
  ['InputField', 'boolean', 'yes', false],
  ['PhoneField', 'text', '+852 9123 4567', true],
  ['PhoneField', 'text', 'not a phone', false],
  ['SelectField', 'text', '12', false],
  ['LinkField', 'link', 'https://example.com', false],
] as const)(
  'validates %s / %s without rewriting %s',
  (component, dataType, value, allowed) => {
    expect(
      isCompatiblePropertyTransition(text, { ...text, component, dataType }, [
        ['f', value, null, null, []],
      ]),
    ).toBe(allowed)
  },
)

it('rejects translated, option and structured data that the target cannot preserve', () => {
  const phone = { ...text, component: 'PhoneField' }
  for (const row of [
    ['f', '+85291234567', null, null, ['translated']],
    ['f', null, 'option', null, []],
    ['f', null, null, '{}', []],
  ] as Array<[string, string | null, string | null, string | null, string[]]>) {
    expect(isCompatiblePropertyTransition(text, phone, [row])).toBe(false)
  }
  expect(
    isCompatiblePropertyTransition(phone, text, [
      ['f', '["+85291234567"]', null, null, []],
    ]),
  ).toBe(false)
})

it('guards compatible values against concurrent edits before the catalogue write', async () => {
  const { sqlite, db } = publicationSqlite({})
  try {
    sqlite.exec(`CREATE TABLE featureProperty(featureId TEXT,propertyId TEXT,value TEXT,propertyValueId TEXT,valueJson TEXT);
      CREATE TABLE featurePropertyI18n(featureId TEXT,propertyId TEXT,locale TEXT,value TEXT);
      INSERT INTO featureProperty VALUES ('f','p','12',NULL,NULL);`)
    const { check } = await preparePropertyContractTransition(
      db as unknown as Database,
      'p',
      text,
      { ...text, dataType: 'number' },
    )
    await expect(db.batch([check as never])).resolves.toBeDefined()
    sqlite.exec("UPDATE featureProperty SET value='twelve'")
    await expect(db.batch([check as never])).rejects.toThrow()
    await expect(
      preparePropertyContractTransition(db as unknown as Database, 'p', text, {
        ...text,
        dataType: 'number',
      }),
    ).rejects.toMatchObject({ status: 400 })
  } finally {
    sqlite.close()
  }
})
