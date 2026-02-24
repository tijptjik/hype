import type { ImageContextEnvelope } from '$lib/types'

export interface ParentSectionOrganisationItem {
  id: string
  code: string
  i18n?: {
    en?: {
      name?: string
    }
  } | null
  image?: ImageContextEnvelope | null
}

export interface FormParentSectionProps {
  title: string
  subtitle?: string
  parent: ParentSectionOrganisationItem | null
  hiddenOrganisationInputAttrs?: Record<string, unknown> | null
  isEditing?: boolean
  isSubmitting?: boolean
  isSubmitRequested?: boolean
  startInAddingMode?: boolean
  onSearchOrganisations: (query: string) => Promise<ParentSectionOrganisationItem[]>
  onReplaceParent: (organisation: ParentSectionOrganisationItem) => void
  class?: string
}
