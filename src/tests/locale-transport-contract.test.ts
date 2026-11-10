// @vitest-environment node
// TESTING
import { expect, it } from 'vitest'
// SVELTEKIT
// @ts-expect-error Exercise the installed runtime rather than a remote-function mock.
import * as kitForms from '../../node_modules/@sveltejs/kit/src/runtime/form-utils.js'
// DRIZZLE
import { getTableColumns } from 'drizzle-orm'
// DATABASE
import { toRelatedRecords } from '#lib/db/index.js'
import { hubI18n } from '#lib/db/schema/hub.js'
import { organisationI18n } from '#lib/db/schema/organisation.js'
import { projectI18n } from '#lib/db/schema/project.js'
import { createI18n } from '#lib/db/services/hub.js'
import {
  createI18n as createOrganisationI18n,
  updateI18n as updateOrganisationI18n,
} from '#lib/db/services/organisation.js'
import {
  createI18n as createProjectI18n,
  updateI18n as updateProjectI18n,
} from '#lib/db/services/project.js'
import { HubI18nByLocaleFormData } from '#lib/db/zod/schema/hub.js'
// I18N
import { contentFormKey, contentRowsToForm } from '#lib/i18n/contentRecords.js'
// FIXTURES
import { publicationSqlite } from './fixtures/publicationSqlite.js'
// TYPES
import type { Database } from '#lib/types.js'

it.each([
  {
    model: 'organisation',
    table: organisationI18n,
    create: createOrganisationI18n,
    update: updateOrganisationI18n,
  },
  {
    model: 'project',
    table: projectI18n,
    create: createProjectI18n,
    update: updateProjectI18n,
  },
])(
  'normalizes $model create/update writes and preserves rows on alias collision',
  async ({ model, table, create, update }) => {
    const { sqlite, db } = publicationSqlite({})
    try {
      sqlite.exec(
        `CREATE TABLE ${model}I18n (${Object.values(getTableColumns(table))
          .map(column => `"${column.name}" ${column.getSQLType()}`)
          .join(',')}, PRIMARY KEY(${model}Id,locale))`,
      )
      const translations = {
        en: { name: 'Name' },
        zhHans: { name: '名称' },
        zhHant: { name: '名稱' },
      }
      await create(db as unknown as Database, translations as never, 'probe')
      const read = () =>
        sqlite.prepare(`SELECT locale,name FROM ${model}I18n ORDER BY locale`).all()
      expect(read()).toEqual([
        { locale: 'en', name: 'Name' },
        { locale: 'zh-hans', name: '名称' },
        { locale: 'zh-hant', name: '名稱' },
      ])
      await update(
        db as unknown as Database,
        { ...translations, zhHant: { name: '更新' } } as never,
        'probe',
      )
      const before = read()
      expect(before[2]).toEqual({ locale: 'zh-hant', name: '更新' })
      await expect(
        update(
          db as unknown as Database,
          { ...translations, 'zh-hant': { name: 'Collision' } } as never,
          'probe',
        ),
      ).rejects.toThrow('collision')
      expect(read()).toEqual(before)
    } finally {
      sqlite.close()
    }
  },
)

it.each(['zh-hant', 'zh-hans', 'pt-BR'])(
  'accepts %s as a form value but rejects it as a nested field path',
  locale => {
    const values = new FormData()
    values.set('data.translations[0].locale/locale-probe', locale)
    values.set('data.translations[0].name/locale-probe', '名稱')
    expect(kitForms.convert_formdata('locale-probe', values)).toEqual({
      data: { translations: [{ locale, name: '名稱' }] },
    })

    for (const name of [`data.i18n.${locale}.name`, `data.i18n["${locale}"].name`]) {
      const fields = new FormData()
      fields.set(`${name}/locale-probe`, '名稱')
      expect(() => kitForms.convert_formdata('locale-probe', fields)).toThrow(
        /form_field_invalid_name|Invalid field name/,
      )
    }
  },
)

it.each(['zh-hant', 'zh-hans', 'pt-BR'])(
  'preserves %s keys in the binary object transport',
  async locale => {
    const data = { i18n: { [locale]: { locale, name: '名稱' } } }
    const { blob: body } = kitForms.serialize_binary_form(data, {})
    const request = new Request('http://localhost/locale-probe', {
      method: 'POST',
      headers: { 'content-type': kitForms.BINARY_FORM_CONTENT_TYPE },
      body,
    })
    expect(
      (await kitForms.deserialize_binary_form(request, 'locale-probe')).data,
    ).toEqual(data)
  },
)

it.each(['zh-hant', 'zh-hans', 'pt-BR'])(
  'round trips %s through registered fields, hub validation, SQL writes and form readback',
  async locale => {
    const key = contentFormKey(locale)
    const input = { i18n: { [key]: { name: '名稱', nameShort: '名稱' } } }
    const fields = kitForms.create_field_proxy({
      form_id: 'locale-probe',
      get: () => input,
      set: () => {},
      get_issues: () => ({}),
      get_touched: () => ({}),
      get_dirty: () => ({}),
    })
    const formData = new FormData()
    for (const [field, value] of Object.entries(input.i18n[key])) {
      const attrs = fields.i18n[key][field].as('hidden', value)
      formData.set(attrs.name, attrs.value)
    }
    const parsed = HubI18nByLocaleFormData.parse(
      kitForms.convert_formdata('locale-probe', formData).i18n,
    )
    const { sqlite, db } = publicationSqlite({ hubI18n })
    try {
      sqlite.exec(
        `CREATE TABLE hubI18n (${Object.values(getTableColumns(hubI18n))
          .map(column => `"${column.name}" ${column.getSQLType()}`)
          .join(',')}, PRIMARY KEY(hubId,locale))`,
      )
      await createI18n(db as unknown as Database, parsed, 'probe')
      const rows = sqlite.prepare('SELECT locale,name,nameShort FROM hubI18n').all()
      expect(rows).toEqual([{ locale, name: '名稱', nameShort: '名稱' }])
      expect(contentRowsToForm(rows)[key]).toEqual(rows[0])
    } finally {
      sqlite.close()
    }
  },
)

it('normalizes relation map keys with or without an embedded locale', () => {
  expect(
    toRelatedRecords({ zhHant: { name: '名稱' } }, 'projectId', 'probe', 'locale'),
  ).toEqual([{ projectId: 'probe', locale: 'zh-hant', name: '名稱' }])
  expect(
    toRelatedRecords(
      { zhHant: { locale: 'zh-hant', name: '名稱' } },
      'projectId',
      'probe',
      'locale',
    ),
  ).toEqual([{ projectId: 'probe', locale: 'zh-hant', name: '名稱' }])
})

it('rejects aliases and inconsistent embedded locales before producing write rows', () => {
  expect(() =>
    toRelatedRecords(
      { zhHant: { name: 'A' }, 'zh-hant': { name: 'B' } },
      'projectId',
      'p',
      'locale',
    ),
  ).toThrow('collision')
  expect(() =>
    toRelatedRecords(
      { zhHant: { locale: 'en', name: 'A' } },
      'projectId',
      'p',
      'locale',
    ),
  ).toThrow('map key')
  expect(toRelatedRecords({ 'some-id': { name: 'A' } }, 'projectId', 'p')).toEqual([
    { id: 'some-id', projectId: 'p', name: 'A' },
  ])
  expect(
    toRelatedRecords(
      { [contentFormKey('pt-BR')]: { name: 'A' } },
      'projectId',
      'p',
      'locale',
    ),
  ).toEqual([{ locale: 'pt-BR', projectId: 'p', name: 'A' }])
})
