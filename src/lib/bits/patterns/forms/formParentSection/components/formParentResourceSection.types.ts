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
  parent: TItem | null
  fallbackImage?: string | null
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
