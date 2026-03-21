import type { Card } from '$lib/bits/custom'

export interface ResourceCardRootProps {
  class?: string
  isDraggable?: boolean
  reserveDragSpace?: boolean
}

export interface ResourceCardMediaProps {
  size?: Card.CardSize
  image?: string | null
  alt?: string | null
  class?: string
}

export interface ResourceCardBodyProps {
  size?: Card.CardSize
  code?: string | null
  name?: string | null
  class?: string
}

export interface ResourceCardHubActionsProps {
  isRemoving?: boolean
  isEditing?: boolean
  isSubmitting?: boolean
  canSetCoreInclusive?: boolean
  isHubExclusive: boolean
  isCoreInclusive: boolean
  onToggleHubExclusive: (nextValue: boolean) => void
  onToggleCoreInclusive: (nextValue: boolean) => void
  onRemove?: (() => void) | null
  class?: string
}
