import { describe, expect, it } from 'vitest'
import { IdentityCatalogueContentSchema } from '#lib/locations/identityCatalogue.js'
import { catalogueDisplayName } from '#lib/locations/cataloguePresentation.js'

const i18n = {
  en: { name: '' },
  'zh-Hant': { name: '社區廚房' },
  'zh-Hans': { name: '' },
}

describe('catalogue missing translations', () => {
  it('accepts intentionally empty locales but requires one actual name', () => {
    expect(IdentityCatalogueContentSchema.safeParse({ i18n }).success).toBe(true)
    expect(
      IdentityCatalogueContentSchema.safeParse({
        i18n: { en: { name: ' ' }, 'zh-Hant': { name: '' }, 'zh-Hans': { name: '' } },
      }).success,
    ).toBe(false)
  })

  it('shows a defined fallback name when English was intentionally skipped', () => {
    expect(
      catalogueDisplayName({
        id: 'kitchen',
        kind: 'brand',
        version: 1,
        logo: null,
        i18n,
      }),
    ).toBe('社區廚房')
  })
})
