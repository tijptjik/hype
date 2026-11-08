import { describe, expect, it, vi } from 'vitest'
import { filterCreatableParentProjects } from '#lib/bits/patterns/forms/formFeatureParentSection/formFeatureParentSection.controller.js'
import type { UserRoleDisco } from '#lib/types.js'

const projects = [{ id: 'breadline', organisationId: 'unpublished-org' }]
const user = { id: 'staff', isAnonymous: false }

describe('Feature parent project access', () => {
  it.each(['owner', 'maintainer'])('keeps project %s access when the unpublished organisation cannot be read', async role => {
    const getOrganisationHubId = vi.fn(async () => { throw new Error('INSUFFICIENT_ROLE') })
    expect(await filterCreatableParentProjects({
      projects, user, getOrganisationHubId,
      userRoles: [{ type: 'project', projectId: 'breadline', role }] as UserRoleDisco[],
    })).toEqual(projects)
    expect(getOrganisationHubId).not.toHaveBeenCalled()
  })

  it('does not turn translator access into feature assignment authority', async () => {
    const getOrganisationHubId = vi.fn(async () => { throw new Error('INSUFFICIENT_ROLE') })
    expect(await filterCreatableParentProjects({
      projects, user, getOrganisationHubId,
      userRoles: [{ type: 'project', projectId: 'breadline', role: 'translator' }] as UserRoleDisco[],
    })).toEqual([])
    expect(getOrganisationHubId).not.toHaveBeenCalled()
  })

  it('resolves hub ancestry only for hub-scoped admin access', async () => {
    const getOrganisationHubId = vi.fn(async () => 'breadline-hub')
    expect(await filterCreatableParentProjects({
      projects, user, getOrganisationHubId,
      userRoles: [{ type: 'hub', hubId: 'breadline-hub', role: 'admin', hub: { code: 'breadline' } }] as UserRoleDisco[],
    })).toEqual(projects)
    expect(getOrganisationHubId).toHaveBeenCalledWith('unpublished-org')
  })
})
