import { describe, expect, it } from 'vitest'
import { toQueryConditions } from '$lib/api/services/project'
import type { SessionUser } from '$lib/types'

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
})
