import type { Feature, FeatureFromCollection } from '$lib/db/zod/schema/feature.types'
import type { OmniCollection, OmniMode } from '$lib/enums'
import type { SearchResult } from '$lib/types'
import type { Snippet } from 'svelte'
import type {
  OmnibarNavigationProps,
  OmnibarResultSection,
  OmnibarSearchProps,
} from '../omnibar.types'

export type OmnibarRootProps = {
  children?: Snippet
  class?: string
  hasElevatedChrome?: boolean
  style?: string
  onkeydown?: (event: KeyboardEvent) => void
}

export type OmnibarSurfaceProps = {
  children?: Snippet
  class?: string
}

export type OmnibarSectionProps = {
  collectionType: OmniCollection
  results: SearchResult[]
  limit: number
  onSelection: (ref: string) => void
}

export type OmnibarSectionHeaderProps = {
  collectionType: OmniCollection
}

export type OmnibarEntryProps = {
  result: SearchResult
  onSelection?: (ref: string) => void
}

export type OmnibarCollectionProps = {
  mode: 'results' | 'navigation'
  items: Array<{ id: string; label: string }> | (FeatureFromCollection | Feature)[]
  hasElevatedChrome?: boolean
  effectiveAppMainWidth?: number
  currentIndex?: number
  navTitle?: string
  onSelectIndex?: (index: number) => void
  onCloseTray?: () => void
}

export type OmnibarResultsProps = {
  sections: OmnibarResultSection[]
}

export type OmnibarSearchBarProps = {
  search: OmnibarSearchProps
  hasElevatedChrome: boolean
  effectiveAppMainWidth: number
}

export type OmnibarNavigationBarProps = {
  mode: OmniMode
  navigation: OmnibarNavigationProps
  hasElevatedChrome: boolean
  effectiveAppMainWidth: number
}

export type OmnibarNavigationHeaderProps = Pick<
  OmnibarNavigationProps,
  | 'collectionMetaText'
  | 'featureTitle'
  | 'hasElevatedChrome'
  | 'isCardOpen'
  | 'isCardOpeningPending'
  | 'showCollectionSwitcher'
  | 'onToggleTray'
  | 'onToggleCard'
  | 'onClose'
>

export type OmnibarNavigationArrowProps = {
  direction: 'left' | 'right'
  disabled?: boolean
  onClick?: () => void
}

export type OmnibarNewFeatureProps = {
  onCreateFeature: (event: Event) => void
}
