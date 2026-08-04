import { describe, expect, it } from 'vitest'
import {
  authorizeFeatureCreateForSubmission,
  authorizeFeatureListForContext,
  authorizeFeatureReadForProbe,
} from '$lib/api/services/authz'

const guest = {
  user: { id: 'guest-1', isAnonymous: true, superAdmin: false },
  userRoles: [],
}

describe('guest authorization', () => {
  it('allows only published, non-archived feature reads', () => {
    expect(
      authorizeFeatureListForContext({
        ...guest,
        requestedListState: { isPublished: true, isArchived: false },
      }).allowed,
    ).toBe(true)
    expect(
      authorizeFeatureReadForProbe({
        ...guest,
        probe: {
          id: 'feature-1',
          isPublished: false,
          isArchived: false,
        },
      }).allowed,
    ).toBe(false)
  })

  it('uses ACCOUNT_REQUIRED for an account-only write', () => {
    const decision = authorizeFeatureCreateForSubmission({
      ...guest,
      resource: {
        id: 'feature-1',
        projectId: 'project-1',
        layerId: 'layer-1',
      },
      submittedData: { i18n: {} },
    })

    expect(decision).toEqual({ allowed: false, code: 'ACCOUNT_REQUIRED' })
  })
})
