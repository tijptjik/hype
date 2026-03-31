import type { Snippet } from 'svelte'

export interface AutoHideProps {
  children: Snippet
  enabled?: boolean
  isOpen?: boolean
  onOpenVisual?: () => void
  onCloseVisual?: () => void
  enterDelay?: number
  leaveDelay?: number
  edgeThreshold?: number
}
