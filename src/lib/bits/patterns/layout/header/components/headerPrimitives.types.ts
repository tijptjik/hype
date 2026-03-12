import type {
  AdaptiveToolbarProps,
  AdaptiveToolbarRenderState,
} from '$lib/bits/patterns/layout/adaptiveToolbar'
import type {
  HeaderAvatarConfig,
  HeaderFacetsConfig,
  HeaderFilterConfig,
  HeaderFormActionsConfig,
  HeaderNewConfig,
  HeaderTitleConfig,
  HeaderViewActionsConfig,
} from '../header.types'

export interface HeaderAvatarProps extends HeaderAvatarConfig {}

export interface HeaderFormActionsProps
  extends Omit<HeaderFormActionsConfig, 'isVisible'> {
  hideLabel?: boolean
}

export interface HeaderViewActionsProps
  extends Omit<HeaderViewActionsConfig, 'isVisible'> {
  hideLabel?: boolean
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

export interface HeaderRootRenderState extends AdaptiveToolbarRenderState {}

export interface HeaderRootProps extends AdaptiveToolbarProps {}
