import type { Component } from 'svelte'
import type { HTMLAttributes } from 'svelte/elements'
import type { ButtonColor, ButtonStyle } from '$lib/bits/core'

export type HeaderLayoutMode = 'card' | 'table' | 'list'

export interface HeaderCrumb {
  name: string
  href?: string
}

export interface HeaderButtonActionConfig {
  text: string
  onClick?: () => void
  icon?: Component | null
  iconClass?: string
  class?: string
  disabled?: boolean
  color?: ButtonColor
  style?: ButtonStyle
}

export interface HeaderStatusActionConfig {
  text: string
  icon?: Component | null
  iconClass?: string
  class?: string
  ariaLive?: 'off' | 'polite' | 'assertive'
}

export type HeaderActionConfig =
  | ({ kind: 'button' } & HeaderButtonActionConfig)
  | ({ kind: 'status' } & HeaderStatusActionConfig)

export interface HeaderTitleMenuItemConfig {
  label: string
  onSelect?: () => void
  icon?: Component | null
  class?: string
  iconClass?: string
}

export interface HeaderTitleMenuActionConfig {
  isVisible?: boolean
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
  debounceMs?: number
  onFilter?: (query: string) => void
  onFocusChange?: (isFocused: boolean) => void
  onAdvanceFromSearch?: () => void
}

export interface HeaderFacetItem {
  ref: string
  label: string
  icon?: Component | null
  hasIssues?: boolean
  disabled?: boolean
}

export interface HeaderFacetsConfig {
  items?: HeaderFacetItem[]
  active?: string | false
  onFacetChange?: (ref: string) => void
}

export interface HeaderViewActionsConfig {
  isVisible?: boolean
  controlsAction?: HeaderButtonActionConfig
  layoutAction?: HeaderButtonActionConfig
}

export interface HeaderFormActionsConfig {
  isVisible?: boolean
  primaryAction?: HeaderButtonActionConfig | null
  saveAction?: HeaderButtonActionConfig | null
  deleteAction?: HeaderButtonActionConfig | null
  publishAction?: HeaderActionConfig | null
}

export interface HeaderAvatarConfig {
  isVisible?: boolean
  name?: string | null
  src?: string | null
  alt?: string
  fallback?: string
  onClick?: () => void
  transitionDirection?: 'left' | 'right'
}

export interface HeaderLayoutRegionConfig {
  component?: Component<any> | null
  props?: Record<string, unknown>
  isVisible?: boolean
  height?: string
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
  controlBar?: HeaderLayoutRegionConfig | null
  footer?: HeaderLayoutRegionConfig | null
}
