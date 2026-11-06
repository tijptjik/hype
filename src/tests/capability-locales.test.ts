// TESTING
import { describe, expect, it } from 'vitest'
// CAPABILITIES
import { capabilityDefinitionsToStorage } from '#lib/capabilities.js'
import { CapabilityRoot } from '#lib/db/zod/schema/organisation.js'
import { toOrganisationFormInput } from '#lib/client/services/organisation.js'

describe('capability content languages', () => {
  it('round-trips additional languages through form validation and storage without losing labels', () => {
    const stored = {
      manageBakeries: {
        i18n: {
          en: 'Donor Manager',
          zhHant: '管理',
          ja: '寄付者',
          'pt-BR': 'Doadores',
        },
      },
    }
    const form = CapabilityRoot.parse(stored)
    expect(form.manageBakeries?.i18n?.$locale_pt_BR).toBe('Doadores')
    expect(form.manageBakeries?.i18n?.ja).toBe('寄付者')
    expect(capabilityDefinitionsToStorage(form)).toEqual(stored)
    expect(CapabilityRoot.parse(capabilityDefinitionsToStorage(form))).toEqual(form)
    const reloaded = toOrganisationFormInput({
      capabilities: capabilityDefinitionsToStorage(form),
    })
    expect(reloaded.data.capabilities?.manageBakeries?.i18n?.ja).toBe('寄付者')
    expect(reloaded.data.capabilities?.manageBakeries?.i18n?.$locale_pt_BR).toBe(
      'Doadores',
    )
  })

  it('keeps empty added languages and rejects conflicting normalized language identities', () => {
    const form = CapabilityRoot.parse({
      manageVolunteers: { i18n: { en: 'Events', ja: '', $locale_pt_BR: '' } },
    })
    expect(capabilityDefinitionsToStorage(form)).toEqual({
      manageVolunteers: { i18n: { en: 'Events', ja: '', 'pt-BR': '' } },
    })
    expect(
      CapabilityRoot.safeParse({
        manageVolunteers: { i18n: { 'pt-BR': 'First', $locale_pt_BR: 'Second' } },
      }).success,
    ).toBe(false)
  })
})
