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

export interface FormParentSectionProps<
  TItem extends ParentSectionItemBase = ParentSectionOrganisationItem,
> {
  title: string
  subtitle?: string
  issues?: string[]
  subHeader?: Snippet<[FormParentSectionHeaderContext]>
  parent: TItem | null
  hiddenInputAttrs?: Record<string, unknown> | null
  isEditing?: boolean
  isSubmitting?: boolean
  isSubmitRequested?: boolean
  startInAddingMode?: boolean
  searchScopeKey?: string
  closeOnParentChange?: boolean
  onBeginReplaceParent?: () => void
  onCancelReplaceParent?: () => void
  onRemoveParent?: () => void
  onSearch: (query: string) => Promise<TItem[]>
  onReplaceParent: (item: TItem) => void
  class?: string
}

export type FormParentProjectSectionProps =
  FormParentSectionProps<ParentSectionProjectItem>

export type FormParentLayerSectionProps = FormParentSectionProps<ParentSectionLayerItem>
