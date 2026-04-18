import type { TransitionConfig } from 'svelte/transition'

export type ScrollbarMargin = {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

export type ScrollbarWidth = {
  track?: number
  thumb?: number
  thumbActive?: number
}

export type ScrollbarOpacity = {
  track?: number
  thumb?: number
  thumbActive?: number
}

export type VirtualScrollbarProps = {
  viewportHeight: number
  contentsHeight: number
  scrollTop: number
  onVirtualScroll?: (scrollTop: number) => void
  onVirtualInteractionChange?: (isActive: boolean) => void
  hideAfter?: number
  alwaysVisible?: boolean
  initiallyVisible?: boolean
  showThumbOnTrackEnter?: boolean
  margin?: ScrollbarMargin
  width?: ScrollbarWidth
  opacity?: ScrollbarOpacity
  vTrackIn?: (node: HTMLElement) => TransitionConfig
  vTrackOut?: (node: HTMLElement) => TransitionConfig
  vThumbIn?: (node: HTMLElement) => TransitionConfig
  vThumbOut?: (node: HTMLElement) => TransitionConfig
  onshow?: () => void
  onhide?: () => void
}

export type ScrollbarProps = {
  viewport?: HTMLElement | null
  contents?: HTMLElement | null
  virtual?: boolean
  alwaysVisible?: boolean
  viewportHeight?: number
  contentsHeight?: number
  scrollTop?: number
  onVirtualScroll?: (scrollTop: number) => void
  onVirtualInteractionChange?: (isActive: boolean) => void
  showThumbOnTrackEnter?: boolean
  hideAfter?: number
  initiallyVisible?: boolean
  margin?: ScrollbarMargin
  width?: ScrollbarWidth
  opacity?: ScrollbarOpacity
  vTrackIn?: (node: HTMLElement) => TransitionConfig
  vTrackOut?: (node: HTMLElement) => TransitionConfig
  vThumbIn?: (node: HTMLElement) => TransitionConfig
  vThumbOut?: (node: HTMLElement) => TransitionConfig
  onshow?: () => void
  onhide?: () => void
}
