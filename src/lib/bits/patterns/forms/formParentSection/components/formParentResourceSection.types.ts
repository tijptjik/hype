import type { Component, Snippet } from 'svelte'
import type {
  FormParentSectionHeaderContext,
  ParentSectionItemBase,
} from '../formParentSection.types'

export interface FormParentResourceSectionProps<TItem extends ParentSectionItemBase> {
  title: string
  icon?: Component
  subtitle?: string
  issues?: string[]
  subHeader?: Snippet<[FormParentSectionHeaderContext]>
  headerActions?: Snippet
  parent: TItem | null
  fallbackImage?: string | null
  /** Wrap long parent names within compact selector columns. */
  wrapTitle?: boolean
  getSearchFallbackImage?: (item: TItem) => string | null
  hiddenInputAttrs?: Record<string, unknown> | null
  isEditing?: boolean
  isSubmitting?: boolean
  isSubmitRequested?: boolean
  startInAddingMode?: boolean
  searchScopeKey?: string
  closeOnParentChange?: boolean
  onBeginReplaceParent?: () => void
  onCancelReplaceParent?: () => void
  onRemoveParent?: () => void
  onSearch: (query: string) => Promise<TItem[]>
  onReplaceParent: (item: TItem) => void | Promise<void>
  class?: string
}
