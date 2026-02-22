import { describe, expect, it } from 'vitest'
import {
  resolveHubActionPermissions,
  type HubAuthActor,
} from '$lib/api/services/authz/hub'
import type { UserRoleDisco } from '$lib/types'

const coreAdminRole = (): UserRoleDisco =>
  ({
    type: 'hub',
    role: 'admin',
    hubId: 'hub-core',
    userId: 'u-core-admin',
    hub: { code: 'core' },
  }) as unknown as UserRoleDisco

const scopedAdminRole = (): UserRoleDisco =>
  ({
    type: 'hub',
    role: 'admin',
    hubId: 'hub-breadline',
    userId: 'u-scoped-admin',
    hub: { code: 'breadline' },
  }) as unknown as UserRoleDisco

describe('resolveHubActionPermissions', () => {
  it('returns denied when target is missing resource id or hub is undefined', () => {
    const actor: HubAuthActor = {
      userId: 'u-1',
      userRoles: [scopedAdminRole()],
      isAuthenticated: true,
    }

    expect(resolveHubActionPermissions(actor, null)).toEqual({
      canCreate: false,
      canEdit: false,
      canPublish: false,
      canDelete: false,
    })

    expect(
      resolveHubActionPermissions(actor, {
        resourceId: 'hub-1',
        resourceHubId: undefined,
      }),
    ).toEqual({
      canCreate: false,
      canEdit: false,
      canPublish: false,
      canDelete: false,
    })
  })

  it('allows core admin even when target hub id is null', () => {
    const actor: HubAuthActor = {
      userId: 'u-core-admin',
      userRoles: [coreAdminRole()],
      isAuthenticated: true,
    }

    const decision = resolveHubActionPermissions(actor, {
      resourceId: 'hub-1',
      resourceHubId: null,
    })

    expect(decision).toEqual({
      canCreate: true,
      canEdit: true,
      canPublish: true,
      canDelete: true,
    })
  })

  it('allows scoped hub admin to edit/publish own hub but not create/delete', () => {
    const actor: HubAuthActor = {
      userId: 'u-scoped-admin',
      userRoles: [scopedAdminRole()],
      isAuthenticated: true,
    }

    const decision = resolveHubActionPermissions(actor, {
      resourceId: 'hub-breadline',
      resourceHubId: 'hub-breadline',
    })

    expect(decision).toEqual({
      canCreate: false,
      canEdit: true,
      canPublish: true,
      canDelete: false,
    })
  })
})
