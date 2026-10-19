import type { Snippet } from 'svelte'

export interface MapStyleCardRootProps {
  class?: string
}

export interface MapStyleCardPreviewProps {
  children?: Snippet
  image?: string | null
  alt?: string | null
  styleCode?: string | null
  class?: string
}

export interface MapStyleCardBodyProps {
  code?: string | null
  name?: string | null
  description?: string | null
  class?: string
}

export interface MapStyleCardActionsProps {
  isRemoving?: boolean
  isEditing?: boolean
  isSubmitting?: boolean
  onRemove: () => void
  class?: string
}
