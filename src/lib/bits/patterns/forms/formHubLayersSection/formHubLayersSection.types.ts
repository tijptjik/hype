import type { LocaleKey } from '#lib/types.js'

export type HubLayerSectionItem = {
  id: string
  organisationId: string
  organisationName: string
  projectNameShort: string
  layerName: string
  isDefaultVisible: boolean
}

export interface FormHubLayersSectionProps {
  title: string
  subtitle?: string
  localeKey: LocaleKey
  items: HubLayerSectionItem[]
  /** Reserve grouped row geometry while the resource is loading. */
  loading?: boolean
  issues?: string[]
  hiddenLayerDefaultInputAttrs?: Array<Record<string, unknown>>
  isEditing?: boolean
  isSubmitting?: boolean
  onAdd?: () => void
  onToggleDefault: (layerId: string, checked: boolean) => void
  class?: string
}
