import type { Snippet } from 'svelte'

export type FormFeatureSectionHeaderProps = {
  title: string
  subtitle?: string
  issues?: string[]
  class?: string
  left?: Snippet
  right?: Snippet
}

export type FormFeatureSubSectionHeaderProps = {
  title: string
  subtitle?: string
  issues?: string[]
  class?: string
  left?: Snippet
  right?: Snippet
  isEditing?: boolean
  isSearchActive?: boolean
  isSubmitting?: boolean
  isResultsVisible?: boolean
  onToggleAdding?: () => void
}
