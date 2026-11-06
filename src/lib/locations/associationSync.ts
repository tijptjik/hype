// TYPES
import type { AddressAssociation } from './association'

/** Evidence of an upstream Location identity, distinct from an address component or local ID. */
type SyncIdentity = {
  source?: { ssId: string }
  buildingSource?: { id: string }
  identity?: { ssId?: string }
}

/** Resolve the current sync state without mistaking a local identity for a source match.
 * @param mode Retained sync intent; manual explicitly opts out.
 * @param identity Upstream identity evidence for the selected Location.
 * @returns Not synced, open to sync, or synced using the persisted mode vocabulary.
 */
export function locationSyncMode(
  mode: AddressAssociation['mode'] | undefined,
  identity: SyncIdentity,
): AddressAssociation['mode'] {
  if (mode === 'manual') return 'manual'
  return identity.source?.ssId || identity.buildingSource?.id || identity.identity?.ssId
    ? 'linked'
    : 'unlinked'
}
