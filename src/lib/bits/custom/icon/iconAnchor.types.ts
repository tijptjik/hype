import type { Component, Snippet } from 'svelte'

export interface IconAnchorProps {
  icon: Component<Record<string, unknown>>
  children?: Snippet
  position?: 'left' | 'right'
  open?: boolean
  label?: string
  class?: string
  triggerClass?: string
  contentClass?: string
  sideOffset?: number
}

export interface LazyIconAnchorProps {
  icon: Component<Record<string, unknown>>
  loadingIcon?: Component<Record<string, unknown>>
  children?: Snippet
  position?: 'left' | 'right'
  open?: boolean
  label?: string
  class?: string
  triggerClass?: string
  contentClass?: string
  loading?: boolean
  showContent?: boolean
  onOpenIntent?: () => void | Promise<void>
}
