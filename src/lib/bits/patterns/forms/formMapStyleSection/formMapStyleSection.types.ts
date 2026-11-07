export interface MapStyleSelectionItem extends Record<string, unknown> {
  id: string
  code: string
  displayCode?: string | null
  previewImagePath?: string | null
  i18n?: {
    en?: {
      name?: string
      description?: string | null
    }
  } | null
}

export interface FormMapStyleSectionProps {
  title: string
  subtitle?: string
  availableMapStyles: MapStyleSelectionItem[]
  selectedMapStyle?: MapStyleSelectionItem | null
  /** Fixed public embeds cannot inherit account preferences. */
  allowUserPreference?: boolean
  additionalMapStyles?: MapStyleSelectionItem[]
  hiddenMapStyleInputAttrs?: Array<Record<string, unknown>> | null
  isEditing?: boolean
  isSubmitting?: boolean
  isSubmitRequested?: boolean
  startInAddingMode?: boolean
  onSelectMapStyle: (mapStyle: MapStyleSelectionItem) => void
  class?: string
}

export interface FormMapStyleSectionActionsProps {
  isAdding: boolean
  isEditing?: boolean
  isSubmitting?: boolean
  onToggleAdding: () => void
}
