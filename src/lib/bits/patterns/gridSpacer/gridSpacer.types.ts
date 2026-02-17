import type { Snippet } from 'svelte'

export interface GridSpacerProps {
  class?: string
  cols?: number
  leftCols?: number
  rightCols?: number
  gap?: string
  left?: Snippet
  right?: Snippet
}
