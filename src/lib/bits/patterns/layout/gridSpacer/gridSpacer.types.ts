import type { Snippet } from 'svelte'

export interface GridSpacerProps {
  class?: string
  cols?: number
  leftCols?: number
  centerCols?: number
  rightCols?: number
  gap?: string
  left?: Snippet
  center?: Snippet
  right?: Snippet
}
