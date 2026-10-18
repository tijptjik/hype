// TYPES
import type { OmniCollection } from '#lib/enums.js'

export type SearchResult = {
  name: string
  count: number
  collectionType: OmniCollection
  ref: string
}

export type OmniCollectionDescriptor = {
  kind: 'neighbourhood' | 'walk' | (string & {})
  ref: string
}
