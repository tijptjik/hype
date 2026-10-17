import type {
  Feature,
  FeatureFromCollection,
} from '#lib/db/zod/schema/feature.types.js'
import type { OmniCollection, OmniMode } from '#lib/enums.js'
import type { SearchResult } from '#lib/context/omni.types.js'
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
  totalCount?: number | null
  hasMore?: boolean
  loading?: boolean
  onLoadMore?: () => void
  onPreview?: (ref: string, active: boolean) => void
  onSelection: (ref: string) => void
}

export type OmnibarSectionHeaderProps = {
  onclick?: () => void
  loading?: boolean
  collectionType: OmniCollection
  totalCount?: number | null
}

export type OmnibarEntryProps = {
  result: SearchResult
  onPreview?: (ref: string, active: boolean) => void
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
  hasMore?: boolean
  loading?: boolean
  onLoadMore?: () => void
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
  | 'isCardOpen'
  | 'isCardOpeningPending'
  | 'showCollectionSwitcher'
  | 'onToggleTray'
  | 'onToggleCard'
  | 'onClose'
> & { hasElevatedChrome: boolean }

export type OmnibarNavigationArrowProps = {
  direction: 'left' | 'right'
  disabled?: boolean
  onClick?: () => void
}

export type OmnibarNewFeatureProps = {
  onCreateFeature: (event: Event) => void
}
