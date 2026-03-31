import { afterAll, describe, expect, it } from 'vitest'
import {
  authorizeHubCreate,
  authorizeHubDelete,
  authorizeHubList,
  authorizeHubManageRoles,
  authorizeHubPublish,
  authorizeHubRead,
  authorizeHubUpdate,
} from '$lib/api/services/authz'
import type { UserRoleDisco } from '$lib/types'
import { createAuthzMatrixReporter } from './authz-matrix-report'
import { createPolicyMatrixReporter } from './policy-matrix-report'

const coreAdminRole = (): UserRoleDisco =>
  ({
    type: 'hub',
    role: 'admin',
    hubId: 'hub-core',
    userId: 'u-core-admin',
    hub: { code: 'core' },
  }) as unknown as UserRoleDisco

const hubAdminRole = (hubId: string): UserRoleDisco =>
  ({
    type: 'hub',
    role: 'admin',
    hubId,
    userId: `u-hub-admin-${hubId}`,
    hub: { code: hubId },
  }) as unknown as UserRoleDisco

const organisationOwnerRole = (organisationId: string): UserRoleDisco =>
  ({
    type: 'organisation',
    role: 'owner',
    organisationId,
    userId: `u-org-owner-${organisationId}`,
  }) as unknown as UserRoleDisco

type Actor = {
  name: string
  userId: string | null
  isAuthenticated: boolean
  userRoles: UserRoleDisco[]
}

const ACTORS: Record<string, Actor> = {
  coreAdmin: {
    name: 'core admin',
    userId: 'u-core-admin',
    isAuthenticated: true,
    userRoles: [coreAdminRole()],
  },
  hubAdminSame: {
    name: 'hub admin same hub',
    userId: 'u-hub-admin-hub-a',
    isAuthenticated: true,
    userRoles: [hubAdminRole('hub-a')],
  },
  hubAdminOther: {
    name: 'hub admin other hub',
    userId: 'u-hub-admin-hub-b',
    isAuthenticated: true,
    userRoles: [hubAdminRole('hub-b')],
  },
  organisationOwner: {
    name: 'organisation owner',
    userId: 'u-org-owner-org-1',
    isAuthenticated: true,
    userRoles: [organisationOwnerRole('org-1')],
  },
  unrelated: {
    name: 'unrelated authenticated',
    userId: 'u-unrelated',
    isAuthenticated: true,
    userRoles: [],
  },
  anonymous: {
    name: 'anonymous',
    userId: null,
    isAuthenticated: false,
    userRoles: [],
  },
}

const toActor = (actor: Actor) => ({
  userId: actor.userId,
  userRoles: actor.userRoles,
  isAuthenticated: actor.isAuthenticated,
  isAnonymous: !actor.isAuthenticated,
})

const matrix = createAuthzMatrixReporter('hub')
const policyMatrix = createPolicyMatrixReporter('hub')

const assertMatrix = (row: {
  action: string
  scenario: string
  actor: string
  expected: boolean
  actual: boolean
  code?: string
}): void => {
  matrix.record(row)
  expect(row.actual).toBe(row.expected)
}

afterAll(() => {
  matrix.flush()
  policyMatrix.flush()
})

describe('hub authorization policy matrix', () => {
  describe('listHubs', () => {
    const expectedByActor: Record<string, boolean> = {
      coreAdmin: true,
      hubAdminSame: true,
      hubAdminOther: false,
      organisationOwner: false,
      unrelated: false,
      anonymous: false,
    }

    for (const [key, actor] of Object.entries(ACTORS)) {
      it(actor.name, () => {
        const decision = authorizeHubList(toActor(actor), { resourceHubId: 'hub-a' })
        assertMatrix({
          action: 'listHubs',
          scenario: 'list',
          actor: actor.name,
          expected: expectedByActor[key],
          actual: decision.allowed,
          code: decision.code,
        })
      })
    }
  })

  describe('readHub / updateHub / manageHubRoles / publishHub', () => {
    const expectedByActor: Record<string, boolean> = {
      coreAdmin: true,
      hubAdminSame: true,
      hubAdminOther: false,
      organisationOwner: false,
      unrelated: false,
      anonymous: false,
    }

    for (const [key, actor] of Object.entries(ACTORS)) {
      it(`readHub :: ${actor.name}`, () => {
        const decision = authorizeHubRead(toActor(actor), { resourceHubId: 'hub-a' })
        assertMatrix({
          action: 'readHub',
          scenario: 'read',
          actor: actor.name,
          expected: expectedByActor[key],
          actual: decision.allowed,
          code: decision.code,
        })
      })

      it(`updateHub :: ${actor.name}`, () => {
        const decision = authorizeHubUpdate(
          toActor(actor),
          { resourceId: 'hub-a', resourceHubId: 'hub-a' },
          ['code'],
        )
        assertMatrix({
          action: 'updateHub',
          scenario: 'update',
          actor: actor.name,
          expected: expectedByActor[key],
          actual: decision.allowed,
          code: decision.code,
        })
      })

      it(`manageHubRoles :: ${actor.name}`, () => {
        const decision = authorizeHubManageRoles(toActor(actor), {
          resourceId: 'hub-a',
          resourceHubId: 'hub-a',
        })
        assertMatrix({
          action: 'manageHubRoles',
          scenario: 'manage roles',
          actor: actor.name,
          expected: expectedByActor[key],
          actual: decision.allowed,
          code: decision.code,
        })
      })

      it(`publishHub :: ${actor.name}`, () => {
        const decision = authorizeHubPublish(toActor(actor), {
          resourceId: 'hub-a',
          resourceHubId: 'hub-a',
        })
        assertMatrix({
          action: 'publishHub',
          scenario: 'publish',
          actor: actor.name,
          expected: expectedByActor[key],
          actual: decision.allowed,
          code: decision.code,
        })
      })
    }
  })

  describe('createHub / deleteHub', () => {
    const expectedByActor: Record<string, boolean> = {
      coreAdmin: true,
      hubAdminSame: false,
      hubAdminOther: false,
      organisationOwner: false,
      unrelated: false,
      anonymous: false,
    }

    for (const [key, actor] of Object.entries(ACTORS)) {
      it(`createHub :: ${actor.name}`, () => {
        const decision = authorizeHubCreate(toActor(actor), ['code'])
        assertMatrix({
          action: 'createHub',
          scenario: 'create',
          actor: actor.name,
          expected: expectedByActor[key],
          actual: decision.allowed,
          code: decision.code,
        })
      })

      it(`deleteHub :: ${actor.name}`, () => {
        const decision = authorizeHubDelete(toActor(actor), {
          resourceId: 'hub-a',
          resourceHubId: 'hub-a',
        })
        assertMatrix({
          action: 'deleteHub',
          scenario: 'delete',
          actor: actor.name,
          expected: expectedByActor[key],
          actual: decision.allowed,
          code: decision.code,
        })
      })
    }
  })

  it('returns denial code for missing authentication', () => {
    const decision = authorizeHubRead(toActor(ACTORS.anonymous), {
      resourceHubId: 'hub-a',
    })
    expect(decision.allowed).toBe(false)
    expect(decision.code).toBe('UNAUTHENTICATED')
  })

  it('returns HUB_SCOPE_FORBIDDEN for scoped admin creating/deleting', () => {
    const createDecision = authorizeHubCreate(toActor(ACTORS.hubAdminSame), ['code'])
    expect(createDecision.allowed).toBe(false)
    expect(createDecision.code).toBe('HUB_SCOPE_FORBIDDEN')

    const deleteDecision = authorizeHubDelete(toActor(ACTORS.hubAdminSame), {
      resourceId: 'hub-a',
      resourceHubId: 'hub-a',
    })
    expect(deleteDecision.allowed).toBe(false)
    expect(deleteDecision.code).toBe('HUB_SCOPE_FORBIDDEN')
  })

  describe('updateHub field-level restrictions', () => {
    it('allows all hub form fields for core admin', () => {
      const decision = authorizeHubUpdate(
        toActor(ACTORS.coreAdmin),
        { resourceId: 'hub-a', resourceHubId: 'hub-a' },
        ['code', 'domain', 'i18n', 'userRoles', 'organisations', 'isPublished'],
      )
      policyMatrix.recordField({
        action: 'updateHub',
        fieldGroup:
          'all hub form fields (code, domain, i18n, userRoles, organisations, isPublished, isArchived)',
        actor: ACTORS.coreAdmin.name,
        expected: true,
        actual: decision.allowed,
        code: decision.code,
      })
      expect(decision.allowed).toBe(true)
    })

    it('allows all hub form fields for scoped non-core hub admin', () => {
      const decision = authorizeHubUpdate(
        toActor(ACTORS.hubAdminSame),
        { resourceId: 'hub-a', resourceHubId: 'hub-a' },
        ['code', 'domain', 'i18n', 'userRoles', 'organisations', 'isArchived'],
      )
      policyMatrix.recordField({
        action: 'updateHub',
        fieldGroup:
          'all hub form fields (code, domain, i18n, userRoles, organisations, isPublished, isArchived)',
        actor: ACTORS.hubAdminSame.name,
        expected: true,
        actual: decision.allowed,
        code: decision.code,
      })
      expect(decision.allowed).toBe(true)
    })
  })
})
