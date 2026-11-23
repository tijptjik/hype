export type FormProjectLayersSectionItem = {
  id: string
  projectNameShort: string
  layerName: string
  isDefaultVisible: boolean
  isIncluded?: boolean
}

export type FormProjectLayersSectionProps = {
  title: string
  subtitle?: string
  issues?: string[]
  items: FormProjectLayersSectionItem[]
  isEditing?: boolean
  isSubmitting?: boolean
  onToggleDefault: (layerId: string, nextValue: boolean) => void
  onToggleIncluded?: (layerId: string, included: boolean) => void
  defaultControl?: 'visibility' | 'selection'
  onMove?: (sourceLayerId: string, targetLayerId: string) => void
  class?: string
}
