import { describe, expect, it } from 'vitest'
import { canAccessAdminPanel, canAccessAnalytics } from '$lib/api/services/authz/user'
import type { UserRoleDisco } from '$lib/types'

const coreAdminRole = (): UserRoleDisco =>
  ({
    type: 'hub',
    role: 'admin',
    hubId: 'hub-core',
    hub: { code: 'core' },
  }) as UserRoleDisco

const scopedHubAdminRole = (): UserRoleDisco =>
  ({
    type: 'hub',
    role: 'admin',
    hubId: 'hub-scope',
    hub: { code: 'hub-scope' },
  }) as UserRoleDisco

const organisationOwnerRole = (): UserRoleDisco =>
  ({
    type: 'organisation',
    role: 'owner',
    organisationId: 'org-1',
  }) as UserRoleDisco

const projectOwnerRole = (): UserRoleDisco =>
  ({
    type: 'project',
    role: 'owner',
    projectId: 'project-1',
  }) as UserRoleDisco

const projectMaintainerRole = (): UserRoleDisco =>
  ({
    type: 'project',
    role: 'maintainer',
    projectId: 'project-1',
  }) as UserRoleDisco

const projectMemberRole = (): UserRoleDisco =>
  ({
    type: 'project',
    role: 'member',
    projectId: 'project-1',
  }) as UserRoleDisco

const projectUserRole = (): UserRoleDisco =>
  ({
    type: 'project',
    role: 'user',
    projectId: 'project-1',
  }) as UserRoleDisco

const organisationMemberRole = (): UserRoleDisco =>
  ({
    type: 'organisation',
    role: 'member',
    organisationId: 'org-1',
  }) as UserRoleDisco

describe('canAccessAdminPanel', () => {
  it('allows super admins', () => {
    expect(canAccessAdminPanel({ superAdmin: true, userRoles: [] })).toBe(true)
  })

  it('allows organisation members because their role is not the baseline user role', () => {
    expect(
      canAccessAdminPanel({
        superAdmin: false,
        userRoles: [organisationMemberRole()],
      }),
    ).toBe(true)
  })

  it('allows project members because their role is not the baseline user role', () => {
    expect(
      canAccessAdminPanel({
        superAdmin: false,
        userRoles: [projectMemberRole()],
      }),
    ).toBe(true)
  })

  it('denies users whose only role is the baseline user role', () => {
    expect(
      canAccessAdminPanel({
        superAdmin: false,
        userRoles: [projectUserRole()],
      }),
    ).toBe(false)
  })
})

describe('canAccessAnalytics', () => {
  it('allows super admins', () => {
    expect(canAccessAnalytics({ superAdmin: true, userRoles: [] })).toBe(true)
  })

  it('allows core hub admins', () => {
    expect(
      canAccessAnalytics({ superAdmin: false, userRoles: [coreAdminRole()] }),
    ).toBe(true)
  })

  it('allows scoped hub admins', () => {
    expect(
      canAccessAnalytics({ superAdmin: false, userRoles: [scopedHubAdminRole()] }),
    ).toBe(true)
  })

  it('allows organisation owners', () => {
    expect(
      canAccessAnalytics({ superAdmin: false, userRoles: [organisationOwnerRole()] }),
    ).toBe(true)
  })

  it('allows project owners', () => {
    expect(
      canAccessAnalytics({ superAdmin: false, userRoles: [projectOwnerRole()] }),
    ).toBe(true)
  })

  it('denies maintainers without owner or hub-admin privileges', () => {
    expect(
      canAccessAnalytics({ superAdmin: false, userRoles: [projectMaintainerRole()] }),
    ).toBe(false)
  })
})
