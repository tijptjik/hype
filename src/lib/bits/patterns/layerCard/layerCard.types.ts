export interface LayerCardWrapperProps {
  class?: string
  isAnimated?: boolean
}

export interface LayerCardRootProps {
  class?: string
}

export interface LayerCardBodyProps {
  name?: string | null
  code?: string | null
  class?: string
}

export interface LayerCardActionsProps {
  isVisible: boolean
  isUserContributable: boolean
  isEditing?: boolean
  onVisibleChange?: (next: boolean) => void
  onUserContributableChange?: (next: boolean) => void
  class?: string
}
