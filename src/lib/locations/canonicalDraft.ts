/** Detect a shared unpublished identity without confusing private or organisation-created Locations.
 * @param location Current identity state.
 * @returns Whether the Location is a canonical draft awaiting upstream publication.
 */
export function isCanonicalLocationDraft(location: {
  state: string
  ssId: string | null
  ownerOrganisationId: string | null
}): boolean {
  return (
    location.state === 'unresolved' &&
    location.ssId === null &&
    location.ownerOrganisationId === null
  )
}
