// TYPES
import type { OmniCollection } from '#lib/enums.js'

export type OmniSearchCollection =
  | `${OmniCollection}`
  | 'layer'
  | 'project'
  | 'organisation'
  | 'station'
  | 'mall'

export type SearchResult = {
  name: string
  count: number
  collectionType: OmniSearchCollection
  ref: string
  lineBadges?: { id: string; color: string; label: string }[]
  enabled?: boolean
  control?: {
    kind: 'filter' | 'target'
    label: string
    pressed?: boolean
    onClick: () => void
  }
}

export type OmniCollectionDescriptor = {
  kind: 'neighbourhood' | 'walk' | (string & {})
  ref: string
}
