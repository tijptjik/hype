// @vitest-environment node
// TESTING
import { expect, it } from 'vitest'
// SERVICES
import {
  createI18n,
  createPropertyValues,
  updateI18n,
  updatePropertyValueI18n,
} from '#lib/db/services/property.js'
import { propertyLocalesToForm } from '#lib/properties/locales.js'
import {
  PropertyI18nByLocaleFormData,
  PropertyValueI18nByLocaleFormData,
} from '#lib/db/zod/schema/property.js'
import { toHubFormInput } from '#lib/client/services/hub.js'
import { toProjectFormInput } from '#lib/client/services/project.js'
import { toOrganisationFormInput } from '#lib/client/services/organisation.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
// TYPES
import type { Database } from '#lib/types.js'

it('validates partial content-language coverage while rejecting blank labels and alias collisions', () => {
  expect(
    PropertyI18nByLocaleFormData.parse({ en: { label: 'Religion' }, ja: { label: '' } })
      .ja.label,
  ).toBe('')
  expect(PropertyI18nByLocaleFormData.safeParse({ ja: { label: '' } }).success).toBe(
    false,
  )
  expect(
    PropertyValueI18nByLocaleFormData.parse({
      ja: { value: '宗教' },
      zhHant: { value: '' },
    }).ja.value,
  ).toBe('宗教')
  expect(() =>
    propertyLocalesToForm([
      { locale: 'zh-Hant', value: 'A' },
      { locale: 'zhHant', value: 'B' },
    ]),
  ).toThrow('collision')
  expect(() =>
    propertyLocalesToForm({ 'zh-Hant': { value: 'A' }, zhHant: { value: 'B' } }),
  ).toThrow('collision')
})

it.each([
  ['Hub', toHubFormInput],
  ['Project', toProjectFormInput],
  ['Organisation', toOrganisationFormInput],
] as const)(
  'retains Japanese and legacy Chinese translations through %s form initialization',
  (_name, toFormInput) => {
    const property = {
      id: 'religion',
      i18n: {
        en: { label: 'Religion' },
        ja: { label: '宗教' },
        zhHant: { label: '宗教' },
      },
      values: [
        {
          id: 'christian',
          i18n: { ja: { value: 'キリスト教' }, zhHant: { value: '基督教' } },
        },
      ],
    }
    const form = toFormInput({
      id: 'hub',
      code: 'hub',
      i18n: {},
      properties: [property],
    } as never)
    expect(form.data.properties?.[0].i18n).toMatchObject(property.i18n)
    expect(form.data.properties?.[0].values?.[0].i18n).toMatchObject(
      property.values[0].i18n,
    )
  },
)

it('persists added languages and legacy Chinese tags without overwriting English or option identity', async () => {
  const { db, sqlite } = publicationSqlite({})
  try {
    sqlite.exec(`CREATE TABLE property(id TEXT PRIMARY KEY);
      CREATE TABLE propertyI18n(propertyId TEXT,locale TEXT,label TEXT,labelGen INTEGER,placeholder TEXT,placeholderGen INTEGER);
      CREATE TABLE propertyValue(id TEXT PRIMARY KEY,propertyId TEXT,rank INTEGER,value TEXT);
      CREATE TABLE propertyValueI18n(propertyValueId TEXT,locale TEXT,value TEXT,valueGen INTEGER,PRIMARY KEY(propertyValueId,locale));
      INSERT INTO property VALUES ('religion');`)
    const labelRows = PropertyI18nByLocaleFormData.parse({
      en: { label: 'Religion' },
      ja: { label: '宗教' },
      'zh-Hant': { label: '宗教' },
    })
    await createI18n(db as unknown as Database, labelRows as never, 'religion')
    const [option] = await createPropertyValues(
      db as unknown as Database,
      [
        {
          id: 'christian',
          rank: 0,
          i18n: {
            en: { value: 'Christian' },
            ja: { value: 'キリスト教' },
            zhHant: { value: '基督教' },
          },
        },
      ],
      'religion',
    )
    expect(option.id).toBe('christian')
    expect(
      sqlite.prepare('SELECT locale,label FROM propertyI18n ORDER BY locale').all(),
    ).toEqual([
      { locale: 'en', label: 'Religion' },
      { locale: 'ja', label: '宗教' },
      { locale: 'zh-hant', label: '宗教' },
    ])
    const values = sqlite
      .prepare('SELECT locale,value FROM propertyValueI18n WHERE propertyValueId=?')
      .all(option.id)
    expect(propertyLocalesToForm(values)).toMatchObject({
      en: { value: 'Christian' },
      ja: { value: 'キリスト教' },
      zhHant: { value: '基督教' },
    })
  } finally {
    sqlite.close()
  }
})

it('omits empty locale controls and removes cleared translations while retaining placeholder-only text', async () => {
  const { db, sqlite } = publicationSqlite({})
  try {
    sqlite.exec(`CREATE TABLE propertyI18n(propertyId TEXT,locale TEXT,label TEXT,labelGen INTEGER,placeholder TEXT,placeholderGen INTEGER);
      CREATE TABLE propertyValueI18n(propertyValueId TEXT,locale TEXT,value TEXT,valueGen INTEGER);`)
    await createI18n(
      db as unknown as Database,
      {
        en: { label: 'Grade', placeholder: 'Select grade' },
        ja: { label: '', placeholder: '', labelGen: true },
        ko: { label: '  ', placeholder: null },
        fr: { label: '', placeholder: 'Choisir', placeholderGen: true },
      } as never,
      'grade',
    )
    expect(
      sqlite
        .prepare(
          'SELECT locale,label,placeholder,placeholderGen FROM propertyI18n ORDER BY locale',
        )
        .all(),
    ).toEqual([
      { locale: 'en', label: 'Grade', placeholder: 'Select grade', placeholderGen: 1 },
      { locale: 'fr', label: '', placeholder: 'Choisir', placeholderGen: 1 },
    ])
    await updateI18n(
      db as unknown as Database,
      {
        en: { label: 'Grade' },
        fr: { label: '', placeholder: '' },
      } as never,
      'grade',
    )
    expect(sqlite.prepare('SELECT locale FROM propertyI18n').all()).toEqual([
      { locale: 'en' },
    ])
    sqlite.exec("INSERT INTO propertyValueI18n VALUES ('v','ja','古い',0)")
    await updatePropertyValueI18n(
      db as unknown as Database,
      {
        ja: { value: ' ' },
        ko: { value: '', valueGen: true },
        fr: { value: 'Option', valueGen: false },
      } as never,
      'v',
    )
    expect(
      sqlite.prepare('SELECT locale,value,valueGen FROM propertyValueI18n').all(),
    ).toEqual([{ locale: 'fr', value: 'Option', valueGen: 0 }])
  } finally {
    sqlite.close()
  }
})
