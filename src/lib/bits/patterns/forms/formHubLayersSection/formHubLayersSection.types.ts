import type { LocaleKey } from '$lib/types'

export type HubLayerSectionItem = {
  id: string
  projectNameShort: string
  layerName: string
  isDefaultVisible: boolean
}

export interface FormHubLayersSectionProps {
  title: string
  subtitle?: string
  localeKey: LocaleKey
  items: HubLayerSectionItem[]
  issues?: string[]
  hiddenLayerDefaultInputAttrs?: Array<Record<string, unknown>>
  isEditing?: boolean
  isSubmitting?: boolean
  onToggleDefault: (layerId: string, checked: boolean) => void
  class?: string
}
