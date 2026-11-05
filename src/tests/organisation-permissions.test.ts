// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { canSubmitOrganisationUserDetailsPermission } from '#lib/api/services/authz/organisationPermissions.js'

const staff = { id: 'staff', isAnonymous: false, superAdmin: false }

describe('platform-controlled organisation permission', () => {
  it('allows only explicit SuperAdmins to grant or revoke it', () => {
    for (const current of [false, true]) {
      expect(canSubmitOrganisationUserDetailsPermission(staff, !current, current)).toBe(
        false,
      )
      expect(
        canSubmitOrganisationUserDetailsPermission(
          { ...staff, superAdmin: true },
          !current,
          current,
        ),
      ).toBe(true)
    }
  })

  it('allows ordinary saves to omit or echo the flag without granting authority', () => {
    for (const current of [false, true]) {
      expect(
        canSubmitOrganisationUserDetailsPermission(staff, undefined, current),
      ).toBe(true)
      expect(canSubmitOrganisationUserDetailsPermission(staff, current, current)).toBe(
        true,
      )
    }
    expect(canSubmitOrganisationUserDetailsPermission(staff, true)).toBe(false)
  })

  it('rejects missing identities and anonymous SuperAdmin-shaped sessions', () => {
    expect(
      canSubmitOrganisationUserDetailsPermission({ ...staff, id: '' }, false),
    ).toBe(false)
    expect(
      canSubmitOrganisationUserDetailsPermission(
        { ...staff, isAnonymous: true, superAdmin: true },
        true,
      ),
    ).toBe(false)
  })
})
