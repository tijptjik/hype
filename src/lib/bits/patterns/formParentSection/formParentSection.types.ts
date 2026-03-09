import type { ImageContextEnvelope } from '$lib/db/zod/schema/image.types'

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

export interface ParentSectionProjectItem {
  id: string
  organisationId: string
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

export interface FormParentProjectSectionProps {
  title: string
  subtitle?: string
  issues?: string[]
  parent: ParentSectionProjectItem | null
  hiddenProjectInputAttrs?: Record<string, unknown> | null
  isEditing?: boolean
  isSubmitting?: boolean
  isSubmitRequested?: boolean
  startInAddingMode?: boolean
  onSearchProjects: (query: string) => Promise<ParentSectionProjectItem[]>
  onReplaceParent: (project: ParentSectionProjectItem) => void
  class?: string
}
