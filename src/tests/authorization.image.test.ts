import { describe, expect, it } from 'vitest'
import { authorizeImageList, authorizeImageRead } from '$lib/api/services/authz/image'

describe('guest image visibility', () => {
  it.each([authorizeImageList, authorizeImageRead])(
    'requires an account for admin-mode image access',
    authorize => {
      const guest = {
        userId: 'guest',
        isAuthenticated: true,
        isAnonymous: true,
        userRoles: [],
      }
      for (const ctxType of [
        'feature',
        'project',
        'organisation',
        'hub',
        'task',
        'user',
      ] as const) {
        for (const isPublished of [false, true]) {
          expect(
            authorize(
              guest,
              { ctxType, ctxId: 'context' },
              { isPublished, isArchived: false },
              { isAdminRequest: true },
            ),
          ).toEqual({ allowed: false, code: 'ACCOUNT_REQUIRED' })
        }
      }
      expect(
        authorize(
          guest,
          { ctxType: 'feature', ctxId: 'feature' },
          { isPublished: true, isArchived: false },
          { isAdminRequest: false },
        ),
      ).toEqual({ allowed: true })
      expect(
        authorize(
          guest,
          { ctxType: 'feature', ctxId: 'feature' },
          { isPublished: false, isArchived: false },
          { isAdminRequest: false },
        ),
      ).toEqual({ allowed: false, code: 'INSUFFICIENT_ROLE' })
    },
  )
})

describe('account image scope', () => {
  it.each([authorizeImageList, authorizeImageRead])(
    'requires a role in the actual resource chain',
    authorize => {
      const actor = {
        userId: 'account',
        isAuthenticated: true,
        isAnonymous: false,
        userRoles: [],
      }
      const target = {
        ctxType: 'feature' as const,
        ctxId: 'feature',
        projectId: 'project',
        organisationId: 'organisation',
        resourceHubId: 'hub',
      }
      const state = { isPublished: false, isArchived: false }
      expect(authorize(actor, target, state, { isAdminRequest: true }).allowed).toBe(
        false,
      )
      for (const role of [
        { type: 'project', role: 'maintainer', projectId: 'project' },
        { type: 'organisation', role: 'owner', organisationId: 'organisation' },
        { type: 'hub', role: 'admin', hubId: 'hub' },
        { type: 'hub', role: 'admin', hubId: 'core', hub: { code: 'core' } },
      ]) {
        expect(
          authorize({ ...actor, userRoles: [role] as never }, target, state, {
            isAdminRequest: true,
          }).allowed,
        ).toBe(true)
      }
      for (const role of [
        { type: 'project', role: 'owner', projectId: 'other' },
        { type: 'organisation', role: 'owner', organisationId: 'other' },
        { type: 'hub', role: 'admin', hubId: 'other' },
      ]) {
        expect(
          authorize({ ...actor, userRoles: [role] as never }, target, state, {
            isAdminRequest: true,
          }).allowed,
        ).toBe(false)
      }
      expect(
        authorize({ ...actor, isSuperAdmin: true }, target, state, {
          isAdminRequest: true,
        }).allowed,
      ).toBe(true)
      expect(
        authorize(actor, { ctxType: 'user', ctxId: 'someone-else' }, state, {
          isAdminRequest: true,
        }).allowed,
      ).toBe(false)
      expect(
        authorize(actor, { ctxType: 'user', ctxId: 'account' }, state, {
          isAdminRequest: true,
        }).allowed,
      ).toBe(true)
    },
  )
})
