import type { Snippet } from 'svelte'

export interface OverlayBarProps {
  left?: Snippet
  center?: Snippet
  right?: Snippet
  class?: string
  style?: string
  centerStyle?: string
}
