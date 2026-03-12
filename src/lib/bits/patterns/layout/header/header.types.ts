import type { Component } from 'svelte'
import type { HTMLAttributes } from 'svelte/elements'
import type { HeaderCrumb } from '$lib/bits/custom/header'

export type HeaderLayoutMode = 'card' | 'table' | 'list'

export interface HeaderTitleMenuItemConfig {
  label: string
  onSelect?: () => void
  icon?: Component | null
  class?: string
  iconClass?: string
}

export interface HeaderTitleMenuActionConfig {
  visible?: boolean
  ariaLabel?: string
  items?: HeaderTitleMenuItemConfig[]
}

export interface HeaderTitleConfig {
  text?: string
  description?: string
  icon?: Component
  href?: string
  crumbs?: HeaderCrumb[]
  menuAction?: HeaderTitleMenuActionConfig
}

export interface HeaderNewConfig {
  isCreatable?: boolean
  onCreate?: () => void
  label?: string
}

export interface HeaderFilterConfig {
  isFilterable?: boolean
  placeholder?: string
  onFilter?: (query: string) => void
}

export interface HeaderFacetItem {
  ref: string
  label: string
  icon?: Component | null
  hasIssues?: boolean
}

export interface HeaderFacetsConfig {
  items?: HeaderFacetItem[]
  active?: string | false
  onFacetChange?: (ref: string) => void
}

export interface HeaderViewActionsConfig {
  visible?: boolean
  showLayoutToggle?: boolean
  showControlsToggle?: boolean
  layoutModes?: HeaderLayoutMode[]
  layoutMode?: HeaderLayoutMode
  controlMode?: boolean
  onLayoutToggle?: (next: HeaderLayoutMode) => void
  onControlsToggle?: (next: boolean) => void
}

export interface HeaderFormActionsConfig {
  visible?: boolean
  isEditing?: boolean
  isTainted?: boolean
  isSubmitting?: boolean
  hasIssues?: boolean
  isPublishing?: boolean
  isDeleting?: boolean
  isDeleted?: boolean
  isPublished?: boolean
  canEdit?: boolean
  disableEdit?: boolean
  canPublish?: boolean
  showDeleteAction?: boolean
  showPublishAction?: boolean
  onEditingToggle?: (next: boolean) => void
  onReset?: () => void
  onSave?: () => void
  onDeleteToggle?: () => void
  onPublishToggle?: () => void
}

export interface HeaderAvatarConfig {
  visible?: boolean
  name?: string | null
  src?: string | null
  alt?: string
  fallback?: string
  onClick?: () => void
  transitionDirection?: 'left' | 'right'
}

export interface HeaderProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  query?: string
  title?: HeaderTitleConfig
  newAction?: HeaderNewConfig
  filter?: HeaderFilterConfig
  facets?: HeaderFacetsConfig
  viewActions?: HeaderViewActionsConfig
  formActions?: HeaderFormActionsConfig
  avatar?: HeaderAvatarConfig
}
