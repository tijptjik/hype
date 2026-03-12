import type { HTMLAttributes } from 'svelte/elements'
import type { Snippet } from 'svelte'
import type {
  HeaderAvatarConfig,
  HeaderFacetsConfig,
  HeaderFilterConfig,
  HeaderFormActionsConfig,
  HeaderLayoutMode,
  HeaderNewConfig,
  HeaderTitleConfig,
  HeaderViewActionsConfig,
} from '../header.types'

export interface HeaderAvatarProps extends HeaderAvatarConfig {}

export interface HeaderFormActionsProps
  extends Omit<HeaderFormActionsConfig, 'visible'> {
  hideLabel?: boolean
}

export interface HeaderViewActionsProps
  extends Omit<HeaderViewActionsConfig, 'visible'> {
  hideLabel?: boolean
  layoutModes?: HeaderLayoutMode[]
}

export interface HeaderFacetsProps extends HeaderFacetsConfig {
  hideLabel?: boolean
}

export interface HeaderSearchProps extends Omit<HeaderFilterConfig, 'isFilterable'> {
  isFilterable?: boolean
  query?: string
}

export interface HeaderNewProps extends Omit<HeaderNewConfig, 'isCreatable'> {
  isCreatable?: boolean
  hideLabel?: boolean
}

export interface HeaderTitleProps extends HeaderTitleConfig {
  hideTitle?: boolean
  hideDescription?: boolean
}

export interface HeaderRootRenderState {
  showDescription: boolean
  showTitle: boolean
  showButtonText: boolean
}

export interface HeaderRootProps extends HTMLAttributes<HTMLElement> {
  class?: string
  measurementKey?: string
  rightRevealKey?: string
  left?: Snippet<[HeaderRootRenderState]>
  right?: Snippet<[HeaderRootRenderState]>
}
