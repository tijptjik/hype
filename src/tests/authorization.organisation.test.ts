import { describe, expect, it } from 'vitest'
import authorize from '$lib/api/services/authz'
import type { AuthorizeParams, UserRoleDisco } from '$lib/types'

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

const organisationRole = (
  role: 'owner' | 'member',
  organisationId: string,
): UserRoleDisco =>
  ({
    type: 'organisation',
    role,
    organisationId,
    userId: `u-org-${role}-${organisationId}`,
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
  owner: {
    name: 'organisation owner',
    userId: 'u-org-owner-org-1',
    isAuthenticated: true,
    userRoles: [organisationRole('owner', 'org-1')],
  },
  member: {
    name: 'organisation member',
    userId: 'u-org-member-org-1',
    isAuthenticated: true,
    userRoles: [organisationRole('member', 'org-1')],
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

const baseParams = (): AuthorizeParams => ({
  userId: 'u-1',
  userRoles: [],
  isAuthenticated: true,
  resourceType: 'organisation',
  action: 'readOrganisation',
  resourceId: 'org-1',
  resourceHubId: 'hub-a',
  requestedState: {
    isPublished: true,
    isArchived: false,
  },
  fields: [],
})

const withActor = (
  actor: Actor,
  overrides: Partial<AuthorizeParams> = {},
): AuthorizeParams => ({
  ...baseParams(),
  ...overrides,
  userId: actor.userId,
  isAuthenticated: actor.isAuthenticated,
  userRoles: actor.userRoles,
})

describe('organisation authorization policy matrix', () => {
  describe('readOrganisation', () => {
    const action: AuthorizeParams['action'] = 'readOrganisation'
    const states = [
      {
        name: 'published + non-archived',
        requestedState: { isPublished: true, isArchived: false },
        allowedActors: [
          'coreAdmin',
          'hubAdminSame',
          'hubAdminOther',
          'owner',
          'member',
          'unrelated',
        ],
      },
      {
        name: 'unpublished + non-archived',
        requestedState: { isPublished: false, isArchived: false },
        allowedActors: ['coreAdmin', 'hubAdminSame', 'owner', 'member'],
      },
      {
        name: 'archived',
        requestedState: { isPublished: true, isArchived: true },
        allowedActors: ['coreAdmin', 'hubAdminSame'],
      },
    ] as const

    for (const stateCase of states) {
      for (const actor of Object.values(ACTORS)) {
        const expected = stateCase.allowedActors.includes(
          actor === ACTORS.coreAdmin
            ? 'coreAdmin'
            : actor === ACTORS.hubAdminSame
              ? 'hubAdminSame'
              : actor === ACTORS.hubAdminOther
                ? 'hubAdminOther'
                : actor === ACTORS.owner
                  ? 'owner'
                  : actor === ACTORS.member
                    ? 'member'
                    : actor === ACTORS.unrelated
                      ? 'unrelated'
                      : 'anonymous',
        )

        it(`${stateCase.name} :: ${actor.name}`, () => {
          const decision = authorize(
            withActor(actor, {
              action,
              requestedState: stateCase.requestedState,
            }),
          )
          expect(decision.allowed).toBe(expected)
        })
      }
    }

    it('requires requestedState', () => {
      const decision = authorize(
        withActor(ACTORS.unrelated, {
          action,
          requestedState: undefined,
        }),
      )
      expect(decision.allowed).toBe(false)
      expect(decision.code).toBe('REQUEST_STATE_REQUIRED')
    })
  })

  describe('listOrganisations', () => {
    const action: AuthorizeParams['action'] = 'listOrganisations'

    it('allows members to request unpublished + non-archived lists', () => {
      const decision = authorize(
        withActor(ACTORS.member, {
          action,
          resourceId: undefined,
          resourceHubId: undefined,
          requestedState: { isPublished: false, isArchived: false },
        }),
      )
      expect(decision.allowed).toBe(true)
    })

    it('denies members for archived lists', () => {
      const decision = authorize(
        withActor(ACTORS.member, {
          action,
          resourceId: undefined,
          resourceHubId: undefined,
          requestedState: { isPublished: true, isArchived: true },
        }),
      )
      expect(decision.allowed).toBe(false)
      expect(decision.code).toBe('INSUFFICIENT_ROLE')
    })

    it('requires requestedState', () => {
      const decision = authorize(
        withActor(ACTORS.coreAdmin, {
          action,
          requestedState: undefined,
        }),
      )
      expect(decision.allowed).toBe(false)
      expect(decision.code).toBe('REQUEST_STATE_REQUIRED')
    })
  })

  describe('createOrganisation', () => {
    const action: AuthorizeParams['action'] = 'createOrganisation'
    const expectedByActor: Record<string, boolean> = {
      coreAdmin: true,
      hubAdminSame: true,
      hubAdminOther: false,
      owner: false,
      member: false,
      unrelated: false,
      anonymous: false,
    }

    for (const [key, actor] of Object.entries(ACTORS)) {
      it(`${actor.name}`, () => {
        const decision = authorize(withActor(actor, { action }))
        expect(decision.allowed).toBe(expectedByActor[key])
      })
    }

    it('denies non-core create when resourceHubId is missing', () => {
      const decision = authorize(
        withActor(ACTORS.hubAdminSame, {
          action,
          resourceHubId: null,
        }),
      )
      expect(decision.allowed).toBe(false)
      expect(decision.code).toBe('HUB_SCOPE_FORBIDDEN')
    })
  })

  describe('updateOrganisation / publishOrganisation / manageOrganisationRoles', () => {
    const actions: Array<AuthorizeParams['action']> = [
      'updateOrganisation',
      'publishOrganisation',
      'manageOrganisationRoles',
    ]
    const expectedByActor: Record<string, boolean> = {
      coreAdmin: true,
      hubAdminSame: true,
      hubAdminOther: false,
      owner: true,
      member: false,
      unrelated: false,
      anonymous: false,
    }

    for (const action of actions) {
      for (const [key, actor] of Object.entries(ACTORS)) {
        it(`${action} :: ${actor.name}`, () => {
          const decision = authorize(withActor(actor, { action, fields: [] }))
          expect(decision.allowed).toBe(expectedByActor[key])
        })
      }
    }
  })

  describe('updateOrganisation field-level restrictions', () => {
    it('only core admin can write hubId/isCoreInclusive', () => {
      const ownerDecision = authorize(
        withActor(ACTORS.owner, {
          action: 'updateOrganisation',
          fields: ['hubId', 'isCoreInclusive'],
        }),
      )
      expect(ownerDecision.allowed).toBe(false)
      expect(ownerDecision.code).toBe('FIELD_FORBIDDEN')

      const coreDecision = authorize(
        withActor(ACTORS.coreAdmin, {
          action: 'updateOrganisation',
          fields: ['hubId', 'isCoreInclusive'],
        }),
      )
      expect(coreDecision.allowed).toBe(true)
    })

    it('isHubExclusive requires strong role', () => {
      const ownerDecision = authorize(
        withActor(ACTORS.owner, {
          action: 'updateOrganisation',
          fields: ['isHubExclusive'],
        }),
      )
      expect(ownerDecision.allowed).toBe(false)
      expect(ownerDecision.code).toBe('FIELD_FORBIDDEN')

      const hubAdminDecision = authorize(
        withActor(ACTORS.hubAdminSame, {
          action: 'updateOrganisation',
          fields: ['isHubExclusive'],
        }),
      )
      expect(hubAdminDecision.allowed).toBe(true)
    })
  })

  describe('deleteOrganisation', () => {
    const action: AuthorizeParams['action'] = 'deleteOrganisation'
    const expectedByActor: Record<string, boolean> = {
      coreAdmin: true,
      hubAdminSame: true,
      hubAdminOther: false,
      owner: false,
      member: false,
      unrelated: false,
      anonymous: false,
    }

    for (const [key, actor] of Object.entries(ACTORS)) {
      it(`${actor.name}`, () => {
        const decision = authorize(withActor(actor, { action }))
        expect(decision.allowed).toBe(expectedByActor[key])
      })
    }
  })

  it('throws NOT_IMPLEMENTED for unsupported resource types', () => {
    expect(() =>
      authorize(
        withActor(ACTORS.coreAdmin, {
          resourceType: 'project',
          action: 'updateOrganisation',
        }),
      ),
    ).toThrow('NOT_IMPLEMENTED')
  })
})
