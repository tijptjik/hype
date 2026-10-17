// TESTS
import { describe, expect, it } from 'vitest'
// AUTH
import { canBrowseUsers } from '#lib/api/services/authz/userDirectory.js'
// TYPES
import type { UserRoleDisco } from '#lib/types.js'

describe('user directory access', () => {
  it('permits the active hub administrator and core administrators', () => {
    expect(
      canBrowseUsers({
        hubId: 'hub-a',
        userRoles: [
          {
            type: 'hub',
            userId: 'test-user',
            role: 'admin',
            hubId: 'hub-a',
          } as UserRoleDisco,
        ],
      }),
    ).toBe(true)
    expect(
      canBrowseUsers({
        hubId: 'hub-a',
        userRoles: [
          {
            type: 'hub',
            userId: 'test-user',
            role: 'admin',
            hubId: 'core',
            hub: { code: 'core' },
          } as UserRoleDisco,
        ],
      }),
    ).toBe(true)
  })
  it('denies guests, ordinary members, owners, and administrators of other hubs', () => {
    for (const role of [
      { type: 'hub', userId: 'test-user', role: 'admin', hubId: 'hub-b' },
      { type: 'hub', userId: 'test-user', role: 'user', hubId: 'hub-a' },
      { type: 'organisation', role: 'owner' },
      { type: 'project', role: 'owner' },
    ]) {
      expect(
        canBrowseUsers({ hubId: 'hub-a', userRoles: [role as UserRoleDisco] }),
      ).toBe(false)
    }
    expect(canBrowseUsers({ hubId: 'hub-a', userRoles: [] })).toBe(false)
    expect(canBrowseUsers({ isAnonymous: true, superAdmin: true, userRoles: [] })).toBe(
      false,
    )
  })
})
