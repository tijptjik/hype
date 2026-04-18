import type { Snippet } from 'svelte'

export interface FormFacetNavAction {
  text: string
  onClick: () => void
  disabled?: boolean
}

export interface FormFacetNavProps {
  previousAction?: FormFacetNavAction | null
  nextAction?: FormFacetNavAction | null
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
