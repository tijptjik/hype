/** Persisted identity and revision tokens captured before presenting a source match. */
export type PlaceIdentityBaseline = {
  placeId: string
  expectedState: 'manual' | 'unresolved' | 'linked'
  expectedSsId: string | null
  expectedHistoryId: string | null
  expectedOwnerOrganisationId: string | null
  expectedLatestRevisionId: string
  expectedSourceAvailability: 'current' | 'missing' | 'review'
}
