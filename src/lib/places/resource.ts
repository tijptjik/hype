// TYPES
import type { PlaceFacts } from './model'

/** Standalone Place projection; source payloads and Feature associations stay private. */
export type PlaceResource = {
  id: string
  ssId: string | null
  state: 'linked' | 'manual' | 'unresolved' | 'redirect'
  sourceAvailability: 'current' | 'missing' | 'review'
  ownerProjectId: string | null
  revisionId: string | null
  facts: PlaceFacts | null
}
