import { afterAll, describe, expect, it } from 'vitest'
import {
  authorizeFeatureCreateForSubmission,
  authorizeFeatureDeleteForSubmission,
  authorizeFeatureListForContext,
  authorizeFeaturePublishForSubmission,
  authorizeFeatureReadForProbe,
  authorizeFeatureUpdateForSubmission,
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

const projectRole = (
  role: 'owner' | 'maintainer' | 'translator' | 'member',
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
  id: 'feature-1',
  organisationId: 'org-1',
  projectId: 'project-1',
  layerId: 'layer-1',
  resourceHubId: 'hub-a',
}

const matrix = createPolicyMatrixReporter('feature')

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

describe('feature authorization policy matrix', () => {
  describe('list/read', () => {
    const states = [
      {
        name: 'published + non-archived',
        requestedState: { isPublished: true, isArchived: false },
        allowed: [
          'coreAdmin',
          'hubAdminSame',
          'hubAdminOther',
          'projectOwner',
          'projectMaintainer',
          'projectTranslator',
          'projectMember',
          'unrelated',
          'anonymous',
        ],
      },
      {
        name: 'unpublished + non-archived',
        requestedState: { isPublished: false, isArchived: false },
        allowed: [
          'coreAdmin',
          'hubAdminSame',
          'projectOwner',
          'projectMaintainer',
          'projectTranslator',
        ],
      },
      {
        name: 'archived',
        requestedState: { isPublished: true, isArchived: true },
        allowed: ['coreAdmin', 'hubAdminSame', 'projectOwner', 'projectMaintainer'],
      },
    ] as const

    for (const stateCase of states) {
      for (const [key, actor] of Object.entries(ACTORS)) {
        it(`list :: ${stateCase.name} :: ${actor.name}`, () => {
          const decision = authorizeFeatureListForContext({
            ...actorBase(actor),
            requestedListState: stateCase.requestedState,
            resourceHubId: 'hub-a',
          })
          assertAction({
            action: 'listFeatures',
            scenario: stateCase.name,
            actor: actor.name,
            expected: stateCase.allowed.includes(key),
            actual: decision.allowed,
            code: decision.code,
          })
        })

        it(`read :: ${stateCase.name} :: ${actor.name}`, () => {
          const decision = authorizeFeatureReadForProbe({
            ...actorBase(actor),
            probe: {
              ...resource,
              isPublished: stateCase.requestedState.isPublished,
              isArchived: stateCase.requestedState.isArchived,
            },
          })
          assertAction({
            action: 'readFeature',
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
      ['createFeature', authorizeFeatureCreateForSubmission],
      ['publishFeature', authorizeFeaturePublishForSubmission],
      ['deleteFeature', authorizeFeatureDeleteForSubmission],
    ] as const
    const allowed = ['coreAdmin', 'hubAdminSame', 'projectOwner', 'projectMaintainer']

    for (const [action, fn] of actions) {
      for (const [key, actor] of Object.entries(ACTORS)) {
        it(`${action} :: ${actor.name}`, () => {
          const decision = fn({
            ...actorBase(actor),
            resource,
            submittedData: { i18n: {} },
          })
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

  describe('updateFeature field-level restrictions', () => {
    it('allows translator i18n-only updates', () => {
      const decision = authorizeFeatureUpdateForSubmission({
        ...actorBase(ACTORS.projectTranslator),
        resource,
        submittedData: { i18n: { en: { name: 'Translated' } } },
      })
      matrix.recordField({
        action: 'updateFeature',
        fieldGroup: 'i18n',
        actor: ACTORS.projectTranslator.name,
        expected: true,
        actual: decision.allowed,
        code: decision.code,
      })
      expect(decision.allowed).toBe(true)
    })

    it('denies translator non-i18n updates', () => {
      const decision = authorizeFeatureUpdateForSubmission({
        ...actorBase(ACTORS.projectTranslator),
        resource,
        submittedData: { geometry: { type: 'Point' } },
      })
      matrix.recordField({
        action: 'updateFeature',
        fieldGroup: 'other feature fields',
        actor: ACTORS.projectTranslator.name,
        expected: false,
        actual: decision.allowed,
        code: decision.code,
      })
      expect(decision.allowed).toBe(false)
      expect(decision.code).toBe('FIELD_FORBIDDEN')
    })

    it('allows maintainer standard field updates', () => {
      const decision = authorizeFeatureUpdateForSubmission({
        ...actorBase(ACTORS.projectMaintainer),
        resource,
        submittedData: { geometry: { type: 'Point' }, addressMeta: {} },
      })
      matrix.recordField({
        action: 'updateFeature',
        fieldGroup: 'other feature fields',
        actor: ACTORS.projectMaintainer.name,
        expected: true,
        actual: decision.allowed,
        code: decision.code,
      })
      expect(decision.allowed).toBe(true)
    })
  })
})
