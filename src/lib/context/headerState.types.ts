// TYPES
import type { NavigableResource } from '#lib/types.js'
import type { ResourceIndexUi } from '#lib/context/resourceIndexUi.svelte.js'
import type { Component } from 'svelte'
import type {
  HeaderCrumb,
  HeaderTitleMenuItemConfig,
  HeaderButtonActionConfig,
  HeaderLayoutRegionConfig,
  HeaderPublishPromptConfig,
} from '#lib/bits/patterns/layout/header/header.types.js'

/* ----------------- */
// NAVIGATION :: ADMIN :: ACTIVE RESOURCE
/* -------- */

export type HeaderControlsMode = 'auto' | 'view' | 'form' | 'none'

export interface HeaderVisibilityOverrides {
  showNew?: boolean
  showFilter?: boolean
  showFacets?: boolean
  showViewActions?: boolean
  showFormActions?: boolean
  showAvatar?: boolean
  showLayoutToggle?: boolean
  showControlBarToggle?: boolean
}

export type HeaderFacetItem = {
  ref: string
  label: string
  icon: Component | null
  class?: string
  hasIssues?: boolean
  disabled?: boolean
}

type HeaderMetaState = {
  title: string
  icon: Component | null
  crumbs: HeaderCrumb[]
  facets: HeaderFacetItem[]
  activeFacet: string | false | null
  onFacetChange: ((ref: string) => void) | null
  titleMenuItems: HeaderTitleMenuItemConfig[]
  viewActions: HeaderButtonActionConfig[]
  viewActionContent: HeaderLayoutRegionConfig | null
  taskActions: HeaderButtonActionConfig[]
  taskActionContent: HeaderLayoutRegionConfig | null
}

export type HeaderFormActionsState = {
  dirty: boolean
  isSubmitting: boolean
  hasIssues: boolean
  isPublishing: boolean
  isDeleting: boolean
  isDeleted: boolean
  isPublished: boolean
  canEdit: boolean
  disableEdit: boolean
  canPublish: boolean
  publishPrompt?: HeaderPublishPromptConfig | null
  preview?: (() => void) | null
  showDeleteAction: boolean
  showPublishAction: boolean
  reset: () => void
  submit: () => void
  togglePublish: () => void | Promise<void>
  toggleDelete: () => void
}

export type HeaderCtrlState = {
  search: {
    /** Use index controls within an entity facet without replacing its title or tabs. */
    indexView?: boolean
    resourceType?: NavigableResource
    listUi?: ResourceIndexUi
    query: string
    placeholder?: string
    onFilter: (query: string) => void
  } | null

  controlsMode: HeaderControlsMode
  isEditing: boolean
  visibility: HeaderVisibilityOverrides
  meta: HeaderMetaState
  formActions: HeaderFormActionsState | null
  layout: {
    controlBar: HeaderLayoutRegionConfig | null
    footer: HeaderLayoutRegionConfig | null
  }
}
