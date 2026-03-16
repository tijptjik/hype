import type { Snippet } from 'svelte'
import type { ImageContextEnvelope } from '$lib/db/zod/schema/image.types'

export interface ParentSectionItemBase extends Record<string, unknown> {
  id: string
  code: string
  i18n?: {
    en?: {
      name?: string
    }
  } | null
  image?: ImageContextEnvelope | null
}

export interface ParentSectionOrganisationItem extends ParentSectionItemBase {}

export interface ParentSectionProjectItem extends ParentSectionItemBase {
  organisationId: string
}

export interface ParentSectionLayerItem extends ParentSectionItemBase {
  organisationId: string
  projectId: string
}

export interface FormParentSectionHeaderContext {
  title: string
  subtitle?: string
  issues: string[]
  isEditing: boolean
  isSearchActive: boolean
  isSubmitting: boolean
  isResultsVisible: boolean
  onToggleAdding: () => void
}

export interface FormParentSectionProps {
  title: string
  subtitle?: string
  issues?: string[]
  subHeader?: Snippet<[FormParentSectionHeaderContext]>
  parent: ParentSectionOrganisationItem | null
  hiddenOrganisationInputAttrs?: Record<string, unknown> | null
  isEditing?: boolean
  isSubmitting?: boolean
  isSubmitRequested?: boolean
  startInAddingMode?: boolean
  searchScopeKey?: string
  onBeginReplaceParent?: () => void
  onCancelReplaceParent?: () => void
  onRemoveParent?: () => void
  onSearchOrganisations: (query: string) => Promise<ParentSectionOrganisationItem[]>
  onReplaceParent: (organisation: ParentSectionOrganisationItem) => void
  class?: string
}

export interface FormParentProjectSectionProps {
  title: string
  subtitle?: string
  issues?: string[]
  subHeader?: Snippet<[FormParentSectionHeaderContext]>
  parent: ParentSectionProjectItem | null
  hiddenProjectInputAttrs?: Record<string, unknown> | null
  isEditing?: boolean
  isSubmitting?: boolean
  isSubmitRequested?: boolean
  startInAddingMode?: boolean
  searchScopeKey?: string
  onBeginReplaceParent?: () => void
  onCancelReplaceParent?: () => void
  onRemoveParent?: () => void
  onSearchProjects: (query: string) => Promise<ParentSectionProjectItem[]>
  onReplaceParent: (project: ParentSectionProjectItem) => void
  class?: string
}

export interface FormParentLayerSectionProps {
  title: string
  subtitle?: string
  issues?: string[]
  subHeader?: Snippet<[FormParentSectionHeaderContext]>
  parent: ParentSectionLayerItem | null
  hiddenLayerInputAttrs?: Record<string, unknown> | null
  isEditing?: boolean
  isSubmitting?: boolean
  isSubmitRequested?: boolean
  startInAddingMode?: boolean
  searchScopeKey?: string
  onBeginReplaceParent?: () => void
  onCancelReplaceParent?: () => void
  onRemoveParent?: () => void
  onSearchLayers: (query: string) => Promise<ParentSectionLayerItem[]>
  onReplaceParent: (layer: ParentSectionLayerItem) => void
  class?: string
}
