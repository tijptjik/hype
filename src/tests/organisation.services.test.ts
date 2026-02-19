import { describe, expect, it } from 'vitest'
import { overrideOrganisationEntityFromFormInput } from '$lib/client/services/organisation'
import type { OrganisationFormInput } from '$lib/types'

describe('organisation service overrides', () => {
  it('does not overwrite i18n/code/url when role-only submit payload omits them', () => {
    const current = {
      data: {
        code: 'org-alpha',
        url: 'https://example.org',
        i18n: {
          en: {
            name: 'Alpha',
            nameShort: 'A',
            description: 'Filled',
            nameGen: true,
            nameShortGen: true,
            descriptionGen: true,
          },
          'zh-hans': {
            name: '阿尔法',
            nameShort: '阿',
            description: '已有',
            nameGen: false,
            nameShortGen: false,
            descriptionGen: false,
          },
        },
      },
    }

    const roleOnlyPayload = {
      data: {
        userRoles: [{ userId: 'u-1', role: 'owner' }],
      },
    } as unknown as OrganisationFormInput

    const next = overrideOrganisationEntityFromFormInput(roleOnlyPayload)(current)

    expect(next.data.code).toBe('org-alpha')
    expect(next.data.url).toBe('https://example.org')
    expect(next.data.i18n).toEqual(current.data.i18n)
  })

  it('applies provided i18n fields (including empty-string clears) without clobbering others', () => {
    const current = {
      data: {
        code: 'org-alpha',
        url: 'https://example.org',
        i18n: {
          en: {
            name: 'Old name',
            nameShort: 'Old short',
            description: 'Old description',
            nameGen: true,
            nameShortGen: true,
            descriptionGen: true,
          },
          'zh-hans': {
            name: '旧名字',
            nameShort: '旧短名',
            description: '旧描述',
            nameGen: false,
            nameShortGen: false,
            descriptionGen: false,
          },
        },
      },
    }

    const partialI18nPayload = {
      data: {
        i18n: {
          en: {
            name: '',
            nameShort: 'New short',
            description: '',
          },
        },
      },
    } as unknown as OrganisationFormInput

    const next = overrideOrganisationEntityFromFormInput(partialI18nPayload)(current)
    const en = (next.data.i18n as Record<string, Record<string, unknown>>).en
    const zhHans = (next.data.i18n as Record<string, Record<string, unknown>>)[
      'zh-hans'
    ]

    expect(en.name).toBe('')
    expect(en.nameShort).toBe('New short')
    expect(en.description).toBe('')
    // Unspecified flags are preserved.
    expect(en.descriptionGen).toBe(true)
    // Unrelated locales remain intact.
    expect(zhHans).toEqual(current.data.i18n['zh-hans'])
  })
})
