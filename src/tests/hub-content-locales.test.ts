// @vitest-environment node
// TESTING
import { expect, it } from 'vitest'
// DRIZZLE
import { getTableColumns, getTableName } from 'drizzle-orm'
// SERVICES
import { toHubFormInput } from '#lib/client/services/hub.js'
import { contentRowsToForm, contentFormKey } from '#lib/i18n/contentRecords.js'
import { createI18n, updateI18n } from '#lib/db/services/hub.js'
import {
  HubI18nByLocaleFormData,
  HubI18nBase,
  HubListProfileAPI,
} from '#lib/db/zod/schema/hub.js'
import { hubI18n } from '#lib/db/schema/hub.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
// TYPES
import type { Database } from '#lib/types.js'

const translations = {
  en: {
    name: 'Hub',
    nameShort: 'Hub',
    privacyPolicy: 'English privacy',
    termsOfService: 'English terms',
  },
  ja: {
    name: 'ハブ',
    nameShort: 'ハブ',
    description: '説明',
    privacyPolicy: 'プライバシー',
    termsOfService: '利用規約',
    privacyPolicyGen: false,
  },
  'pt-BR': {
    privacyPolicy: 'Privacidade',
    termsOfService: 'Termos',
    termsOfServiceGen: true,
  },
  ko: {
    name: '',
    nameShort: ' ',
    privacyPolicy: '',
    termsOfService: ' ',
    privacyPolicyGen: true,
  },
  zhHant: { name: '中心', nameShort: '中心', privacyPolicy: '私隱' },
}

it('accepts partial coverage and regional tags but rejects invalid or colliding identities', () => {
  const parsed = HubI18nByLocaleFormData.parse(translations)
  expect(parsed[contentFormKey('pt-BR')].name).toBe('')
  expect(parsed.ja.privacyPolicy).toBe('プライバシー')
  expect(HubI18nByLocaleFormData.safeParse({}).success).toBe(false)
  expect(
    HubI18nByLocaleFormData.safeParse({ ja: { privacyPolicy: 'Only policy' } }).success,
  ).toBe(false)
  expect(
    HubI18nByLocaleFormData.safeParse({ ...translations, not_a_locale: {} }).success,
  ).toBe(false)
  expect(
    HubI18nByLocaleFormData.safeParse({ ...translations, 'zh-Hant': {} }).success,
  ).toBe(false)
})

it('round-trips all hub fields and provenance through SQLite, API validation and form reload', async () => {
  const { db, sqlite } = publicationSqlite({})
  try {
    sqlite.exec(
      `CREATE TABLE "${getTableName(hubI18n)}" (${Object.values(
        getTableColumns(hubI18n),
      )
        .map(column => `"${column.name}" ${column.getSQLType()}`)
        .join(',')}, PRIMARY KEY(hubId,locale))`,
    )
    const parsed = HubI18nByLocaleFormData.parse(translations)
    await createI18n(db as unknown as Database, parsed, 'h')
    const read = () =>
      sqlite
        .prepare('SELECT * FROM hubI18n WHERE hubId=?')
        .all('h')
        .map(row =>
          HubI18nBase.parse(
            Object.fromEntries(
              Object.entries(row).map(([key, value]) => [
                key,
                key.endsWith('Gen') && value !== null ? Boolean(value) : value,
              ]),
            ),
          ),
        )
    const rows = read()
    expect(rows.map(row => row.locale).sort()).toEqual(['en', 'ja', 'pt-BR', 'zh-hant'])
    const apiMap = HubListProfileAPI.shape.i18n.parse(contentRowsToForm(rows))
    const form = toHubFormInput({ id: 'h', code: 'hub', i18n: apiMap } as never)
    expect(form.data.i18n.ja).toMatchObject(translations.ja)
    expect(form.data.i18n[contentFormKey('pt-BR')]).toMatchObject(translations['pt-BR'])
    form.data.i18n.ja.description = '更新'
    await updateI18n(
      db as unknown as Database,
      HubI18nByLocaleFormData.parse(form.data.i18n),
      'h',
    )
    expect(contentRowsToForm(read()).ja.description).toBe('更新')
    expect(contentRowsToForm(read())[contentFormKey('pt-BR')].termsOfService).toBe(
      'Termos',
    )
    expect(contentRowsToForm(read()).en.privacyPolicy).toBe('English privacy')
    form.data.i18n[contentFormKey('pt-BR')] = {
      name: '',
      nameShort: '',
      privacyPolicy: ' ',
      termsOfService: '',
      termsOfServiceGen: true,
    }
    await updateI18n(
      db as unknown as Database,
      HubI18nByLocaleFormData.parse(form.data.i18n),
      'h',
    )
    expect(contentRowsToForm(read())[contentFormKey('pt-BR')]).toBeUndefined()
    expect(contentRowsToForm(read()).ja.description).toBe('更新')
  } finally {
    sqlite.close()
  }
})
