// TEST
import { beforeEach, describe, expect, it, vi } from 'vitest'
// DOMAIN
import { requirePlaceOrganisationManager } from '#lib/api/services/placeOwnership.js'
// TYPES
import type { GuardedBaseContext } from '#lib/api/guarded.types.js'

const mocks = vi.hoisted(() => ({ probe: vi.fn() }))
vi.mock('#lib/db/services/organisation.js', () => ({
  probeOrganisationQuery: mocks.probe,
}))

/** Exercise the real Organisation policy while replacing only the persisted resource lookup. */
function context(
  type: string,
  role: string,
  organisationId = 'org',
): GuardedBaseContext {
  return {
    db: {},
    user: { id: 'actor', isAnonymous: false },
    userRoles: [{ type, role, organisationId, projectId: 'project', userId: 'actor' }],
  } as unknown as GuardedBaseContext
}

describe('private Place administration uses Organisation authority', () => {
  beforeEach(() => mocks.probe.mockResolvedValue({ id: 'org', hubId: 'hub' }))

  it('allows the owning Organisation owner', async () => {
    await expect(
      requirePlaceOrganisationManager(context('organisation', 'owner'), 'org'),
    ).resolves.toBeUndefined()
  })

  it.each(['owner', 'manager', 'maintainer'])(
    'rejects a Project %s without Organisation authority',
    async role => {
      await expect(
        requirePlaceOrganisationManager(context('project', role), 'org'),
      ).rejects.toMatchObject({ status: 403 })
    },
  )

  it('rejects an owner of a different Organisation', async () => {
    await expect(
      requirePlaceOrganisationManager(context('organisation', 'owner', 'other'), 'org'),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('rejects a missing persisted Organisation', async () => {
    mocks.probe.mockResolvedValue(null)
    await expect(
      requirePlaceOrganisationManager(context('organisation', 'owner'), 'org'),
    ).rejects.toMatchObject({ status: 404 })
  })
})
