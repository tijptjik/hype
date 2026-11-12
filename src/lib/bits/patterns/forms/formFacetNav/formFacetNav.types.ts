import type { Snippet } from 'svelte'

export interface FormFacetNavAction {
  text: string
  onClick: () => void
  disabled?: boolean
  /** Center this action in the facet content until results are available. */
  centerInContent?: boolean
  bottomOffset?: number
  emphasis?: boolean
  id?: string
}

export interface FormFacetNavProps {
  previousAction?: FormFacetNavAction | null
  nextAction?: FormFacetNavAction | null
  centerAction?: FormFacetNavAction | null
  class?: string
}

export interface FormFacetNavRootProps {
  class?: string
  children?: Snippet
}

export interface FormFacetNavButtonProps {
  direction: 'previous' | 'next'
  action: FormFacetNavAction
}
