import { describe, expect, it } from 'vitest'
import {
  resolveOrganisationActionPermissions,
  type OrganisationAuthActor,
} from '$lib/api/services/authz/organisation'
import type { UserRoleDisco } from '$lib/types'

const coreAdminRole = (): UserRoleDisco =>
  ({
    type: 'hub',
    role: 'admin',
    hubId: 'hub-core',
    userId: 'u-core-admin',
    hub: { code: 'core' },
  }) as unknown as UserRoleDisco

describe('resolveOrganisationActionPermissions', () => {
  it('returns denied when target is missing resource id or hub is undefined', () => {
    const actor: OrganisationAuthActor = {
      userId: 'u-1',
      userRoles: [coreAdminRole()],
      isAuthenticated: true,
    }

    expect(resolveOrganisationActionPermissions(actor, null)).toEqual({
      canEdit: false,
      canPublish: false,
    })

    expect(
      resolveOrganisationActionPermissions(actor, {
        resourceId: 'org-1',
        resourceHubId: undefined,
      }),
    ).toEqual({
      canEdit: false,
      canPublish: false,
    })
  })

  it('allows core admin even when organisation hub id is null', () => {
    const actor: OrganisationAuthActor = {
      userId: 'u-core-admin',
      userRoles: [coreAdminRole()],
      isAuthenticated: true,
    }

    const decision = resolveOrganisationActionPermissions(actor, {
      resourceId: 'org-1',
      resourceHubId: null,
    })

    expect(decision).toEqual({
      canEdit: true,
      canPublish: true,
    })
  })
})
