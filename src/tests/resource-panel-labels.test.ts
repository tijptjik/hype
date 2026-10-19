import { expect, it } from 'vitest'
import { getResourcePanelShortName } from '#lib/adapters/panels/resourcePanelLabels.js'
import { getProjectDisplayName } from '#lib/projectNames.js'
import { CompactAncestorsSchema } from '#lib/db/zod/schema/api.js'

it('resolves joined project naming policy without loaded parent lists', () => {
  const ancestors = CompactAncestorsSchema.parse({
    organisation: {
      id: 'org',
      code: 'hkghostsigns',
      i18n: { en: { name: 'Hong Kong Ghost Signs', nameShort: 'HKGhostSigns' } },
    },
    project: {
      id: 'project',
      code: 'hkghostsigns',
      useAllInOrgContext: true,
      i18n: { en: { name: 'HK Ghost Signs', nameShort: 'Ghost Signs' } },
    },
  })
  expect(getResourcePanelShortName(ancestors.organisation, {})).toBe('HKGhostSigns')
  expect(getProjectDisplayName(ancestors.project, {})).toBe('Ghost Signs')
  expect(
    getProjectDisplayName(ancestors.project, {}, { inOrganisationContext: true }),
  ).toBe('All')
})

it('falls back from absent or blank short names to full names and then identity', () => {
  expect(
    getResourcePanelShortName(
      { i18n: { en: { name: 'City Recorder', nameShort: ' ' } } },
      {},
    ),
  ).toBe('City Recorder')
  expect(
    getResourcePanelShortName({ i18n: { en: { name: 'City Recorder' } } }, {}),
  ).toBe('City Recorder')
  expect(getResourcePanelShortName(undefined, {}, 'cityrecorder')).toBe('cityrecorder')
})
