import type { Component } from 'svelte'

export interface LayerPropertyCardWrapperProps {
  class?: string
  isAnimated?: boolean
  flipDisabled?: boolean
}

export interface LayerPropertyCardRootProps {
  class?: string
}

export interface LayerPropertyCardBodyProps {
  name?: string | null
  scopeLabel?: string | null
  scopeTone?: 'global' | 'hub' | 'org' | 'project'
  iconTitle?: string | null
  iconComponent?: Component | null
  class?: string
}

export interface LayerPropertyCardActionsProps {
  isVisible: boolean
  isUserContributable: boolean
  isContributableDisabled?: boolean
  isEditing?: boolean
  onVisibleChange?: (next: boolean) => void
  onUserContributableChange?: (next: boolean) => void
  class?: string
}
