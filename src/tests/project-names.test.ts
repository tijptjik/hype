// TESTING
import { afterEach, describe, expect, it } from 'vitest'
// I18N
import { setLocale } from '#lib/i18n.js'
// PROJECTS
import { getProjectDisplayName } from '#lib/projectNames.js'
import { toProjectFormInput } from '#lib/client/services/project.js'
import { ProjectEntityFormData } from '#lib/db/zod/schema/project.js'
import { CompactAncestorsSchema } from '#lib/db/zod/schema/api.js'
import { toCompactAncestors } from '#lib/api/services/resource-profiles.js'
// TYPES
import type { Project } from '#lib/db/zod/schema/project.types.js'

afterEach(async () => {
  await setLocale('en', { reload: false })
})

const project = {
  id: 'ghost-signs',
  code: 'hkghostsigns',
  useAllInOrgContext: true,
  i18n: {
    en: { name: 'HK Ghost Signs', nameShort: 'Ghost Signs' },
    zhHant: { name: '香港幽靈招牌', nameShort: '幽靈招牌' },
    zhHans: { name: '香港幽灵招牌', nameShort: '幽灵招牌' },
  },
}

describe('project display names', () => {
  it('uses full titles, standalone short names and opt-in organisation replacements', () => {
    expect(getProjectDisplayName(project, {}, { variant: 'full' })).toBe(
      'HK Ghost Signs',
    )
    expect(getProjectDisplayName(project, {})).toBe('Ghost Signs')
    expect(getProjectDisplayName(project, {}, { inOrganisationContext: true })).toBe(
      'All',
    )
    expect(
      getProjectDisplayName(
        project,
        {},
        { variant: 'full', inOrganisationContext: true },
      ),
    ).toBe('HK Ghost Signs')
    expect(
      getProjectDisplayName(
        { ...project, useAllInOrgContext: false },
        {},
        { inOrganisationContext: true },
      ),
    ).toBe('Ghost Signs')
    expect(getProjectDisplayName({ i18n: { en: { name: 'Full only' } } }, {})).toBe(
      'Full only',
    )
  })

  it.each(['zh-hant', 'zh-hans'] as const)(
    'localises the replacement in %s',
    async locale => {
      await setLocale(locale, { reload: false })
      expect(getProjectDisplayName(project, {}, { inOrganisationContext: true })).toBe(
        '全部',
      )
      expect(getProjectDisplayName(project, {})).toBe(
        locale === 'zh-hant' ? '幽靈招牌' : '幽灵招牌',
      )
    },
  )

  it('retains the flag through compact ancestor projection and validation', () => {
    const ancestors = toCompactAncestors({
      project: {
        ...project,
        i18n: [{ locale: 'en', ...project.i18n.en }],
      },
    })
    const parsed = CompactAncestorsSchema.parse(ancestors)
    expect(parsed.project?.useAllInOrgContext).toBe(true)
    expect(
      getProjectDisplayName(parsed.project, {}, { inOrganisationContext: true }),
    ).toBe('All')
  })

  it('defaults new forms to false and preserves persisted true and explicit false on submission', () => {
    expect(toProjectFormInput().data.useAllInOrgContext).toBe(false)
    expect(
      toProjectFormInput(project as unknown as Project).data.useAllInOrgContext,
    ).toBe(true)
    const schema = ProjectEntityFormData.pick({ useAllInOrgContext: true })
    expect(schema.parse({}).useAllInOrgContext).toBe(false)
    expect(schema.parse({ useAllInOrgContext: 'true' }).useAllInOrgContext).toBe(true)
    expect(schema.parse({ useAllInOrgContext: 'false' }).useAllInOrgContext).toBe(false)
  })
})
