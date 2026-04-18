export type FormProjectLayersSectionItem = {
  id: string
  projectNameShort: string
  layerName: string
  isDefaultVisible: boolean
}

export type FormProjectLayersSectionProps = {
  title: string
  subtitle?: string
  issues?: string[]
  items: FormProjectLayersSectionItem[]
  isEditing?: boolean
  isSubmitting?: boolean
  onToggleDefault: (layerId: string, nextValue: boolean) => void
  onMove: (sourceLayerId: string, targetLayerId: string) => void
  class?: string
}
