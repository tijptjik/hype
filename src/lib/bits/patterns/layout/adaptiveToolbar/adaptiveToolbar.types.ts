import type { HTMLAttributes } from 'svelte/elements'
import type { Snippet } from 'svelte'

export interface AdaptiveToolbarRenderState {
  showButtonText: boolean
}

export interface AdaptiveToolbarProps extends HTMLAttributes<HTMLElement> {
  class?: string
  left?: Snippet<[AdaptiveToolbarRenderState]>
  right?: Snippet<[AdaptiveToolbarRenderState]>
}
