// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ContentLocaleSchema,
  normalizeContentLocale,
  normalizeContentLocales,
  toLegacyContentLocaleKey,
} from '#lib/content-locales/model.js'
import {
  CONTENT_LOCALE_CATALOGUE,
  SupportedContentLocaleSchema,
  getContentLocaleName,
  getContentLocaleRecord,
  queryContentLocales,
} from '#lib/content-locales/catalogue.js'
import {
  ContentLocaleSettingsFormSchema,
  ContentLocaleSettingsPatchSchema,
  ContentLocaleSettingsSchema,
  applyContentLocaleSettingsPatch,
} from '#lib/content-locales/settings.js'
import { resolveContentLocales } from '#lib/content-locales/resolve.js'
import {
  ProjectEntityFormData,
  ProjectBase,
  ProjectCompactProfileAPI,
} from '#lib/db/zod/schema/project.js'
import {
  OrganisationEntityFormData,
  OrganisationBase,
  OrganisationCompactProfileAPI,
} from '#lib/db/zod/schema/organisation.js'
import { toProjectFormInput } from '#lib/client/services/project.js'
import { toOrganisationFormInput } from '#lib/client/services/organisation.js'
import {
  authorizeProjectUpdateForSubmission,
  toProjectSubmittedFields,
} from '#lib/api/services/authz/project.js'
import {
  authorizeOrganisationUpdateForSubmission,
  toOrganisationSubmittedFields,
} from '#lib/api/services/authz/organisation.js'
import type { UserRoleDisco } from '#lib/types.js'

afterEach(() => vi.restoreAllMocks())

describe('content locale identity and catalogue', () => {
  it('canonicalizes legacy aliases and deduplicates without changing first occurrence order', () => {
    expect(
      normalizeContentLocales(['ja', 'zhHant', 'ZH-hant', 'pt-br', 'en', 'ja']),
    ).toEqual(['ja', 'zh-Hant', 'pt-BR', 'en'])
    expect(toLegacyContentLocaleKey('zh-Hant')).toBe('zhHant')
    expect(toLegacyContentLocaleKey('zh-hans')).toBe('zhHans')
    expect(toLegacyContentLocaleKey('pt-br')).toBe('pt-BR')
    expect(normalizeContentLocale('iw')).toBe('he')
  })
  it('preserves syntactically valid tags outside the dropdown without permitting them in new defaults', () => {
    expect(ContentLocaleSchema.parse('haw')).toBe('haw')
    expect(getContentLocaleRecord('haw').autonym).toBe('haw')
    expect(
      ContentLocaleSettingsPatchSchema.safeParse({ contentLocales: ['haw'] }).success,
    ).toBe(false)
  })
  it.each([
    '',
    'en_US',
    ' en',
    'en--US',
    'a',
    'a'.repeat(65),
    '__proto__',
    'constructor',
  ])('rejects malformed or oversized tag %s', value => {
    expect(normalizeContentLocale(value)).toBeNull()
  })
  it.each(['zh-Hant', 'zhHant', 'Traditional Chinese', '繁體中文'])(
    'finds Traditional Chinese by %s',
    query => {
      expect(queryContentLocales({ query }).map(item => item.locale)).toContain(
        'zh-Hant',
      )
    },
  )
  it('searches localized names and provides stable explicit autonyms', () => {
    expect(
      queryContentLocales({ query: '日文', displayLocale: 'zhHant' }).map(
        item => item.locale,
      ),
    ).toContain('ja')
    expect(getContentLocaleRecord('ja').autonym).toBe('日本語')
    expect(getContentLocaleRecord('pt-BR').autonym).toBe('Português (Brasil)')
    expect(queryContentLocales({ limit: 2 })).toHaveLength(2)
    expect(new Set(CONTENT_LOCALE_CATALOGUE.map(entry => entry.locale)).size).toBe(
      CONTENT_LOCALE_CATALOGUE.length,
    )
  })
  it('falls back to the tag if runtime display names fail or are absent', () => {
    vi.spyOn(Intl.DisplayNames.prototype, 'of').mockImplementation(() => {
      throw new Error('no ICU')
    })
    expect(getContentLocaleName('zz')).toBe('zz')
    expect(getContentLocaleRecord('zhHant')).toMatchObject({
      name: 'zh-Hant',
      autonym: '繁體中文',
    })
    expect(getContentLocaleName('bad tag')).toBe('bad tag')
  })
})

describe('ordered settings and inheritance', () => {
  it.each([
    ['en', ['en', 'zh-Hant', 'zh-Hans']],
    ['zhHant', ['zh-Hant', 'zh-Hans', 'en']],
    ['zhHans', ['zh-Hans', 'zh-Hant', 'en']],
    [undefined, ['en', 'zh-Hant', 'zh-Hans']],
    ['unknown', ['en', 'zh-Hant', 'zh-Hans']],
    ['en-GB', ['en', 'zh-Hant', 'zh-Hans']],
    ['zh-Hant-HK', ['zh-Hant', 'zh-Hans', 'en']],
    ['zh-Hans-SG', ['zh-Hans', 'zh-Hant', 'en']],
    ['zh-HK', ['en', 'zh-Hant', 'zh-Hans']],
    ['zh-CN', ['en', 'zh-Hant', 'zh-Hans']],
    ['ja', ['en', 'zh-Hant', 'zh-Hans']],
  ])('resolves fallback for %s', (userLocale, locales) => {
    expect(resolveContentLocales({ userLocale })).toEqual({
      locales,
      origin: 'user-default',
    })
  })
  it('replaces the whole order, resets by key removal, and keeps chip mutations local', () => {
    const organisationSettings = ContentLocaleSettingsSchema.parse({
      contentLocales: ['ja', 'en'],
    })
    const projectSettings = ContentLocaleSettingsSchema.parse({
      contentLocales: ['pt-br', 'zhHant'],
      future: { enabled: true },
    })
    const resolved = resolveContentLocales({
      projectSettings,
      organisationSettings,
      userLocale: 'en',
    })
    expect(resolved).toEqual({ locales: ['pt-BR', 'zh-Hant'], origin: 'project' })
    resolved.locales.reverse()
    expect(projectSettings.contentLocales).toEqual(['pt-BR', 'zh-Hant'])
    const reset = applyContentLocaleSettingsPatch(projectSettings, {
      contentLocales: null,
    })
    expect(reset).toEqual({ future: { enabled: true } })
    expect(
      resolveContentLocales({ projectSettings: reset, organisationSettings }),
    ).toEqual({ locales: ['ja', 'en'], origin: 'organisation' })
    expect(
      resolveContentLocales({
        organisationSettings: applyContentLocaleSettingsPatch(organisationSettings, {
          contentLocales: null,
        }),
      }).origin,
    ).toBe('user-default')
    expect(applyContentLocaleSettingsPatch(projectSettings, {})).toEqual(
      projectSettings,
    )
    expect(applyContentLocaleSettingsPatch(projectSettings)).toEqual(projectSettings)
  })
  it.each(
    [
      [],
      ['en', 'EN'],
      ['zhHant', 'zh-Hant'],
      ['zz'],
      ['en_US'],
      Array(33).fill('en'),
    ].map(value => [value]),
  )('rejects invalid settings array %j', contentLocales => {
    const parsed = ContentLocaleSettingsPatchSchema.safeParse({ contentLocales })
    expect(parsed.success).toBe(false)
    if (!parsed.success) expect(parsed.error.issues[0].path[0]).toBe('contentLocales')
  })
  it('rejects arbitrary write keys and malformed form JSON; accepts the size limit', () => {
    expect(ContentLocaleSettingsPatchSchema.safeParse({ future: true }).success).toBe(
      false,
    )
    expect(ContentLocaleSettingsFormSchema.safeParse('{broken').success).toBe(false)
    expect(
      ContentLocaleSettingsPatchSchema.parse({
        contentLocales: CONTENT_LOCALE_CATALOGUE.slice(0, 32).map(
          entry => entry.locale,
        ),
      }).contentLocales,
    ).toHaveLength(32)
  })
  it.each([
    [
      ProjectEntityFormData.pick({ settings: true }),
      ProjectBase.pick({ settings: true }),
      ProjectCompactProfileAPI.pick({ settings: true }),
    ],
    [
      OrganisationEntityFormData.pick({ settings: true }),
      OrganisationBase.pick({ settings: true }),
      OrganisationCompactProfileAPI.pick({ settings: true }),
    ],
  ])('round-trips settings through form and read schemas', (form, base, compact) => {
    const patch = form.parse({
      settings: JSON.stringify({ contentLocales: ['ja', 'zhHant', 'en'] }),
    }).settings
    const stored = applyContentLocaleSettingsPatch({ other: ['kept'] }, patch)
    for (const schema of [base, compact]) {
      expect(schema.parse(JSON.parse(JSON.stringify({ settings: stored })))).toEqual({
        settings: { contentLocales: ['ja', 'zh-Hant', 'en'], other: ['kept'] },
      })
    }
    expect(form.parse({})).toEqual({})
  })
  it('new forms inherit without persisting the current user fallback', () => {
    expect(toProjectFormInput().data.settings).toEqual({})
    expect(toOrganisationFormInput().data.settings).toEqual({})
  })
})

describe('shared defaults follow resource update permissions', () => {
  const settings = { contentLocales: ['ja'] }
  it.each(['owner', 'maintainer', 'translator', 'member', 'user'])(
    'checks Project %s and denies upward Organisation writes',
    role => {
      const userRoles = [
        { type: 'project', role, projectId: 'p', userId: 'u' },
      ] as UserRoleDisco[]
      const input = { user: { id: 'u' }, userRoles, submittedData: { settings } }
      expect(toProjectSubmittedFields(input.submittedData)).toEqual(['settings'])
      expect(
        authorizeProjectUpdateForSubmission({
          ...input,
          resource: { id: 'p', organisationId: 'o', hubId: 'h' },
        }).allowed,
      ).toBe(['owner', 'maintainer'].includes(role))
      expect(
        authorizeOrganisationUpdateForSubmission({
          ...input,
          resource: { id: 'o', hubId: 'h' },
        }).allowed,
      ).toBe(false)
    },
  )
  it('allows Organisation owners and rejects members, guests and unrelated scope', () => {
    expect(toOrganisationSubmittedFields({ settings })).toEqual(['settings'])
    for (const [role, organisationId, isAnonymous, expected] of [
      ['owner', 'o', false, true],
      ['member', 'o', false, false],
      ['owner', 'other', false, false],
      ['owner', 'o', true, false],
    ] as const) {
      const decision = authorizeOrganisationUpdateForSubmission({
        user: { id: 'u', isAnonymous },
        userRoles: [
          { type: 'organisation', role, organisationId, userId: 'u' },
        ] as UserRoleDisco[],
        resource: { id: 'o', hubId: 'h' },
        submittedData: { settings },
      })
      expect(decision.allowed).toBe(expected)
    }
  })
})

it('offers script-level Chinese and Cantonese aliases while preserving retired settings', () => {
  for (const query of ['Cantonese', 'yue', '粵語']) {
    expect(queryContentLocales({ query }).map(row => row.locale)).toEqual(['zh-Hant'])
  }
  for (const tag of ['zh-Hant-HK', 'zh-Hant-TW', 'zh-Hans-CN', 'zh-Hans-SG', 'yue']) {
    expect(CONTENT_LOCALE_CATALOGUE.some(row => row.locale === tag)).toBe(false)
    expect(SupportedContentLocaleSchema.parse(tag)).toBe(tag)
  }
})
