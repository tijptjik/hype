// DOMAIN
import { equalPlaceValue } from '../../../src/lib/places/baseline'
// TYPES
import type { PlacePublicationPin } from '../../../src/lib/places/sourceClient'

export type MirrorFilters = { taxonomyPrimary?: string }
export type MirrorCheckpoint = {
  version: 2
  pin: PlacePublicationPin
  filters: MirrorFilters
  offset: number
  total: number | null
  complete: boolean
  revisions: string[]
}

/**
 * Read a source-mirror checkpoint under the Address-hydrating protocol.
 * @param raw Parsed retained checkpoint, or undefined for a new mirror.
 * @param pin Exact source publication selected by the caller.
 * @param filters Immutable subset selection.
 * @returns Version-two progress, replaying version-one imports from the start.
 * @remarks Version one could complete without attempting Address hydration. Its
 * offset/revision receipts cannot establish completion under the new protocol.
 */
export function readMirrorCheckpoint(
  raw: unknown,
  pin: PlacePublicationPin,
  filters: MirrorFilters,
): MirrorCheckpoint {
  const fresh: MirrorCheckpoint = {
    version: 2,
    pin,
    filters,
    offset: 0,
    total: null,
    complete: false,
    revisions: [],
  }
  if (raw === undefined) return fresh
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Invalid source mirror checkpoint')
  const value = raw as Record<string, unknown>
  if (
    (value.version !== 1 && value.version !== 2) ||
    !equalPlaceValue(value.pin, pin) ||
    !equalPlaceValue(value.filters, filters)
  )
    throw new Error(
      'Checkpoint belongs to another publication, source subset or protocol',
    )
  if (value.version === 1) return fresh
  if (
    !Number.isSafeInteger(value.offset) ||
    (value.offset as number) < 0 ||
    (value.total !== null &&
      (!Number.isSafeInteger(value.total) ||
        (value.total as number) < (value.offset as number))) ||
    typeof value.complete !== 'boolean' ||
    !Array.isArray(value.revisions) ||
    value.revisions.length !== value.offset ||
    value.revisions.some(id => typeof id !== 'string' || !id) ||
    new Set(value.revisions).size !== value.revisions.length ||
    (value.complete && value.total !== value.offset)
  )
    throw new Error('Invalid hydrated source mirror progress')
  return {
    version: 2,
    pin,
    filters,
    offset: value.offset as number,
    total: value.total as number | null,
    complete: value.complete,
    revisions: [...value.revisions],
  }
}
