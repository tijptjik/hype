import type { OmniCollection, OmniMode } from '$lib/enums'
import type { SearchResult } from '$lib/types'

export type OmnibarResultSection = {
  collectionType: OmniCollection
  results: SearchResult[]
  limit: number
  onSelection: (ref: string) => void
}

export type OmnibarCollectionItem = {
  id: string
  label: string
}

export type OmnibarSearchProps = {
  term: string
  isTrayOpen: boolean
  sections: OmnibarResultSection[]
  onSearchTermChange: (value: string) => void
  onOpenTray: () => void
  onCloseTray: () => void
  onSelectFirstResult: () => void
  onClearSearchOrCloseTray: () => void
  onCreateFeature: (event: Event) => void
}

export type OmnibarNavigationProps = {
  isTrayOpen: boolean
  isCardOpen: boolean
  isCardOpeningPending: boolean
  showArrows: boolean
  showCollectionSwitcher: boolean
  leftDisabled: boolean
  rightDisabled: boolean
  collectionMetaText: string
  featureTitle: string
  navTitle: string
  items: OmnibarCollectionItem[]
  currentIndex: number
  onPrevious: () => void
  onNext: () => void
  onToggleTray: () => void
  onToggleCard: () => void
  onClose: () => void
  onSelectIndex: (index: number) => void
  onCloseTray: () => void
}

export type OmnibarProps = {
  mode: OmniMode
  hasElevatedChrome: boolean
  horizontalOffset: number
  effectiveAppMainWidth: number
  availableViewportHeight: number
  search: OmnibarSearchProps
  navigation: OmnibarNavigationProps
  onDismiss: () => void
}
