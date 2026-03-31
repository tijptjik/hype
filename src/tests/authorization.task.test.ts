import { describe, expect, it } from 'vitest'
import {
  authorizeTaskListForContext,
  authorizeTaskReadForProbe,
  authorizeTaskReassignForProbe,
} from '$lib/api/services/authz/task'
import type { UserRoleDisco } from '$lib/types'

const projectRole = (
  role: 'owner' | 'maintainer' | 'translator' | 'user',
  projectId: string,
): UserRoleDisco =>
  ({
    type: 'project',
    role,
    projectId,
    userId: `u-project-${role}-${projectId}`,
  }) as unknown as UserRoleDisco

const organisationRole = (organisationId: string): UserRoleDisco =>
  ({
    type: 'organisation',
    role: 'owner',
    organisationId,
    userId: `u-organisation-owner-${organisationId}`,
  }) as unknown as UserRoleDisco

describe('task authorization', () => {
  describe('authorizeTaskListForContext', () => {
    it('denies unscoped task lists for project maintainers', () => {
      const decision = authorizeTaskListForContext({
        user: { id: 'u-1', isAnonymous: false, superAdmin: false },
        userRoles: [projectRole('maintainer', 'project-1')],
        isAdminRequest: true,
        resourceHubId: 'hub-1',
      })

      expect(decision).toEqual({
        allowed: false,
        code: 'INSUFFICIENT_ROLE',
      })
    })

    it('allows scoped task lists for project maintainers', () => {
      const decision = authorizeTaskListForContext({
        user: { id: 'u-1', isAnonymous: false, superAdmin: false },
        userRoles: [projectRole('maintainer', 'project-1')],
        isAdminRequest: true,
        projectIds: ['project-1'],
        resourceHubId: 'hub-1',
      })

      expect(decision).toEqual({ allowed: true })
    })

    it('allows scoped task lists for organisation owners', () => {
      const decision = authorizeTaskListForContext({
        user: { id: 'u-1', isAnonymous: false, superAdmin: false },
        userRoles: [organisationRole('organisation-1')],
        isAdminRequest: true,
        organisationIds: ['organisation-1'],
        resourceHubId: 'hub-1',
      })

      expect(decision).toEqual({ allowed: true })
    })

    it('denies task lists for low-privilege project roles', () => {
      const decision = authorizeTaskListForContext({
        user: { id: 'u-1', isAnonymous: false, superAdmin: false },
        userRoles: [projectRole('translator', 'project-1')],
        isAdminRequest: true,
        projectIds: ['project-1'],
        resourceHubId: 'hub-1',
      })

      expect(decision).toEqual({
        allowed: false,
        code: 'INSUFFICIENT_ROLE',
      })
    })
  })

  describe('authorizeTaskReadForProbe', () => {
    it('allows organisation owners to read tasks in their organisation', () => {
      const decision = authorizeTaskReadForProbe({
        user: { id: 'u-1', isAnonymous: false, superAdmin: false },
        userRoles: [organisationRole('organisation-1')],
        isAdminRequest: true,
        probe: {
          organisationId: 'organisation-1',
          projectId: 'project-1',
          resourceHubId: 'hub-1',
        },
      })

      expect(decision).toEqual({ allowed: true })
    })

    it('denies low-privilege project roles from reading tasks', () => {
      const decision = authorizeTaskReadForProbe({
        user: { id: 'u-1', isAnonymous: false, superAdmin: false },
        userRoles: [projectRole('translator', 'project-1')],
        isAdminRequest: true,
        probe: {
          organisationId: 'organisation-1',
          projectId: 'project-1',
          resourceHubId: 'hub-1',
        },
      })

      expect(decision).toEqual({
        allowed: false,
        code: 'INSUFFICIENT_ROLE',
      })
    })
  })

  describe('authorizeTaskReassignForProbe', () => {
    it('denies organisation owners from reassigning tasks without project management', () => {
      const decision = authorizeTaskReassignForProbe({
        user: { id: 'u-1', isAnonymous: false, superAdmin: false },
        userRoles: [organisationRole('organisation-1')],
        isAdminRequest: true,
        probe: {
          organisationId: 'organisation-1',
          projectId: 'project-1',
          resourceHubId: 'hub-1',
        },
      })

      expect(decision).toEqual({
        allowed: false,
        code: 'INSUFFICIENT_ROLE',
      })
    })
  })
})
