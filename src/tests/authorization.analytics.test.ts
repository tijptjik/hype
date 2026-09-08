import { describe, expect, it } from 'vitest'
import { resolveAnalyticsScope } from '$lib/api/services/authz/analytics'
import type { AssetAnalyticsScope, UserRoleDisco } from '$lib/types'

const scope = (overrides: Partial<AssetAnalyticsScope> = {}): AssetAnalyticsScope => ({
  scopePrefixes: [],
  organisationIds: [],
  projectIds: [],
  ...overrides,
})

const dbWithResponses = (responses: unknown[][]) => ({
  select: () => ({
    from: () => ({
      where: async () => responses.shift() ?? [],
    }),
  }),
})

const organisationOwner = (organisationId: string): UserRoleDisco =>
  ({
    type: 'organisation',
    organisationId,
    role: 'owner',
    userId: 'user-1',
  }) as UserRoleDisco

const projectOwner = (projectId: string): UserRoleDisco =>
  ({
    type: 'project',
    projectId,
    role: 'owner',
    userId: 'user-1',
  }) as UserRoleDisco

const scopedHubAdmin = (hubId: string): UserRoleDisco =>
  ({
    type: 'hub',
    hubId,
    role: 'admin',
    userId: 'user-1',
    hub: { code: hubId },
  }) as unknown as UserRoleDisco

describe('resolveAnalyticsScope', () => {
  it('allows global actors to retain explicit filters', async () => {
    const result = await resolveAnalyticsScope({
      db: {} as never,
      user: { superAdmin: true },
      userRoles: [],
      requestedScope: scope({
        scopePrefixes: ['h/other/'],
        organisationIds: ['org-2'],
        projectIds: ['project-2'],
      }),
    })

    expect(result).toEqual({
      allowed: true,
      scope: {
        scopePrefixes: ['h/other/'],
        organisationIds: ['org-2'],
        projectIds: ['project-2'],
      },
    })
  })

  it('derives organisation-owner scope and rejects a foreign project', async () => {
    const result = await resolveAnalyticsScope({
      db: dbWithResponses([[{ id: 'project-1' }]]) as never,
      user: { superAdmin: false },
      userRoles: [organisationOwner('org-1')],
      requestedScope: scope({ projectIds: ['project-foreign'] }),
    })

    expect(result).toEqual({ allowed: false, code: 'INSUFFICIENT_ROLE' })
  })

  it('derives all descendants for an organisation owner when no filter is supplied', async () => {
    const result = await resolveAnalyticsScope({
      db: dbWithResponses([[{ id: 'project-1' }]]) as never,
      user: { superAdmin: false },
      userRoles: [organisationOwner('org-1')],
      requestedScope: scope(),
    })

    expect(result).toEqual({
      allowed: true,
      scope: {
        scopePrefixes: [],
        organisationIds: ['org-1'],
        projectIds: ['project-1'],
      },
    })
  })

  it('does not let a project owner broaden to another organisation', async () => {
    const result = await resolveAnalyticsScope({
      db: {} as never,
      user: { superAdmin: false },
      userRoles: [projectOwner('project-1')],
      requestedScope: scope({ organisationIds: ['org-foreign'] }),
    })

    expect(result).toEqual({ allowed: false, code: 'INSUFFICIENT_ROLE' })
  })

  it('derives organisation and project descendants for a scoped hub admin', async () => {
    const result = await resolveAnalyticsScope({
      db: dbWithResponses([[{ id: 'org-1' }], [{ id: 'project-1' }]]) as never,
      user: { superAdmin: false },
      userRoles: [scopedHubAdmin('hub-1')],
      requestedScope: scope(),
    })

    expect(result).toEqual({
      allowed: true,
      scope: {
        scopePrefixes: [],
        organisationIds: ['org-1'],
        projectIds: ['project-1'],
      },
    })
  })
})
