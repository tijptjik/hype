import { afterAll, describe, expect, it } from 'vitest'
import authorize from '$lib/api/services/authz'
import type { AuthorizeParams, UserRoleDisco } from '$lib/types'
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

const projectRole = (
  role: 'owner' | 'maintainer' | 'translator' | 'member' | 'user',
  projectId: string,
): UserRoleDisco =>
  ({
    type: 'project',
    role,
    projectId,
    userId: `u-project-${role}-${projectId}`,
  }) as unknown as UserRoleDisco

type Actor = {
  name: string
  userId: string | null
  isAuthenticated: boolean
  userRoles: UserRoleDisco[]
  isSuperAdmin?: boolean
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
  orgOwner: {
    name: 'organisation owner',
    userId: 'u-org-owner-org-1',
    isAuthenticated: true,
    userRoles: [organisationRole('owner', 'org-1')],
  },
  orgMember: {
    name: 'organisation member',
    userId: 'u-org-member-org-1',
    isAuthenticated: true,
    userRoles: [organisationRole('member', 'org-1')],
  },
  projectOwner: {
    name: 'project owner',
    userId: 'u-project-owner-project-1',
    isAuthenticated: true,
    userRoles: [projectRole('owner', 'project-1')],
  },
  projectMaintainer: {
    name: 'project maintainer',
    userId: 'u-project-maintainer-project-1',
    isAuthenticated: true,
    userRoles: [projectRole('maintainer', 'project-1')],
  },
  projectTranslator: {
    name: 'project translator',
    userId: 'u-project-translator-project-1',
    isAuthenticated: true,
    userRoles: [projectRole('translator', 'project-1')],
  },
  projectMember: {
    name: 'project member',
    userId: 'u-project-member-project-1',
    isAuthenticated: true,
    userRoles: [projectRole('member', 'project-1')],
  },
  projectUser: {
    name: 'project user',
    userId: 'u-project-user-project-1',
    isAuthenticated: true,
    userRoles: [projectRole('user', 'project-1')],
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

const actorKey = (actor: Actor): string =>
  Object.entries(ACTORS).find(([, value]) => value === actor)?.[0] ?? 'unknown'

const baseParams = (): AuthorizeParams => ({
  userId: 'u-1',
  userRoles: [],
  isAuthenticated: true,
  isAnonymous: false,
  isSuperAdmin: false,
  resourceType: 'project',
  action: 'readProject',
  resourceId: 'project-1',
  organisationId: 'org-1',
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
  isAnonymous: !actor.isAuthenticated,
  isSuperAdmin: overrides.isSuperAdmin ?? actor.isSuperAdmin,
  userRoles: actor.userRoles,
})

const matrix = createAuthzMatrixReporter('project')
const policyMatrix = createPolicyMatrixReporter('project')

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

describe('project authorization policy matrix', () => {
  describe('readProject', () => {
    const action: AuthorizeParams['action'] = 'readProject'
    const states = [
      {
        name: 'published + non-archived',
        requestedState: { isPublished: true, isArchived: false },
        allowedActors: Object.keys(ACTORS).filter(key => key !== 'anonymous'),
      },
      {
        name: 'unpublished + non-archived',
        requestedState: { isPublished: false, isArchived: false },
        allowedActors: [
          'coreAdmin',
          'hubAdminSame',
          'orgOwner',
          'orgMember',
          'projectOwner',
          'projectMaintainer',
          'projectTranslator',
          'projectMember',
        ],
      },
      {
        name: 'archived',
        requestedState: { isPublished: true, isArchived: true },
        allowedActors: ['coreAdmin', 'hubAdminSame', 'orgOwner', 'projectOwner'],
      },
    ] as const

    for (const stateCase of states) {
      for (const actor of Object.values(ACTORS)) {
        it(`${stateCase.name} :: ${actor.name}`, () => {
          const decision = authorize(
            withActor(actor, {
              action,
              requestedState: stateCase.requestedState,
            }),
          )
          assertMatrix({
            action,
            scenario: stateCase.name,
            actor: actor.name,
            expected: stateCase.allowedActors.includes(actorKey(actor)),
            actual: decision.allowed,
            code: decision.code,
          })
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
      assertMatrix({
        action,
        scenario: 'requestedState required',
        actor: ACTORS.unrelated.name,
        expected: false,
        actual: decision.allowed,
        code: decision.code,
      })
      expect(decision.code).toBe('REQUEST_STATE_REQUIRED')
    })
  })

  describe('listProjects', () => {
    const action: AuthorizeParams['action'] = 'listProjects'

    it('allows membership actors to request unpublished + non-archived', () => {
      const allowed = [
        ACTORS.orgOwner,
        ACTORS.orgMember,
        ACTORS.projectOwner,
        ACTORS.projectMaintainer,
        ACTORS.projectTranslator,
        ACTORS.projectMember,
      ]

      for (const actor of allowed) {
        const decision = authorize(
          withActor(actor, {
            action,
            resourceId: undefined,
            organisationId: undefined,
            requestedState: { isPublished: false, isArchived: false },
          }),
        )
        assertMatrix({
          action,
          scenario: 'unpublished list',
          actor: actor.name,
          expected: true,
          actual: decision.allowed,
          code: decision.code,
        })
      }
    })

    it('allows only strong actors for archived lists', () => {
      const allowed = ['coreAdmin', 'hubAdminSame', 'orgOwner', 'projectOwner']

      for (const actor of Object.values(ACTORS)) {
        const decision = authorize(
          withActor(actor, {
            action,
            resourceId: undefined,
            organisationId: undefined,
            requestedState: { isPublished: true, isArchived: true },
          }),
        )
        assertMatrix({
          action,
          scenario: 'archived list',
          actor: actor.name,
          expected: allowed.includes(actorKey(actor)),
          actual: decision.allowed,
          code: decision.code,
        })
      }
    })

    it('requires requestedState', () => {
      const decision = authorize(
        withActor(ACTORS.coreAdmin, {
          action,
          requestedState: undefined,
        }),
      )
      assertMatrix({
        action,
        scenario: 'requestedState required',
        actor: ACTORS.coreAdmin.name,
        expected: false,
        actual: decision.allowed,
        code: decision.code,
      })
      expect(decision.code).toBe('REQUEST_STATE_REQUIRED')
    })
  })

  describe('createProject', () => {
    const action: AuthorizeParams['action'] = 'createProject'
    const expectedByActor: Record<string, boolean> = {
      coreAdmin: true,
      hubAdminSame: true,
      hubAdminOther: false,
      orgOwner: true,
      orgMember: false,
      projectOwner: false,
      projectMaintainer: false,
      projectTranslator: false,
      projectMember: false,
      projectUser: false,
      unrelated: false,
      anonymous: false,
    }

    for (const [key, actor] of Object.entries(ACTORS)) {
      it(`${actor.name}`, () => {
        const decision = authorize(withActor(actor, { action }))
        assertMatrix({
          action,
          scenario: 'create',
          actor: actor.name,
          expected: expectedByActor[key],
          actual: decision.allowed,
          code: decision.code,
        })
      })
    }
  })

  describe('updateProject / manageProjectRoles / publishProject', () => {
    const actions: Array<AuthorizeParams['action']> = [
      'updateProject',
      'manageProjectRoles',
      'publishProject',
    ]

    const expectedByActor: Record<string, boolean> = {
      coreAdmin: true,
      hubAdminSame: true,
      hubAdminOther: false,
      orgOwner: true,
      orgMember: false,
      projectOwner: true,
      projectMaintainer: true,
      projectTranslator: false,
      projectMember: false,
      projectUser: false,
      unrelated: false,
      anonymous: false,
    }

    for (const action of actions) {
      for (const [key, actor] of Object.entries(ACTORS)) {
        it(`${action} :: ${actor.name}`, () => {
          const decision = authorize(withActor(actor, { action, fields: [] }))
          assertMatrix({
            action,
            scenario: 'write',
            actor: actor.name,
            expected: expectedByActor[key],
            actual: decision.allowed,
            code: decision.code,
          })
        })
      }
    }
  })

  describe('deleteProject', () => {
    const action: AuthorizeParams['action'] = 'deleteProject'
    const expectedByActor: Record<string, boolean> = {
      coreAdmin: true,
      hubAdminSame: true,
      hubAdminOther: false,
      orgOwner: true,
      orgMember: false,
      projectOwner: true,
      projectMaintainer: false,
      projectTranslator: false,
      projectMember: false,
      projectUser: false,
      unrelated: false,
      anonymous: false,
    }

    for (const [key, actor] of Object.entries(ACTORS)) {
      it(`${actor.name}`, () => {
        const decision = authorize(withActor(actor, { action }))
        assertMatrix({
          action,
          scenario: 'delete',
          actor: actor.name,
          expected: expectedByActor[key],
          actual: decision.allowed,
          code: decision.code,
        })
      })
    }
  })

  describe('manageCapabilities', () => {
    const action: AuthorizeParams['action'] = 'manageCapabilities'
    const expectedByActor: Record<string, boolean> = {
      coreAdmin: true,
      hubAdminSame: true,
      hubAdminOther: false,
      orgOwner: true,
      orgMember: false,
      projectOwner: true,
      projectMaintainer: false,
      projectTranslator: false,
      projectMember: false,
      projectUser: false,
      unrelated: false,
      anonymous: false,
    }

    for (const [key, actor] of Object.entries(ACTORS)) {
      it(`${actor.name}`, () => {
        const decision = authorize(withActor(actor, { action }))
        assertMatrix({
          action,
          scenario: 'manage capabilities',
          actor: actor.name,
          expected: expectedByActor[key],
          actual: decision.allowed,
          code: decision.code,
        })
      })
    }
  })

  describe('assignCapabilities', () => {
    const action: AuthorizeParams['action'] = 'assignCapabilities'
    const expectedByActor: Record<string, boolean> = {
      coreAdmin: true,
      hubAdminSame: true,
      hubAdminOther: false,
      orgOwner: true,
      orgMember: false,
      projectOwner: true,
      projectMaintainer: true,
      projectTranslator: false,
      projectMember: false,
      projectUser: false,
      unrelated: false,
      anonymous: false,
    }

    for (const [key, actor] of Object.entries(ACTORS)) {
      it(`${actor.name}`, () => {
        const decision = authorize(withActor(actor, { action }))
        assertMatrix({
          action,
          scenario: 'assign capabilities',
          actor: actor.name,
          expected: expectedByActor[key],
          actual: decision.allowed,
          code: decision.code,
        })
      })
    }
  })

  describe('updateProject field-level restrictions', () => {
    it('allows translator updates for i18n fields only', () => {
      const i18nDecision = authorize(
        withActor(ACTORS.projectTranslator, {
          action: 'updateProject',
          fields: ['i18n'],
        }),
      )
      assertMatrix({
        action: 'updateProject',
        scenario: 'translator i18n-only',
        actor: ACTORS.projectTranslator.name,
        expected: true,
        actual: i18nDecision.allowed,
        code: i18nDecision.code,
      })

      const nonI18nDecision = authorize(
        withActor(ACTORS.projectTranslator, {
          action: 'updateProject',
          fields: ['code'],
        }),
      )
      assertMatrix({
        action: 'updateProject',
        scenario: 'translator non-i18n',
        actor: ACTORS.projectTranslator.name,
        expected: false,
        actual: nonI18nDecision.allowed,
        code: nonI18nDecision.code,
      })
      policyMatrix.recordField({
        action: 'updateProject',
        fieldGroup: 'i18n',
        actor: ACTORS.projectTranslator.name,
        expected: true,
        actual: i18nDecision.allowed,
        code: i18nDecision.code,
      })
      policyMatrix.recordField({
        action: 'updateProject',
        fieldGroup: 'other project fields',
        actor: ACTORS.projectTranslator.name,
        expected: false,
        actual: nonI18nDecision.allowed,
        code: nonI18nDecision.code,
      })
      expect(nonI18nDecision.code).toBe('INSUFFICIENT_ROLE')
    })

    it('allows core admin to write organisationId', () => {
      const ownerDecision = authorize(
        withActor(ACTORS.projectOwner, {
          action: 'updateProject',
          fields: ['organisationId'],
        }),
      )
      expect(ownerDecision.allowed).toBe(false)
      expect(ownerDecision.code).toBe('FIELD_FORBIDDEN')

      const coreDecision = authorize(
        withActor(ACTORS.coreAdmin, {
          action: 'updateProject',
          fields: ['organisationId'],
        }),
      )
      policyMatrix.recordField({
        action: 'updateProject',
        fieldGroup: 'organisationId',
        actor: ACTORS.projectOwner.name,
        expected: false,
        actual: ownerDecision.allowed,
        code: ownerDecision.code,
      })
      policyMatrix.recordField({
        action: 'updateProject',
        fieldGroup: 'organisationId',
        actor: ACTORS.coreAdmin.name,
        expected: true,
        actual: coreDecision.allowed,
        code: coreDecision.code,
      })
      expect(coreDecision.allowed).toBe(true)
    })

    it('allows maintainers to write non-i18n standard project fields', () => {
      const decision = authorize(
        withActor(ACTORS.projectMaintainer, {
          action: 'updateProject',
          fields: ['code', 'properties'],
        }),
      )
      policyMatrix.recordField({
        action: 'updateProject',
        fieldGroup: 'other project fields',
        actor: ACTORS.projectMaintainer.name,
        expected: true,
        actual: decision.allowed,
        code: decision.code,
      })
      expect(decision.allowed).toBe(true)
    })
  })

  describe('move project authorization composition', () => {
    const canMoveProject = (params: {
      actor: Actor
      source: { projectId: string; organisationId: string; hubId: string | null }
      target: { organisationId: string; hubId: string | null }
    }): { allowed: boolean; createAllowed: boolean; deleteAllowed: boolean } => {
      const createDecision = authorize(
        withActor(params.actor, {
          action: 'createProject',
          resourceId: undefined,
          organisationId: params.target.organisationId,
          resourceHubId: params.target.hubId,
          fields: [],
        }),
      )
      const deleteDecision = authorize(
        withActor(params.actor, {
          action: 'deleteProject',
          resourceId: params.source.projectId,
          organisationId: params.source.organisationId,
          resourceHubId: params.source.hubId,
          fields: ['isArchived'],
        }),
      )

      return {
        allowed: createDecision.allowed && deleteDecision.allowed,
        createAllowed: createDecision.allowed,
        deleteAllowed: deleteDecision.allowed,
      }
    }

    it('requires both create(target) and delete(source) permissions', () => {
      const source = {
        projectId: 'project-1',
        organisationId: 'org-1',
        hubId: 'hub-a',
      }

      const sourceOwnerMove = canMoveProject({
        actor: ACTORS.orgOwner,
        source,
        target: { organisationId: 'org-2', hubId: 'hub-a' },
      })
      expect(sourceOwnerMove.createAllowed).toBe(false)
      expect(sourceOwnerMove.deleteAllowed).toBe(true)
      expect(sourceOwnerMove.allowed).toBe(false)

      const targetOwner: Actor = {
        name: 'organisation owner (target)',
        userId: 'u-org-owner-org-2',
        isAuthenticated: true,
        userRoles: [organisationRole('owner', 'org-2')],
      }
      const targetOwnerMove = canMoveProject({
        actor: targetOwner,
        source,
        target: { organisationId: 'org-2', hubId: 'hub-a' },
      })
      expect(targetOwnerMove.createAllowed).toBe(true)
      expect(targetOwnerMove.deleteAllowed).toBe(false)
      expect(targetOwnerMove.allowed).toBe(false)
    })

    it('allows scoped hub admin moves only inside scoped hub', () => {
      const source = {
        projectId: 'project-1',
        organisationId: 'org-1',
        hubId: 'hub-a',
      }

      const sameHubMove = canMoveProject({
        actor: ACTORS.hubAdminSame,
        source,
        target: { organisationId: 'org-2', hubId: 'hub-a' },
      })
      expect(sameHubMove.allowed).toBe(true)

      const otherHubMove = canMoveProject({
        actor: ACTORS.hubAdminSame,
        source,
        target: { organisationId: 'org-3', hubId: 'hub-b' },
      })
      expect(otherHubMove.createAllowed).toBe(false)
      expect(otherHubMove.allowed).toBe(false)
    })
  })
})
