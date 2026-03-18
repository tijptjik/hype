import { afterAll, describe, expect, it } from 'vitest'
import {
  authorizeLayerCreateForSubmission,
  authorizeLayerDeleteForSubmission,
  authorizeLayerListForContext,
  authorizeLayerPublishForSubmission,
  authorizeLayerReadForProbe,
  authorizeLayerUpdateForSubmission,
} from '$lib/api/services/authz'
import type { UserRoleDisco } from '$lib/types'
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

const actorBase = (actor: Actor) => ({
  user: {
    id: actor.userId,
    isAnonymous: !actor.isAuthenticated,
    superAdmin: actor.isSuperAdmin ?? false,
  },
  userRoles: actor.userRoles,
})

const resource = {
  id: 'layer-1',
  organisationId: 'org-1',
  projectId: 'project-1',
  hubId: 'hub-a',
}

const matrix = createPolicyMatrixReporter('layer')

const assertAction = (row: {
  action: string
  scenario: string
  actor: string
  expected: boolean
  actual: boolean
  code?: string
}): void => {
  matrix.recordAction(row)
  expect(row.actual).toBe(row.expected)
}

afterAll(() => {
  matrix.flush()
})

describe('layer authorization policy matrix', () => {
  describe('list/read', () => {
    const states = [
      {
        name: 'published + non-archived',
        requestedState: { isPublished: true, isArchived: false },
        allowed: [
          'coreAdmin',
          'hubAdminSame',
          'orgOwner',
          'orgMember',
          'projectOwner',
          'projectMaintainer',
          'projectTranslator',
          'projectMember',
          'projectUser',
        ],
      },
      {
        name: 'unpublished + non-archived',
        requestedState: { isPublished: false, isArchived: false },
        allowed: [
          'coreAdmin',
          'hubAdminSame',
          'orgOwner',
          'projectOwner',
          'projectMaintainer',
        ],
      },
      {
        name: 'archived',
        requestedState: { isPublished: true, isArchived: true },
        allowed: ['coreAdmin', 'hubAdminSame', 'orgOwner', 'projectOwner'],
      },
    ] as const

    for (const stateCase of states) {
      for (const [key, actor] of Object.entries(ACTORS)) {
        it(`list :: ${stateCase.name} :: ${actor.name}`, () => {
          const decision = authorizeLayerListForContext({
            ...actorBase(actor),
            requestedListState: stateCase.requestedState,
            resourceHubId: 'hub-a',
          })
          assertAction({
            action: 'listLayers',
            scenario: stateCase.name,
            actor: actor.name,
            expected: stateCase.allowed.includes(key),
            actual: decision.allowed,
            code: decision.code,
          })
        })

        it(`read :: ${stateCase.name} :: ${actor.name}`, () => {
          const decision = authorizeLayerReadForProbe({
            ...actorBase(actor),
            probe: {
              ...resource,
              isPublished: stateCase.requestedState.isPublished,
              isArchived: stateCase.requestedState.isArchived,
            },
          })
          assertAction({
            action: 'readLayer',
            scenario: stateCase.name,
            actor: actor.name,
            expected: stateCase.allowed.includes(key),
            actual: decision.allowed,
            code: decision.code,
          })
        })
      }
    }
  })

  describe('create/publish/delete', () => {
    const actions = [
      ['createLayer', authorizeLayerCreateForSubmission],
      ['publishLayer', authorizeLayerPublishForSubmission],
      ['deleteLayer', authorizeLayerDeleteForSubmission],
    ] as const
    const allowed = ['coreAdmin', 'hubAdminSame', 'orgOwner', 'projectOwner']

    for (const [action, fn] of actions) {
      for (const [key, actor] of Object.entries(ACTORS)) {
        it(`${action} :: ${actor.name}`, () => {
          const decision = fn({
            ...actorBase(actor),
            resource,
            submittedData: { i18n: {} },
          } as any)
          assertAction({
            action,
            scenario: 'write',
            actor: actor.name,
            expected: allowed.includes(key),
            actual: decision.allowed,
            code: decision.code,
          })
        })
      }
    }
  })

  describe('updateLayer field-level restrictions', () => {
    it('allows translator i18n-only updates', () => {
      const decision = authorizeLayerUpdateForSubmission({
        ...actorBase(ACTORS.projectTranslator),
        resource,
        submittedData: { i18n: { en: { name: 'Layer' } } },
      })
      matrix.recordField({
        action: 'updateLayer',
        fieldGroup: 'i18n',
        actor: ACTORS.projectTranslator.name,
        expected: true,
        actual: decision.allowed,
        code: decision.code,
      })
      expect(decision.allowed).toBe(true)
    })

    it('denies translator non-i18n updates', () => {
      const decision = authorizeLayerUpdateForSubmission({
        ...actorBase(ACTORS.projectTranslator),
        resource,
        submittedData: { metadata: { foo: 'bar' } },
      })
      matrix.recordField({
        action: 'updateLayer',
        fieldGroup: 'other layer fields',
        actor: ACTORS.projectTranslator.name,
        expected: false,
        actual: decision.allowed,
        code: decision.code,
      })
      expect(decision.allowed).toBe(false)
      expect(decision.code).toBe('FIELD_FORBIDDEN')
    })

    it('denies maintainer non-i18n updates', () => {
      const decision = authorizeLayerUpdateForSubmission({
        ...actorBase(ACTORS.projectMaintainer),
        resource,
        submittedData: { metadata: { foo: 'bar' } },
      })
      matrix.recordField({
        action: 'updateLayer',
        fieldGroup: 'other layer fields',
        actor: ACTORS.projectMaintainer.name,
        expected: false,
        actual: decision.allowed,
        code: decision.code,
      })
      expect(decision.allowed).toBe(false)
      expect(decision.code).toBe('FIELD_FORBIDDEN')
    })

    it('allows owner standard field updates', () => {
      const decision = authorizeLayerUpdateForSubmission({
        ...actorBase(ACTORS.projectOwner),
        resource,
        submittedData: { metadata: { foo: 'bar' }, isDefaultVisible: true },
      })
      matrix.recordField({
        action: 'updateLayer',
        fieldGroup: 'other layer fields',
        actor: ACTORS.projectOwner.name,
        expected: true,
        actual: decision.allowed,
        code: decision.code,
      })
      expect(decision.allowed).toBe(true)
    })
  })
})
