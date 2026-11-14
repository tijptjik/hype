// TYPES
import type { OmniCollection } from '#lib/enums.js'

export type OmniSearchCollection =
  | `${OmniCollection}`
  | 'layer'
  | 'project'
  | 'organisation'
  | 'station'

export type SearchResult = {
  name: string
  count: number
  collectionType: OmniSearchCollection
  ref: string
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
