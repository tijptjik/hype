/** Derive the importer-owned identity for a published building.
 * @param buildingId Stable catalogue identity, independent of its address alternatives.
 * @param visibility Explicit shared or exclusive ownership.
 * @param organisationId Owner required for exclusive identities.
 * @returns The same deterministic ID used by imports and read-only details lookup.
 */
export async function buildingLocationId(
  buildingId: string,
  visibility: 'shared' | 'exclusive',
  organisationId: string | null = null,
): Promise<string> {
  if (!buildingId || (visibility === 'exclusive' && !organisationId))
    throw new Error('BUILDING_IDENTITY_REQUIRED')
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(
      JSON.stringify([
        'building-export',
        visibility === 'exclusive' ? organisationId : null,
        visibility,
        buildingId,
      ]),
    ),
  )
  return `building:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`
}
