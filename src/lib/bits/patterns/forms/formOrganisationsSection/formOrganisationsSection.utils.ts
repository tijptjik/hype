import type { SearchResultDisabledMeta } from '$lib/bits/custom/search'

export function toOrganisationSearchDiscriminator(organisation: {
  code?: string | null
  assignedHubCode?: string | null
  isAssignedToOtherHub?: boolean | null
}): string | null | undefined {
  if (organisation.isAssignedToOtherHub) {
    return organisation.code ?? null
  }
  return organisation.code ?? null
}

export function toOrganisationSearchDisabledMeta(organisation: {
  assignedHubCode?: string | null
  isAssignedToOtherHub?: boolean | null
}): SearchResultDisabledMeta | null {
  if (!organisation.isAssignedToOtherHub) return null
  return {
    label: 'Another Hub',
    value: organisation.assignedHubCode ?? null,
  }
}

export function isOrganisationSearchResultDisabled(organisation: {
  isAssignedToOtherHub?: boolean | null
}): boolean {
  return Boolean(organisation.isAssignedToOtherHub)
}
