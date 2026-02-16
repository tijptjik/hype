import type { Component } from 'svelte'
import type { HTMLAttributes } from 'svelte/elements'
import type { HeaderCrumb } from '$lib/bits/custom/header'

export type HeaderLayoutMode = 'card' | 'table' | 'list'

export interface HeaderTitleConfig {
  text?: string
  description?: string
  icon?: Component
  href?: string
  crumbs?: HeaderCrumb[]
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
  isDeleted?: boolean
  isPublished?: boolean
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
