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
}
