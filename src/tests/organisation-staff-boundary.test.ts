// TESTS
import { describe, expect, it } from 'vitest'
// POLICY
import { hasAnyOrganisationStaffRole } from '#lib/api/services/authz/organisation.js'
import { getOrganisationIdforRoles } from '#lib/client/services/auth.js'
import { toOrganisationFormInput } from '#lib/client/services/organisation.js'
// TYPES
import type { UserRoleDisco } from '#lib/types.js'

const roles = [
  { type: 'organisation', organisationId: 'audience', userId: 'person', role: 'user' },
  { type: 'organisation', organisationId: 'staff', userId: 'person', role: 'owner' },
] as UserRoleDisco[]

describe('organisation staff boundary', () => {
  it('keeps audience grants out of staff access and organisation selection', () => {
    expect(hasAnyOrganisationStaffRole(roles.slice(0, 1))).toBe(false)
    expect(hasAnyOrganisationStaffRole(roles)).toBe(true)
    expect(getOrganisationIdforRoles(roles)).toEqual(['staff'])
  })

  it('keeps audience membership out of submitted staff assignments', () => {
    const form = toOrganisationFormInput({
      id: 'organisation',
      userRoles: [
        { userId: 'audience', role: 'user' },
        { userId: 'staff', role: 'owner' },
      ],
    } as never)
    expect(form.data.userRoles).toEqual([{ userId: 'staff', role: 'owner' }])
  })
})
