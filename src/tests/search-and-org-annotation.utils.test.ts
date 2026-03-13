import { describe, expect, it } from 'vitest'
import {
  getFirstEnabledResultButton,
  isSearchResultDisabled,
} from '$lib/bits/custom/search/search.utils'
import {
  isOrganisationSearchResultDisabled,
  toOrganisationSearchDiscriminator,
} from '$lib/bits/patterns/forms/formOrganisationsSection/formOrganisationsSection.utils'

describe('search utils', () => {
  it('uses the resultMap disabled selector when deciding selectability', () => {
    const enabledItem = { id: 'a', blocked: false }
    const disabledItem = { id: 'b', blocked: true }
    const resultMap = {
      image: () => null,
      title: () => 'x',
      disabled: (item: { blocked: boolean }) => item.blocked,
    }

    expect(isSearchResultDisabled(enabledItem, resultMap)).toBe(false)
    expect(isSearchResultDisabled(disabledItem, resultMap)).toBe(true)
  })

  it('finds the first enabled result button and skips disabled buttons', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <button type="button" data-search-result-item="true" disabled>first</button>
      <button type="button" data-search-result-item="true">second</button>
      <button type="button" data-search-result-item="true">third</button>
    `

    const firstEnabled = getFirstEnabledResultButton(root)
    expect(firstEnabled).not.toBeNull()
    expect(firstEnabled?.textContent).toBe('second')
  })
})

describe('organisation search annotation utils', () => {
  it('returns hub annotation for organisations assigned to other hubs', () => {
    const result = toOrganisationSearchDiscriminator({
      code: 'org-a',
      assignedHubCode: 'core',
      isAssignedToOtherHub: true,
    })

    expect(result).toBe('@ core HUB')
  })

  it('falls back to org code and keeps selection enabled for unassigned orgs', () => {
    const org = {
      code: 'org-free',
      isAssignedToOtherHub: false,
    }

    expect(toOrganisationSearchDiscriminator(org)).toBe('org-free')
    expect(isOrganisationSearchResultDisabled(org)).toBe(false)
  })

  it('disables selection and uses ASSIGNED fallback when hub code is absent', () => {
    const org = {
      code: 'org-locked',
      isAssignedToOtherHub: true,
      assignedHubCode: null,
    }

    expect(toOrganisationSearchDiscriminator(org)).toBe('@ ASSIGNED HUB')
    expect(isOrganisationSearchResultDisabled(org)).toBe(true)
  })
})
