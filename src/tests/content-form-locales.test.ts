// @vitest-environment node
// TESTING
import { expect, it } from 'vitest'
// SVELTEKIT
// @ts-expect-error Exercise the installed remote-form parser and registration contract.
import * as kitForms from '../../node_modules/@sveltejs/kit/src/runtime/form-utils.js'
// CONTENT LOCALES
import { normalizeContentLocale } from '#lib/content-locales/model.js'
import {
  adaptContentMap,
  contentFormKey,
  contentMapToStorage,
  contentRowsToForm,
} from '#lib/i18n/contentRecords.js'
// SCHEMAS
import { PropertyI18nByLocaleFormData } from '#lib/db/zod/schema/property.js'

it.each([
  'pt-BR',
  'sr-Latn-RS',
  'zh-Hant-HK',
  'es-419',
  'en-US-u-ca-gregory',
  `en-x-${Array(6).fill('abcdefgh').join('-')}-abcde`,
  'zh-Hant',
  'zh-Hans',
  'en',
])(
  'round trips %s through registered remote fields, schema validation and storage',
  locale => {
    const row = {
      label: 'Religion',
      labelGen: true,
      placeholder: '',
      placeholderGen: false,
    }
    const input = {
      data: { properties: [{ i18n: contentRowsToForm([{ ...row, locale }]) }] },
    }
    const key = contentFormKey(locale)
    expect(key).toMatch(/^[a-zA-Z_$]\w*$/)
    expect(contentFormKey(key)).toBe(key)
    expect(normalizeContentLocale(key)).toBe(locale)
    const fields = kitForms.create_field_proxy({
      form_id: 'locale-form',
      get: () => input,
      set: () => {},
      get_issues: () => ({}),
      get_touched: () => ({}),
      get_dirty: () => ({}),
    })
    const formData = new FormData()
    for (const [field, value] of Object.entries(row)) {
      const attrs = fields.data.properties[0].i18n[key][field].as('hidden', value)
      formData.append(attrs.name, attrs.value)
    }
    const parsed = kitForms.convert_formdata('locale-form', formData).data.properties[0]
      .i18n
    const validated = PropertyI18nByLocaleFormData.parse(parsed)
    const storedTag =
      locale === 'zh-Hant' || locale === 'zh-Hans' ? locale.toLowerCase() : locale
    expect(contentMapToStorage(validated)).toEqual({
      [storedTag]: { ...row, locale: storedTag },
    })
    expect(
      contentRowsToForm(Object.values(contentMapToStorage(validated)))[key],
    ).toEqual({ ...row, locale: storedTag })
  },
)

it('rejects canonical and encoded aliases that would overwrite the same translation', () => {
  expect(() =>
    adaptContentMap({
      'pt-BR': { label: 'A' },
      [contentFormKey('pt-BR')]: { label: 'B' },
    }),
  ).toThrow('collision')
  expect(
    PropertyI18nByLocaleFormData.safeParse({
      'pt-BR': { label: 'A' },
      [contentFormKey('pt-BR')]: { label: 'B' },
    }).success,
  ).toBe(false)
  expect(() =>
    contentMapToStorage({ [contentFormKey('pt-BR')]: { locale: 'en', label: 'A' } }),
  ).toThrow('map key')
  expect(normalizeContentLocale('en_US')).toBeNull()
})
