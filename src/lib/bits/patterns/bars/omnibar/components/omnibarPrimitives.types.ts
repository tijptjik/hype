import type { Feature, FeatureFromCollection } from '$lib/db/zod/schema/feature.types'
import type { OmniCollection } from '$lib/enums'
import type { SearchResult } from '$lib/types'
import type { Snippet } from 'svelte'

export type OmnibarRootProps = {
  children?: Snippet
  class?: string
  style?: string
  onkeydown?: (event: KeyboardEvent) => void
}

export type OmnibarSurfaceProps = {
  children?: Snippet
  class?: string
}

export type OmnibarSectionProps = {
  collectionType: OmniCollection
}

export type OmnibarEntryProps = {
  result: SearchResult
  onSelection?: (ref: string) => void
}

export type OmnibarCollectionProps = {
  mode: 'results' | 'navigation'
  items: (FeatureFromCollection | Feature)[]
  hasElevatedChrome?: boolean
}
