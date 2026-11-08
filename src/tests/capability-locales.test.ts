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
    const reloadedCapabilities = CapabilityRoot.parse(reloaded.data.capabilities)
    expect(reloadedCapabilities.manageBakeries?.i18n?.ja).toBe('寄付者')
    expect(reloadedCapabilities.manageBakeries?.i18n?.$locale_pt_BR).toBe('Doadores')
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

it('round-trips explicit organisation analytics delegation through form validation', async () => {
  const { OrganisationRoleFormData } = await import(
    '#lib/db/zod/schema/organisation.js'
  )
  const { toUserRoles } = await import('#lib/db/services/organisation.js')
  const form = toOrganisationFormInput({
    userRoles: [{ userId: 'member', role: 'member', viewAnalytics: true }],
  })
  const role = OrganisationRoleFormData.parse(form.data.userRoles?.[0])
  expect(role.viewAnalytics).toBe(true)
  expect(toUserRoles([role], 'org')).toEqual([
    { organisationId: 'org', userId: 'member', role: 'member', viewAnalytics: true },
  ])
  expect(
    OrganisationRoleFormData.parse({ ...role, viewAnalytics: 'false' }).viewAnalytics,
  ).toBe(false)
})

it('detects analytics-only changes for organisation role management', async () => {
  const { toOrganisationUserRoleSignature } = await import(
    '#lib/api/services/authz/shared.js'
  )
  const row = { userId: 'member', role: 'member' }
  expect(toOrganisationUserRoleSignature([row])).toBe(
    toOrganisationUserRoleSignature([{ ...row, viewAnalytics: false }]),
  )
  expect(toOrganisationUserRoleSignature([row])).not.toBe(
    toOrganisationUserRoleSignature([{ ...row, viewAnalytics: true }]),
  )
})
