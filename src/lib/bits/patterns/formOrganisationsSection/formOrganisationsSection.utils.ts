export function toOrganisationSearchDiscriminator(organisation: {
  code?: string | null
  assignedHubCode?: string | null
  isAssignedToOtherHub?: boolean | null
}): string | null | undefined {
  if (organisation.isAssignedToOtherHub) {
    return `@ ${organisation.assignedHubCode ?? 'ASSIGNED'} HUB`
  }
  return organisation.code ?? null
}

export function isOrganisationSearchResultDisabled(organisation: {
  isAssignedToOtherHub?: boolean | null
}): boolean {
  return Boolean(organisation.isAssignedToOtherHub)
}
