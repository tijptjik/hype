export interface ResourceCardRootProps {
  class?: string
}

export interface ResourceCardMediaProps {
  image?: string | null
  alt?: string | null
  class?: string
}

export interface ResourceCardBodyProps {
  code?: string | null
  name?: string | null
  class?: string
}

export interface ResourceCardActionsProps {
  isRemoving?: boolean
  isEditing?: boolean
  isSubmitting?: boolean
  canSetCoreInclusive?: boolean
  isHubExclusive: boolean
  isCoreInclusive: boolean
  onToggleHubExclusive: (nextValue: boolean) => void
  onToggleCoreInclusive: (nextValue: boolean) => void
  onRemove: () => void
  class?: string
}
