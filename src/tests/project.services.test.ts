import { describe, expect, it } from 'vitest'
import { toQueryConditions } from '$lib/api/services/project'
import type { SessionUser, UserRoleDisco } from '$lib/types'

describe('project query visibility', () => {
  const superAdminUser = {
    id: 'user-1',
    superAdmin: true,
    isAnonymous: false,
    roles: [],
  } as unknown as SessionUser

  it('keeps public visibility filters for super admins outside admin requests', () => {
    const result = toQueryConditions(
      {} as never,
      superAdminUser,
      false,
      { isPublished: true, isArchived: false },
      [],
    )

    expect(result.conditions.length).toBeGreaterThan(0)
  })

  it('allows admin-request super admins to bypass default visibility filters', () => {
    const result = toQueryConditions(
      {} as never,
      superAdminUser,
      true,
      { isPublished: true, isArchived: false },
      [],
    )

    expect(result.conditions).toHaveLength(0)
  })

  it('keeps public visibility filters for hub admins outside admin requests', () => {
    const hubAdminRoles = [
      {
        type: 'hub',
        role: 'admin',
        hubId: 'hub-a',
      },
    ] as unknown as UserRoleDisco[]

    const result = toQueryConditions(
      {} as never,
      {
        id: 'user-2',
        superAdmin: false,
        isAnonymous: false,
        roles: hubAdminRoles,
      } as unknown as SessionUser,
      false,
      { isPublished: true, isArchived: false },
      hubAdminRoles,
      undefined,
      'hub-a',
    )

    expect(result.conditions.length).toBeGreaterThan(0)
  })

  it('allows admin-request hub admins to bypass default visibility filters', () => {
    const hubAdminRoles = [
      {
        type: 'hub',
        role: 'admin',
        hubId: 'hub-a',
      },
    ] as unknown as UserRoleDisco[]

    const result = toQueryConditions(
      {} as never,
      {
        id: 'user-2',
        superAdmin: false,
        isAnonymous: false,
        roles: hubAdminRoles,
      } as unknown as SessionUser,
      true,
      { isPublished: true, isArchived: false },
      hubAdminRoles,
      undefined,
      'hub-a',
    )

    expect(result.conditions).toHaveLength(0)
  })
})
