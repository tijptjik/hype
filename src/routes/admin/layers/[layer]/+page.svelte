<script lang="ts">
import FeatureIntentSettings from '#lib/bits/patterns/forms/featureIntent/FeatureIntentSettings.svelte'
// DEFERRED FACETS
import Deferred from '#lib/bits/custom/deferred/Deferred.svelte'
// IMAGE PUBLICATION
import PublishUnclassifiedImagesDialog from '#lib/bits/patterns/images/PublishUnclassifiedImagesDialog.svelte'
// COMPONENTS

// BITS COMPONENTS
import { Select } from '#lib/bits/core/index.js'
import FormI18nDescriptorProfile from '#lib/bits/patterns/forms/formI18nSection/FormI18nDescriptorProfile.svelte'

import FormMarkerStyleSection from '#lib/bits/patterns/forms/formMarkerStyleSection/FormMarkerStyleSection.svelte'
import { isMarkerStyleCode, type MarkerStyleCode } from '#lib/features/markerStyle.js'
import type { RemoteForm, RemoteFormFields } from '$app/server'

// SVELTE
import { page } from '$app/state'
import { untrack } from 'svelte'
// I18N
import { getLocaleKey, getLocaleOrder, m } from '#lib/i18n.js'
// TOAST
import { toast } from 'svelte-sonner'
// PUBLICATION
import { publicationPreviewUrl } from '#lib/publication/preview.js'
import { canPreviewPublication } from '#lib/publication/permissions.js'
// SERVICES
import {
  bindAdminFacetHistorySync,
  captureHeaderTransitionSnapshot,
  createFacetNavActionBuilder,
  createResourceFormConfig,
  focusFacetFromHash,
  getEditorCtrl,
  revalidateAfterSubmitAttempt,
  resolveOptimisticHeaderFacets,
  resolveOptimisticHeaderStatus,
  resolveFacetTabsWithIssues,
  syncAdminFacetFromHash,
  toFormLevelIssueMessages,
  toUniqueIssueMessages,
  updateFormData,
} from '#lib/client/services/form.js'

import {
  createMapRenderTitleMenuItem,
  refreshMapRender,
} from '#lib/client/services/map.js'

import {
  getLayerSubmitUpdates,
  mergeProjectPropertiesIntoLayerForm as applyProjectPropertiesToLayerForm,
  overrideLayerEntityFromSubmit,
  overrideLayerListItemFromSubmit,
  replaceLayerParentProject,
  resolveLayerEditorPermissions,
  toLayerFormInput,
  toHiddenParentProjectInputAttrs,
  toLayerParentProjectSearchQueries,
  toLayerPropertyRows,
  toSelectedParentProject,
} from '#lib/client/services/layer.js'
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
// REMOTE
import { translateContentField } from '#lib/api/translation.remote.js'
import {
  archiveLayer,
  getLayer,
  getLayers,
  layerForm,
  publishLayer,
} from '#lib/api/layer.remote.js'
import { getProjects } from '#lib/api/project.remote.js'
import { getLayerRelocationPolicy } from '#lib/api/layerLocationPolicy.remote.js'
import LayerRelocationPolicyPanel from '#lib/bits/patterns/forms/locationUpdatePolicy/LayerRelocationPolicyPanel.svelte'
import { getProjectProperties } from '#lib/api/property.remote.js'
import {
  resolveLayerProjectSelectionScope,
  toLayerAuthActor,
} from '#lib/api/services/authz/layerPolicy.js'
// SCHEMA
import { LayerPreflightFormData } from '#lib/db/zod/schema/layer.form.js'
// CONFIG
import { NEW_REF, NEW_TITLE } from '#lib/constants.js'
// BITS COMPONENTS
import PublishChildrenDialog from '#lib/bits/patterns/resource/PublishChildrenDialog.svelte'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import { createLayerPropertyTransfer } from '#lib/bits/patterns/cards/layerPropertyCard/layerPropertyCard.transitions.js'
import {
  formSectionDividerStyles,
  formSelectionSectionStyles,
} from '#lib/bits/patterns/forms/formSurface/formSurface.styles.js'
import FormCardStyleSection from '#lib/bits/patterns/forms/formCardStyleSection/FormCardStyleSection.svelte'
import { isCardStyleCode, DEFAULT_CARD_STYLE } from '#lib/features/cardStyle.js'
import type { CardStyleCode } from '#lib/features/cardStyle.js'
import FormParentSection from '#lib/bits/patterns/forms/formParentSection/FormParentSection.svelte'
import FormMapStyleSection from '#lib/bits/patterns/forms/formMapStyleSection/FormMapStyleSection.svelte'
import * as LayerPropertyCard from '#lib/bits/patterns/cards/layerPropertyCard/components/index.js'
import * as Main from '#lib/bits/custom/main/index.js'
import { Card, Switch } from '#lib/bits/custom/index.js'
import { SectionHeader, SectionHeaderPrimitive } from '#lib/bits/custom/form/index.js'
// MAP STYLES
import {
  REGISTERED_MAP_STYLE_CATALOG,
  SELECTABLE_MAP_STYLE_CATALOG,
} from '#lib/map/styles/catalog.js'
import { getMapStyleCatalogI18n } from '#lib/map/styles/i18n.js'
import { getMapStyleRenderAssetPath } from '#lib/map/styles/render.shared.js'
import { isMapStyleKey } from '#lib/map/styles/metadata.js'
// FACTORIES
import { configureForm } from '#lib/factories.svelte.js'
// NAVIGATION
import {
  getAdminFacetOrderForResource,
  getAdminFacetTabsForResource,
  navigateOnAdmin,
} from '#lib/navigation/index.js'
// UTILS
import { createSchemaRequiredInferer } from '#lib/utils/form-schema.js'
// ICONS
import LayerIcon from 'virtual:icons/proicons/layers'
// ENUMS
import { FirstClassResource } from '#lib/enums.js'
// BITS COMPONENTS
import ScopedFeatureIndexSkeleton from '#lib/bits/patterns/resource/adminFeatureIndex/ScopedFeatureIndexSkeleton.svelte'
import HistorySkeleton from '#lib/bits/patterns/revisionHistory/HistorySkeleton.svelte'
// TYPES
import type { StandardSchemaV1 } from '@standard-schema/spec'

import type { RemoteFormOptions } from '#lib/factories.svelte.js'
import type { LayerFacet } from '#lib/navigation/index.js'
import type { ParentSectionProjectItem } from '#lib/bits/patterns/forms/formParentSection/formParentSection.types.js'
import type { Property } from '#lib/db/zod/schema/property.types.js'

import type {
  Layer,
  LayerGetState,
  LayerPropertyPartialExtra,
  LayerSubmitData,
} from '#lib/db/zod/schema/layer.types.js'

import type { FormDataUpdaterForm } from '#lib/client/services/form.types.js'
import type { HeaderTransitionSnapshot } from '#lib/client/services/formHeader.types.js'
import type { MapStyleSelectionItem } from '#lib/bits/patterns/forms/formMapStyleSection/formMapStyleSection.types.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// PAGE SETUP
// - adminCtx
// - headerCtrl
// - facetTabs
// - editorCtrl
// - layerRef
// - locales
// - activeFacet
//
// RESOURCE STATE
// - commitLayerState
// - isCoreFacet
// - isFieldsFacet
// - isEditing
// - isNewLayerRef
// - isCurrentRefLoaded
//
// FORM CONFIGURATION
// - configuredLayerForm
// - formCtx
// - formDataUpdater
// - layerMapStyleOptions / selectedLayerMapStyle
// - onSelectLayerMapStyle
// - isRequiredInPreflight
// - isDirty
//
// ISSUE STATE
// - parentProjectIssues
// - visibleAllIssues
// - formLevelIssues
//
// PARENT PROJECT STATE
// - currentUser
// - currentActor
// - selectedParentProjectById
// - selectedParentProject
// - selectedParentProjectId
// - hasSelectedParentProject
//
// FACET + PERMISSION STATE
// - headerFacetTabs
// - facetIssueState
// - facetIssueSummary
// - headerFacetTabsWithIssues
// - hiddenParentProjectInputAttrs
// - layerCreateScope
// - layerPermissions
// - canEditLayerCore
// - canEditLayerFields
// - canSetParentProject
// - canPublishLayer
// - canDeleteLayer
// - canSubmitLayer
//
// FIELD PRESENTATION
// - layerPropertyRows
// - usedRows
// - unusedRows
// - propertyColumns
// - isLayerCardFlipDisabled
//
// UI HELPERS
// - disableLayerRouteFlipTemporarily
// - revalidateAfterProgrammaticChange
//
// FORM ACTIONS
// - onReplaceParentProject
// - syncProjectPropertiesIntoLayerForm
// - onSearchParentProjects
// - updateLayerPropertyToggle
//
// REMOTE REFRESH + STATE TOGGLES
// - refreshLayer
// - handleLayerStateToggle
// - onPreview
// - onPublishToggle
// - onDeleteToggle
// - onReset
// - onSubmit
//
// LIFECYCLE EFFECTS
// - route sync
// - facet guards
// - parent project sync
// - header sync
// - submit issue routing
// - editing guards
// - header action wiring

/********************
 *  PAGE SETUP
 ************/
const adminCtx = getAdminCtx()

const headerCtrl = getHeaderCtrl()
const facetTabs = getAdminFacetTabsForResource(FirstClassResource.layer)
const editorCtrl = getEditorCtrl({ headerCtrl, icon: LayerIcon, facetTabs })
const layerRef = $derived(page.params.layer as string)
const locales = $derived(getLocaleOrder(getLocaleKey()))
const activeFacet = $derived(
  adminCtx.activeFacet === false ? 'core' : adminCtx.activeFacet,
)
const cachedLayerForRef = $derived(
  adminCtx.view.getResourceByRefSync(FirstClassResource.layer, layerRef) as
    | Layer
    | undefined,
)
const cachedLayerState = $derived(
  cachedLayerForRef ? ({ data: cachedLayerForRef } as LayerGetState) : null,
)
let contentsElement: HTMLFormElement | undefined = $state()
let lastSyncedFacetHash = $state('')
let lastHeaderKey = $state('')
let lastFormActionsSignature = $state('')
let profileResetVersion = $state(0)
let suppressFormLevelIssues = $state(false)
let hasAutoEnteredEditForNew = $state(false)
let lastMergedProjectId = $state<string | null>(null)
let prefetchedProjectPropertiesByProjectId = $state<Record<string, Property[]>>({})
let settledLayerRef = $state<string | null>(null)
let isRefreshingMapRender = $state(false)

let optimisticHeaderState = $state<HeaderTransitionSnapshot>({
  canEdit: true,
  canPublish: true,
  showDeleteAction: true,
  showPublishAction: true,
  isPublished: false,
  isDeleted: false,
  facets: [],
})

/********************
 *  RESOURCE STATE
 ************/
let layer: LayerGetState = $state(null)

let committedLayer: LayerGetState = $state(null)

const commitLayerState = (value: LayerGetState): void => {
  committedLayer = value
  layer = value
}

const commitSettledLayerState = (value: LayerGetState): void => {
  commitLayerState(value)
  settledLayerRef = value?.data?.id ?? null
}

async function loadProjectProperties(projectId: string): Promise<Property[]> {
  if (!projectId.trim()) return []

  const propertyState = (await getProjectProperties({
    projectId,
    meta: { isAdminRequest: true },
  })) as { data?: Property[] | null }

  return Array.isArray(propertyState?.data) ? propertyState.data : []
}

function cacheProjectProperties(projectProperties: Property[]): void {
  for (const projectProperty of projectProperties) {
    if (!projectProperty?.id) continue
    adminCtx.view.cache.property.set(projectProperty.id, projectProperty)
  }
}

function rememberProjectProperties(
  projectId: string,
  projectProperties: Property[],
): void {
  prefetchedProjectPropertiesByProjectId = {
    ...prefetchedProjectPropertiesByProjectId,
    [projectId]: projectProperties,
  }

  cacheProjectProperties(projectProperties)
}

function resolveKnownProjectIdForLayerRef(ref: string): string {
  if (ref === layerRef) {
    return (
      cachedLayerState?.data?.projectId ??
      committedLayer?.data?.projectId ??
      layer?.data?.projectId ??
      ''
    ).trim()
  }

  const cachedLayer = adminCtx.view.getResourceByRefSync(
    FirstClassResource.layer,
    ref,
  ) as Layer | undefined

  return (cachedLayer?.projectId ?? '').trim()
}

const isCoreFacet = $derived(activeFacet === 'core')
const isFieldsFacet = $derived(activeFacet === 'fields')
const layerTitleMenuItems = $derived.by(() =>
  layer?.data?.id
    ? [
        createMapRenderTitleMenuItem({
          isRefreshing: isRefreshingMapRender,
          onSelect: () => {
            void refreshLayerMapRender()
          },
        }),
      ]
    : [],
)

const layerFacetOrder = $derived.by(
  () =>
    getAdminFacetOrderForResource(
      FirstClassResource.layer,
      headerFacetTabs,
    ) as LayerFacet[],
)

const buildFacetNavAction = createFacetNavActionBuilder<LayerFacet>({
  resourceType: FirstClassResource.layer,
  getFacetOrder: () => layerFacetOrder,
  getActiveFacet: () => activeFacet as LayerFacet,
  navigateToFacet: facet =>
    navigateOnAdmin(adminCtx, FirstClassResource.layer, layerRef, facet),
})

$effect(() => {
  const currentHash = page.url.hash
  if (currentHash === lastSyncedFacetHash) return
  // Parent data loads asynchronously; retry deep links when its extra tabs become available.
  if (!layerFacetOrder.includes(currentHash.slice(1) as LayerFacet)) return
  lastSyncedFacetHash = currentHash
  syncAdminFacetFromHash({
    hash: currentHash,
    activeFacet,
    facetOrder: layerFacetOrder,
    adminCtx,
    resourceType: FirstClassResource.layer,
    resourceRef: layerRef,
  })
})

bindAdminFacetHistorySync({
  getFacetOrder: () => layerFacetOrder,
  getActiveFacet: () => adminCtx.activeFacet as LayerFacet | false,
  adminCtx,
  resourceType: FirstClassResource.layer,
  getResourceRef: () => layerRef,
})

const isEditing = $derived(headerCtrl.state.isEditing)
const isNewLayerRef = $derived(layerRef === NEW_REF)

const isCurrentRefLoaded = $derived.by(() => {
  if (isNewLayerRef) return true

  const loadedId = layer?.data?.id
  const committedId = committedLayer?.data?.id

  return (
    typeof loadedId === 'string' &&
    typeof committedId === 'string' &&
    loadedId === layerRef &&
    committedId === layerRef
  )
})

const isCurrentRefSettled = $derived(isNewLayerRef || settledLayerRef === layerRef)

type LayerEditorFormInput = ReturnType<typeof toLayerFormInput>
type LayerRemoteFormInput = LayerEditorFormInput
type LayerFormPayload = LayerRemoteFormInput['data']

/********************
 *  FORM CONFIGURATION
 ************/
const configuredLayerForm = configureForm<LayerRemoteFormInput>(() => ({
  form: layerForm as unknown as RemoteForm<
    LayerRemoteFormInput,
    { data: { id: string; modifiedAt: string } }
  >,
  onsubmit: (({ data }: { data: LayerRemoteFormInput }) => {
    const payload = data as {
      meta?: Record<string, unknown>
      data?: Record<string, unknown>
    }
    if (!payload.meta || typeof payload.meta !== 'object') {
      payload.meta = {}
    }
    if (isNewLayerRef) {
      payload.meta.mode = 'create'
      delete payload.meta.id
      delete payload.meta.updatedAt
    }
    if (payload.data && 'organisationId' in payload.data) {
      delete payload.data.organisationId
    }
    return payload
  }) as NonNullable<RemoteFormOptions<LayerRemoteFormInput>['onsubmit']>,
  ...createResourceFormConfig<LayerRemoteFormInput>({
    formEl: contentsElement,
    key: layerRef,
    schema: LayerPreflightFormData as unknown as StandardSchemaV1<
      LayerRemoteFormInput,
      unknown
    >,
    data: toLayerFormInput(committedLayer?.data) as LayerRemoteFormInput,
    submitUpdates: async ({ data }) => {
      const entityQuery = getLayer({
        ref: layerRef,
        refKey: 'id',
        meta: { ...adminCtx.view.resources.queryMeta, profile: 'admin' },
      })
      const listQuery = getLayers({
        conditions: adminCtx.view.isSuperAdmin()
          ? { isArchived: null, isPublished: null }
          : { isArchived: false, isPublished: null },
        prisms: adminCtx.view.scope.prisms,
        meta: { ...adminCtx.view.resources.queryMeta, profile: 'card' },
      })

      // New-layer navigation can retain the previously edited record until the route
      // settles. Only persisted-layer submissions may target explicit readback queries.
      const layerId = isNewLayerRef ? undefined : layer?.data?.id

      const submittedData =
        data && typeof data === 'object' && 'data' in data
          ? (((data as { data?: Record<string, unknown> }).data ??
              {}) as LayerSubmitData)
          : ({} as LayerSubmitData)

      if (layerId) {
        entityQuery.withOverride(overrideLayerEntityFromSubmit(submittedData))
        listQuery.withOverride(overrideLayerListItemFromSubmit(layerId, submittedData))
      }

      return getLayerSubmitUpdates({
        layerId,
        entityQuery,
        listQuery,
      })
    },
    adminCtx,
    headerCtrl,
    resourceType: FirstClassResource.layer,
    getEntity: () => layer,
    refreshResource: async ({ success, result, data }) => {
      if (isNewLayerRef && success) {
        const createdId = (result as { data?: { id?: unknown } } | null)?.data?.id
        if (typeof createdId === 'string' && createdId.trim().length > 0) {
          const refreshed = await refreshLayer(createdId)
          commitSettledLayerState(refreshed)
          if (refreshed?.data) {
            formCtx.form.fields.set(toLayerFormInput(refreshed.data))
          }
          navigateOnAdmin(
            adminCtx,
            FirstClassResource.layer,
            createdId,
            adminCtx.activeFacet || undefined,
          )
          return
        }
      }

      const refreshed = await refreshLayer()
      commitSettledLayerState(refreshed)
      if (success && data.data?.relocationUpdatePolicy && refreshed?.data?.id) {
        await getLayerRelocationPolicy({ layerId: refreshed.data.id }).refresh()
      }
      if (refreshed?.data) {
        formCtx.form.fields.set(toLayerFormInput(refreshed.data))
      }
    },
  }),
}))

const formCtx = $derived(configuredLayerForm())
const formDataUpdater = $derived(
  formCtx.form as unknown as FormDataUpdaterForm<LayerFormPayload>,
)
const isDefaultVisible = $derived(
  Boolean(formCtx.form.fields.value().data?.isDefaultVisible),
)
const defaultVisibleInputAttrs = $derived(
  formCtx.form.fields.data.isDefaultVisible.as(
    'hidden',
    isDefaultVisible ? 'true' : 'false',
  ),
)

/**
 * Stages whether the layer is selected automatically with its parent Project.
 * @param value - The requested default visibility.
 * @returns Nothing; the enclosing Layer form persists the change on save.
 */
function onDefaultVisibleChange(value: boolean): void {
  updateFormData(formDataUpdater, data => {
    data.isDefaultVisible = value
    return data
  })
  revalidateAfterProgrammaticChange()
}

const stagedRelocationPolicy = $derived.by(() => {
  const value = formCtx.form.fields.value().data?.relocationUpdatePolicy
  return typeof value === 'string' ? value : undefined
})

/**
 * Register the optional relocation draft on the existing Layer remote form.
 * @returns Native hidden input attributes for the JSON transport.
 */
function hiddenRelocationPolicyAttrs(): Record<string, unknown> {
  const { as } = formCtx.form.fields.data.relocationUpdatePolicy as unknown as {
    as(type: 'hidden', value: string): Record<string, unknown>
  }
  return as('hidden', stagedRelocationPolicy ?? '')
}

/**
 * Stage the Layer override without persisting independently of other form edits.
 * @param value Revision-fenced policy JSON, or undefined to remove the draft.
 * @returns Nothing; the normal Layer save/cancel flow owns persistence.
 */
function onRelocationPolicyChange(value: string | undefined): void {
  updateFormData(formDataUpdater, data => {
    if (value === undefined) delete data.relocationUpdatePolicy
    else data.relocationUpdatePolicy = value
    return data
  })
  revalidateAfterProgrammaticChange()
}

/** Update one Feature authoring override; an empty choice follows the Project.
 * @param key Authoring preference. @param value Inherit, enabled or disabled.
 * @returns Nothing; the Layer form owns persistence and cancellation.
 */
function setFeaturePolicyOverride(
  key: 'allowFeatureDescriptions' | 'locationBasedFeatureNames',
  value: string,
): void {
  updateFormData(formDataUpdater, data => {
    data.metadata = { ...data.metadata }
    if (!value) delete data.metadata[key]
    else data.metadata[key] = value === 'true'
    return data
  })
  revalidateAfterProgrammaticChange()
}

// Metadata retains arbitrary JSON keys; expose its known string controls through
// SvelteKit's field contract instead of treating their .as method as a JSON key.
const layerPresentationFields = $derived(
  formCtx.form.fields.data.metadata as unknown as RemoteFormFields<{
    allowFeatureDescriptions?: boolean | null
    locationBasedFeatureNames?: boolean | null
    mapStyleCode?: string
    cardStyleCode?: string
    markerStyleCode?: string
  }>,
)
// Map presentation is persisted with the existing layer metadata and scalar concurrency guard.
const layerMapStyleCode = $derived(
  formCtx.form.fields.data.metadata.value()?.mapStyleCode,
)
const layerMapStyleOptions = $derived(
  SELECTABLE_MAP_STYLE_CATALOG.filter(
    entry => !entry.projectCode || entry.projectCode === selectedParentProject?.code,
  ).map(entry => ({
    id: entry.key,
    code: entry.key,
    previewImagePath: getMapStyleRenderAssetPath(entry.key),
    i18n: getMapStyleCatalogI18n(entry.key),
  })),
)
const projectDefaultMapStyle = $derived.by(
  (): MapStyleSelectionItem => ({
    id: 'project-default',
    code: '__project-default__',
    displayCode: selectedParentProject?.mapStyle?.code ?? null,
    previewImagePath: selectedParentProject?.mapStyle?.code
      ? getMapStyleRenderAssetPath(selectedParentProject.mapStyle.code)
      : null,
    i18n: {
      en: {
        name: m.theme_map_project_default(),
        description: m.theme_map_project_default_description(),
      },
    },
  }),
)
const selectedLayerMapStyle = $derived.by((): MapStyleSelectionItem | null => {
  if (layerMapStyleCode === undefined) return projectDefaultMapStyle
  if (layerMapStyleCode === null || layerMapStyleCode === '') return null
  const entry = REGISTERED_MAP_STYLE_CATALOG.find(
    style => style.key === layerMapStyleCode,
  )
  return entry
    ? {
        id: entry.key,
        code: entry.key,
        previewImagePath: getMapStyleRenderAssetPath(entry.key),
        i18n: getMapStyleCatalogI18n(entry.key),
      }
    : null
})
const hiddenLayerMapStyleInputAttrs = $derived(
  layerMapStyleCode !== undefined
    ? [layerPresentationFields.mapStyleCode.as('hidden', layerMapStyleCode ?? '')]
    : [],
)

/**
 * Changes the layer's explicit style, user preference or legacy project inheritance.
 * @param selection - Controlled style picker item.
 * @returns Nothing; persistence uses the existing layer form submission.
 */
function onSelectLayerMapStyle(selection: MapStyleSelectionItem): void {
  updateFormData(formDataUpdater, data => {
    data.metadata = { ...data.metadata }
    if (selection.code === '__project-default__') delete data.metadata.mapStyleCode
    else if (!selection.code) data.metadata.mapStyleCode = ''
    else if (isMapStyleKey(selection.code)) data.metadata.mapStyleCode = selection.code
    return data
  })
}

const selectedLayerMarkerStyle = $derived.by(() => {
  const code = formCtx.form.fields.value().data?.metadata?.markerStyleCode
  return isMarkerStyleCode(code) ? code : null
})
/**
 * Updates only the marker override in the layer metadata.
 * @param code Registered renderer, or null for project inheritance.
 * @returns Nothing; the existing layer form persists metadata.
 */
function onSelectLayerMarkerStyle(code: MarkerStyleCode | null): void {
  updateFormData(formDataUpdater, data => {
    data.metadata = { ...data.metadata, markerStyleCode: code ?? '' }
    return data
  })
  revalidateAfterProgrammaticChange()
}

const selectedLayerCardStyle = $derived.by(() => {
  const code = formCtx.form.fields.value().data?.metadata?.cardStyleCode
  return isCardStyleCode(code) ? code : null
})

/**
 * Sets or clears the layer override while preserving unrelated metadata.
 * @param code Registered style, or null to inherit the project.
 * @returns Nothing; the existing layer form persists metadata.
 */
function onSelectLayerCardStyle(code: CardStyleCode | null): void {
  updateFormData(formDataUpdater, data => {
    data.metadata = { ...data.metadata, cardStyleCode: code ?? '' }
    return data
  })
  revalidateAfterProgrammaticChange()
}

const isRequiredInPreflight = createSchemaRequiredInferer(LayerPreflightFormData)
const isDirty = $derived(Boolean(formCtx.dirty))

/********************
 *  ISSUE STATE
 ************/
const parentProjectIssues = $derived.by((): string[] => {
  return toUniqueIssueMessages(formCtx.form.fields.data.projectId.issues() ?? [])
})

const visibleAllIssues = $derived.by((): unknown[] =>
  suppressFormLevelIssues ? [] : (formCtx.allIssues ?? []),
)

const formLevelIssues = $derived.by((): string[] => {
  return toFormLevelIssueMessages(visibleAllIssues)
})

/********************
 *  PARENT PROJECT STATE
 ************/
const currentUser = $derived(adminCtx.view.account.user)

const currentActor = $derived(toLayerAuthActor(currentUser ?? {}))
let selectedParentProjectById = $state<Record<string, ParentSectionProjectItem>>({})

const selectedParentProject = $derived.by((): ParentSectionProjectItem | null => {
  return toSelectedParentProject({
    form: formDataUpdater,
    layer,
    selectedParentProjectById,
    projectCache: adminCtx.view.cache.project,
  })
})

const selectedParentProjectId = $derived(selectedParentProject?.id ?? '')
const inheritedCardStyle = $derived(
  isCardStyleCode(selectedParentProject?.cardStyleCode)
    ? selectedParentProject.cardStyleCode
    : (adminCtx.view.cache.project.get(selectedParentProjectId)?.cardStyleCode ??
        DEFAULT_CARD_STYLE),
)

const inheritedMarkerStyle = $derived.by((): MarkerStyleCode | null => {
  const code =
    selectedParentProject?.markerStyleCode ??
    adminCtx.view.cache.project.get(selectedParentProjectId)?.markerStyleCode
  return isMarkerStyleCode(code) ? code : null
})

const hasSelectedParentProject = $derived(selectedParentProjectId.length > 0)

/********************
 *  FACET + PERMISSION STATE
 ************/
const headerFacetTabs = $derived.by(() => {
  const tabs = getAdminFacetTabsForResource(FirstClassResource.layer, {
    coreOnly: !hasSelectedParentProject,
  })
  if (isNewLayerRef || !canEditLayerCore) tabs.delete('updates')
  return tabs
})

const facetIssueState = $derived.by(() =>
  resolveFacetTabsWithIssues({
    issues: visibleAllIssues,
    facets: headerFacetTabs,
    formEl: contentsElement,
  }),
)

const facetIssueSummary = $derived(facetIssueState.facetIssueSummary)
const headerFacetTabsWithIssues = $derived(facetIssueState.facetTabsWithIssues)

const hiddenParentProjectInputAttrs = $derived.by(() => {
  return toHiddenParentProjectInputAttrs({
    form: formDataUpdater,
    selectedParentProject,
    layer,
    committedLayer,
    toHiddenInput: projectId =>
      formCtx.form.fields.data.projectId?.as('hidden', projectId),
  })
})

const layerPermissions = $derived.by(() => {
  return resolveLayerEditorPermissions({
    currentUser,
    layer,
    form: formDataUpdater,
    prismProjectId: adminCtx.view.scope.getPrism(FirstClassResource.project)[0] ?? null,
    prismOrganisationId:
      adminCtx.view.scope.getPrism(FirstClassResource.organisation)[0] ?? null,
    resourceHubId: adminCtx.view.hub?.id ?? null,
    projectCache: adminCtx.view.cache.project,
    organisationCache: adminCtx.view.cache.organisation,
  })
})

const canEditLayerCore = $derived(layerPermissions.canEditI18n)
const canEditLayerFields = $derived(layerPermissions.canEditFields)
const isHistoricalLayer = $derived.by(() =>
  Boolean(layer?.data?.historicalSourceLayerId),
)
const canSetParentProject = $derived(canEditLayerFields && !isHistoricalLayer)
const canPublishLayer = $derived(layerPermissions.canPublish)
const canDeleteLayer = $derived(layerPermissions.canArchive && !isHistoricalLayer)
const canSubmitLayer = $derived(isCoreFacet ? canEditLayerCore : canEditLayerFields)

/********************
 *  FIELD PRESENTATION
 ************/
const layerPropertyTransfer = createLayerPropertyTransfer()
const layerPropertyRows = $derived.by(() => {
  return toLayerPropertyRows({
    form: formDataUpdater,
    layer,
    propertyCache: adminCtx.view.cache.property,
    hubCodeById: hubId => adminCtx.view.cache.hub.get(hubId)?.code ?? null,
    userPreferences: adminCtx.view.getUserPreferences(),
  })
})

let isLayerPropertyMergeInProgress = $state(false)
let isLayerRouteFlipDisabled = $state(false)
let layerRouteFlipDisableTimer: ReturnType<typeof setTimeout> | null = null
const usedRows = $derived(layerPropertyRows.filter(row => row.isVisible))
const unusedRows = $derived(layerPropertyRows.filter(row => !row.isVisible))

const propertyColumns = $derived([
  {
    key: 'active',
    rows: usedRows,
    title: m.admin__forms_common_active_fields(),
    description: m.admin__forms_common_fields_subtitle(),
    isContributableDisabled: false,
  },
  {
    key: 'inactive',
    rows: unusedRows,
    title: m.admin__forms_common_inactive_fields(),
    description: m.admin__forms_common_inactive_fields_subtitle(),
    isContributableDisabled: true,
  },
] as const)

const isLayerCardFlipDisabled = $derived(
  isLayerPropertyMergeInProgress || isLayerRouteFlipDisabled,
)

/********************
 *  UI HELPERS
 ************/
function disableLayerRouteFlipTemporarily(durationMs = 420): void {
  isLayerRouteFlipDisabled = true
  if (layerRouteFlipDisableTimer) clearTimeout(layerRouteFlipDisableTimer)
  layerRouteFlipDisableTimer = setTimeout(() => {
    isLayerRouteFlipDisabled = false
    layerRouteFlipDisableTimer = null
  }, durationMs)
}

$effect(() => {
  return () => {
    if (layerRouteFlipDisableTimer) clearTimeout(layerRouteFlipDisableTimer)
  }
})

$effect(() => {
  layerRef
  disableLayerRouteFlipTemporarily()
})

function revalidateAfterProgrammaticChange(): void {
  revalidateAfterSubmitAttempt({
    wasSubmitAttempted: formCtx.wasSubmitAttempted,
    validate: formCtx.validate,
  })
}

/********************
 *  FORM ACTIONS
 ************/

// I18N actions are owned by the shared multilingual descriptor profile.

// Parent project actions
function onReplaceParentProject(project: ParentSectionProjectItem): void {
  selectedParentProjectById = replaceLayerParentProject({
    form: formDataUpdater,
    project,
  })
  revalidateAfterProgrammaticChange()
}

async function syncProjectPropertiesIntoLayerForm(
  projectId: string,
  options: { rebaseline?: boolean } = {},
): Promise<void> {
  if (!projectId.trim()) return

  isLayerPropertyMergeInProgress = true
  try {
    try {
      const projectProperties =
        prefetchedProjectPropertiesByProjectId[projectId] ??
        (await loadProjectProperties(projectId))

      rememberProjectProperties(projectId, projectProperties)
      applyProjectPropertiesToLayerForm({ form: formDataUpdater, projectProperties })
    } catch {
      toast.error(m.long_crazy_peacock_care())
      return
    }

    if (options.rebaseline && committedLayer?.data) {
      const currentValue = formCtx.form.fields.value() as {
        data?: {
          properties?: Array<LayerPropertyPartialExtra & { propertyId: string }>
        }
      }
      const mergedProperties = Array.isArray(currentValue?.data?.properties)
        ? currentValue.data.properties
        : []
      commitLayerState({
        ...(committedLayer ?? { data: null, durationMs: 0 }),
        data: { ...committedLayer.data, properties: mergedProperties },
      })
    }

    revalidateAfterProgrammaticChange()
  } finally {
    isLayerPropertyMergeInProgress = false
  }
}

async function onSearchParentProjects(
  query: string,
): Promise<ParentSectionProjectItem[]> {
  const scope = resolveLayerProjectSelectionScope({
    actor: currentActor,
    resourceHubId: adminCtx.view.hub?.id ?? null,
  })

  if (!scope.canCreate) return []

  const baseParams = {
    q: query,
    prisms: adminCtx.view.scope.prisms,
    meta: { ...adminCtx.view.resources.queryMeta, profile: 'card' as const },
  }

  const queryPlan = toLayerParentProjectSearchQueries({ scope, baseParams })

  if (queryPlan.length === 0) return []

  const results = await Promise.all(
    queryPlan.map(
      params => getProjects(params) as Promise<{ data: ParentSectionProjectItem[] }>,
    ),
  )
  const byId = new Map<string, ParentSectionProjectItem>()

  for (const result of results) {
    for (const project of result.data) {
      byId.set(project.id, project)
    }
  }

  return Array.from(byId.values())
}

// Field toggle actions
function updateLayerPropertyToggle(
  index: number,
  field: 'isVisible' | 'isUserContributable',
  value: boolean,
): void {
  updateFormData(formDataUpdater, data => {
    if (!Array.isArray(data.properties)) return data

    const current = data.properties[index]

    if (!current) return data

    data.properties[index] = { ...current, [field]: value }

    return data
  })

  revalidateAfterProgrammaticChange()
}

/********************
 *  REMOTE REFRESH + STATE TOGGLES
 ************/
async function refreshLayer(refOverride?: string): Promise<LayerGetState> {
  const ref = refOverride ?? layerRef

  if (ref === NEW_REF) {
    return { data: null, durationMs: 0 }
  }

  const knownProjectId = resolveKnownProjectIdForLayerRef(ref)
  const layerQuery = getLayer({
    ref,
    refKey: 'id',
    meta: { ...adminCtx.view.resources.queryMeta, profile: 'admin' },
  })
  const projectPropertiesPromise = knownProjectId
    ? loadProjectProperties(knownProjectId).catch(() => null)
    : Promise.resolve(null)

  const nextLayer = (await layerQuery) as LayerGetState
  const nextProjectId = (nextLayer?.data?.projectId ?? '').trim()
  let projectProperties = await projectPropertiesPromise

  if (nextProjectId && nextProjectId !== knownProjectId) {
    projectProperties = await loadProjectProperties(nextProjectId).catch(() => null)
  }

  if (
    Array.isArray(projectProperties) &&
    nextProjectId === (nextLayer?.data?.projectId ?? '')
  ) {
    rememberProjectProperties(nextProjectId, projectProperties)
  }

  return nextLayer
}

async function refreshLayerMapRender(): Promise<void> {
  await refreshMapRender({
    kind: 'layers',
    id: layer?.data?.id,
    isRefreshing: isRefreshingMapRender,
    setRefreshing: next => {
      isRefreshingMapRender = next
    },
  })
}

/**
 * Persists a resource state change and reconciles affected cached descendants.
 * @param options - State action, feedback, busy handler and explicit child publication choice.
 * @returns Completion of the mutation and cache reconciliation.
 */
async function handleLayerStateToggle({
  field,
  successWhenTrue,
  successWhenFalse,
  setBusy,
  mutate,
  publishChildren = false,
}: {
  publishChildren?: boolean
  field: 'isPublished' | 'isArchived'
  successWhenTrue: string
  successWhenFalse: string
  setBusy: (value: boolean) => void
  mutate: (payload: { id: string; state: boolean }) => Promise<{ data: { id: string } }>
}): Promise<void> {
  const previousLayer = layer
  const current = previousLayer?.data
  if (!current) return
  const mutationRef = layerRef
  const mutationScope = adminCtx.view.resources.scopeKey
  const mutationCache = adminCtx.view.cacheCtx
  const mutationGeneration = mutationCache.generation
  let committed = false
  const ownsRoute = editorCtrl.captureRoute()
  const isCurrentMutation = (): boolean =>
    ownsRoute() &&
    layerRef === mutationRef &&
    adminCtx.view.resources.scopeKey === mutationScope
  const nextState = !current[field]
  setBusy(true)
  const mutation = adminCtx.view.cacheCtx.beginMutation('layer', {
    meta: { id: current.id },
    data: { [field]: nextState },
  })
  try {
    const result = await (mutate as typeof publishLayer)({
      id: current.id,
      state: nextState,
      ...(field === 'isPublished' ? { publishChildren } : {}),
      meta: { isAdminRequest: true },
    }).updates(
      // The cache owns optimistic overrides; these handles only request refreshes.
      ...mutation.updates,
      getLayer({
        ref: mutationRef,
        refKey: 'id',
        meta: { ...adminCtx.view.resources.queryMeta, profile: 'admin' },
      }),
    )
    committed = true
    mutation.settle(true)
    if (!isCurrentMutation()) return
    if (field === 'isPublished')
      pendingImagePublicationId = nextState ? current.id : null
    // The write acknowledgement settles this field without depending on another detail read.
    if (
      layerRef === mutationRef &&
      adminCtx.view.resources.scopeKey === mutationScope
    ) {
      const settledLayer = layer?.data?.id === current.id ? layer : previousLayer
      commitSettledLayerState({
        ...settledLayer,
        data: { ...settledLayer?.data, ...result.data },
      } as LayerGetState)
    }
    toast.success(nextState ? successWhenTrue : successWhenFalse)
  } catch {
    mutation.settle(false)
    if (!isCurrentMutation()) return
    toast.error(m.long_crazy_peacock_care())
    return
  } finally {
    if (isCurrentMutation()) setBusy(false)
    // Navigation does not cancel cache invalidation; account resets already discard the old generation.
    if (committed && mutationCache.generation === mutationGeneration) {
      try {
        await mutationCache.reconcile('layer')
      } catch (error) {
        console.warn('Layer state saved, but dependent lists could not refresh', error)
        if (isCurrentMutation())
          toast.warning(
            'Saved, but some views could not refresh. Please refresh the page.',
          )
      }
    }
  }
}

let pendingPreviewId = $state<string | null>(null)
const canPreview = $derived.by(() => {
  if (!currentUser) return false
  return (
    isCurrentRefLoaded &&
    !layer?.data?.isPublished &&
    !layer?.data?.isArchived &&
    canPreviewPublication(currentUser, currentUser.roles ?? [], {
      organisationId: layer?.data?.organisationId ?? '',
      projectId: layer?.data?.projectId,
      hubId: adminCtx.view.hub?.id,
    })
  )
})

/**
 * Opens the same descendant choice as publishing, then starts an isolated map preview.
 * @param publishChildren Explicit descendant choice, or undefined to open the dialog.
 * @returns Nothing; navigation creates a fresh map context without changing publication state.
 */
function onPreview(publishChildren?: boolean): void {
  if (!canPreview || !layer?.data?.id) return
  if (publishChildren === undefined) {
    pendingPreviewId = layer.data.id
    return
  }
  if (pendingPreviewId !== layer.data.id) return
  window.location.assign(
    publicationPreviewUrl({ type: 'layer', id: layer.data.id, publishChildren }),
  )
}

let pendingPublishId = $state<string | null>(null)
let pendingImagePublicationId = $state<string | null>(null)

// Dismiss pending publication when navigation changes the target resource.
$effect(() => {
  layerRef
  pendingImagePublicationId = null
  pendingPublishId = null
  pendingPreviewId = null
})

/** Prompts before publishing drafts below this resource; unpublishing remains immediate.
 * @param publishChildren - Explicit choice, or undefined to open the prompt.
 * @returns Completion of the selected publication action.
 */
async function onPublishToggle(publishChildren?: boolean): Promise<void> {
  if (
    !isCurrentRefLoaded ||
    !canPublishLayer ||
    headerCtrl.state.formActions?.isPublishing
  )
    return
  // A delayed dialog choice must never turn into an unpublish after a remote refresh.
  if (publishChildren !== undefined && layer?.data?.isPublished) {
    pendingPublishId = null
    return
  }
  if (!layer?.data?.isPublished && publishChildren === undefined) {
    pendingPublishId = layer?.data?.id ?? null
    return
  }
  pendingPublishId = null
  await handleLayerStateToggle({
    field: 'isPublished',
    successWhenTrue: m.published(),
    successWhenFalse: m.forms__unpublished(),
    setBusy: value => headerCtrl.setPublishing(value),
    mutate: publishLayer,
    publishChildren,
  })
}

async function onDeleteToggle(): Promise<void> {
  if (!isCurrentRefLoaded || !canDeleteLayer) return
  await handleLayerStateToggle({
    field: 'isArchived',
    successWhenTrue: m.bad_swift_cheetah_surge(),
    successWhenFalse: m.forms__restored(),
    setBusy: value => headerCtrl.setDeleting(value),
    mutate: archiveLayer,
  })
}

function onReset(): void {
  profileResetVersion += 1
  suppressFormLevelIssues = true
  formCtx.clearSubmitAttemptState()
  if (committedLayer?.data) {
    layer = committedLayer
    formCtx.form.fields.set(toLayerFormInput(committedLayer.data))
    const projectId = (committedLayer.data.projectId ?? '').trim()
    if (projectId) {
      // Force re-merge so inherited project properties are restored after reset/cancel.
      lastMergedProjectId = null
      void syncProjectPropertiesIntoLayerForm(projectId, { rebaseline: true })
    }
    return
  }
  formCtx.reset()
}

function onSubmit(): void {
  suppressFormLevelIssues = false
  if (!isCurrentRefLoaded) return
  if (isNewLayerRef) {
    formCtx.requestSubmit({ meta: { mode: 'create' } })
    return
  }
  const baseMeta = committedLayer?.data
    ? (toLayerFormInput(committedLayer.data).meta ?? {})
    : undefined
  formCtx.requestSubmit(baseMeta ? { meta: baseMeta } : undefined)
}

/********************
 *  LIFECYCLE EFFECTS
 ************/

// Route sync
$effect(() => {
  layerRef

  const cachedId = cachedLayerState?.data?.id

  if (!cachedId) return
  if (layer?.data?.id === cachedId) return

  commitLayerState(cachedLayerState)
})

$effect(() => {
  layerRef
  optimisticHeaderState = captureHeaderTransitionSnapshot(headerCtrl)
})

$effect(() => {
  adminCtx.view.resources.scopeKey
  const ref = layerRef
  return untrack(() =>
    editorCtrl.syncRouteAndLoad({
      ref,
      resetFormActionsSignature: () => {
        headerCtrl.setFormActions({ isPublishing: false, isDeleting: false })
        lastFormActionsSignature = ''
        suppressFormLevelIssues = true
        lastMergedProjectId = null
        prefetchedProjectPropertiesByProjectId = {}
        settledLayerRef = null
        isRefreshingMapRender = false
      },
      setFacetForRef: nextRef => {
        untrack(() => {
          const currentFacet = adminCtx.activeFacet
          // Keep bookmarks while destination data and permission-derived tabs load.
          const nextFacet = currentFacet || 'core'
          adminCtx.setFacet(nextFacet, nextRef, FirstClassResource.layer)
        })
      },
      load: refreshLayer,
      commit: commitSettledLayerState,
    }),
  )
})

// Validate the requested tab only after the destination's authorization has settled.
$effect(() => {
  if (!isCurrentRefSettled) return
  if (headerFacetTabsWithIssues.has(activeFacet)) return
  adminCtx.setFacet('core', layerRef, FirstClassResource.layer)
})

$effect(() => {
  activeFacet
  contentsElement
  focusFacetFromHash(contentsElement, activeFacet)
})

// Facet guards
$effect(() => {
  if (!isCurrentRefSettled) return
  if (activeFacet !== 'fields') return
  if (hasSelectedParentProject) return

  adminCtx.setFacet('core', layerRef, FirstClassResource.layer)
})

// Parent project sync
$effect(() => {
  const projectId = selectedParentProjectId
  if (!projectId) {
    lastMergedProjectId = null
    return
  }
  if (projectId === lastMergedProjectId) return
  lastMergedProjectId = projectId
  void syncProjectPropertiesIntoLayerForm(projectId)
})

// Header sync
$effect(() => {
  const title =
    (isNewLayerRef ? `${NEW_TITLE} ${m.maps__layers()}` : undefined) ??
    layer?.data?.i18n?.[getLocaleKey()]?.name ??
    m.maps__layers()
  const displayFacets = resolveOptimisticHeaderFacets(
    isCurrentRefSettled,
    headerFacetTabsWithIssues,
    optimisticHeaderState,
  )
  const facetKey = Array.isArray(displayFacets)
    ? displayFacets
        .map(facet => `${facet.ref}:${facet.hasIssues === true ? '1' : '0'}`)
        .join('|')
    : Array.from(displayFacets.entries())
        .map(
          ([facet, config]) =>
            `${facet}:${typeof config === 'string' ? '0' : config.hasIssues ? '1' : '0'}`,
        )
        .join('|')

  const headerKey = `${layerRef}:${title}:${facetKey}`

  if (headerKey === lastHeaderKey) return

  lastHeaderKey = headerKey

  if (Array.isArray(displayFacets)) {
    headerCtrl.setHeaderForEntity(title, LayerIcon, new Map())
    headerCtrl.setFacets(displayFacets)
    headerCtrl.setTitleMenuItems(layerTitleMenuItems)
    return
  }
  headerCtrl.setHeaderForEntity(title, LayerIcon, displayFacets)
  headerCtrl.setTitleMenuItems(layerTitleMenuItems)
})

$effect(() => {
  headerCtrl.setTitleMenuItems(layerTitleMenuItems)
})

// Submit issue routing
$effect(() => {
  if (!formCtx.wasSubmitAttempted) return
  if (visibleAllIssues.length === 0) return

  const targetFacet = facetIssueSummary.firstFacetWithIssues

  if (!targetFacet) return
  if (activeFacet === targetFacet) return

  adminCtx.setFacet(targetFacet, layerRef, FirstClassResource.layer)
})

// Editing guards
$effect(() => {
  if (!layer?.data?.isArchived) return
  if (!headerCtrl.state.isEditing) return

  headerCtrl.setEditing(false)
})

$effect(() => {
  if (!isNewLayerRef) {
    hasAutoEnteredEditForNew = false
    return
  }

  if (!canSubmitLayer) return
  if (hasAutoEnteredEditForNew) return
  if (headerCtrl.state.isEditing) return

  headerCtrl.setEditing(true)
  hasAutoEnteredEditForNew = true
})

$effect(() => {
  if (!isCurrentRefSettled && !isNewLayerRef) return
  if (canSubmitLayer) return
  if (!headerCtrl.state.isEditing) return

  headerCtrl.setEditing(false)
})

// Header action wiring
$effect(() => {
  editorCtrl.wireHeaderHandlers({
    reset: onReset,
    submit: onSubmit,
    togglePublish: onPublishToggle,
    preview: canPreview ? () => onPreview() : null,
    toggleDelete: onDeleteToggle,
  })
})

$effect(() => {
  const status = resolveOptimisticHeaderStatus({
    isSettled: isCurrentRefSettled,
    isImageFacetActive: false,
    isNewRef: isNewLayerRef,
    dirty: isDirty,
    isSubmitting: formCtx.submitting,
    hasIssues: visibleAllIssues.length > 0,
    isPublished: Boolean(layer?.data?.isPublished),
    isDeleted: Boolean(layer?.data?.isArchived),
    canEdit: canSubmitLayer,
    canPublish: canPublishLayer,
    showDeleteAction: !isNewLayerRef && canDeleteLayer,
    showPublishAction: !isNewLayerRef,
    snapshot: optimisticHeaderState,
  })
  const inertActionOverrides = isCurrentRefSettled
    ? {}
    : {
        onEditingToggle: () => {},
        onReset: () => {},
        onSave: () => {},
        onDeleteToggle: () => {},
        onPublishToggle: () => {},
      }

  lastFormActionsSignature = editorCtrl.syncHeaderStatus({
    headerCtrl,
    status: {
      ...status,
      ...inertActionOverrides,
    },
    lastSignature: lastFormActionsSignature,
  })
})
</script>

<Main.Root
  onDimensionsChange={(width, height) =>
    adminCtx.view.layout.setMainDimensions(width, height)}
>
  <Main.Form
    bind:formEl={contentsElement}
    attrs={formCtx.attributes}
    isReady={Boolean(formCtx.form?.fields && (layer?.data || isNewLayerRef))}
  >
    <Main.Facet
      isVisible={isCoreFacet}
      transition="fade"
      fillHeight={true}
      previousAction={buildFacetNavAction('core', 'previous')}
      nextAction={buildFacetNavAction('core', 'next')}
      class="right-0! left-0!"
      attrs={{ 'data-facet-id': 'core' }}
    >
      <FormSurface>
        <SectionHeaderPrimitive.Issues issues={formLevelIssues} />
        <FormI18nDescriptorProfile
          form={formCtx.form}
          fields={formCtx.form.fields.data.i18n}
          defaultLocales={locales}
          recordKey={layerRef}
          resetVersion={profileResetVersion}
          isEditing={isEditing && canEditLayerCore}
          {isRequiredInPreflight}
          stickyToolbar
          stickyFieldHeaders={['description']}
          showPrimaryLocaleHeader={false}
          localeHeaderPlacement="gutter"
          translate={(source, target, text) =>
            translateContentField({ source, target, text })}
          onChange={revalidateAfterProgrammaticChange}
        />

        <div class={`${formSectionDividerStyles} grid grid-cols-1 xl:grid-cols-3`}>
          <div class="min-w-0">
            <FormMapStyleSection
              class={formSelectionSectionStyles}
              title={m.theme_map_style_label()}
              subtitle={m.theme_map_layer_style_description()}
              availableMapStyles={layerMapStyleOptions}
              selectedMapStyle={selectedLayerMapStyle}
              additionalMapStyles={[projectDefaultMapStyle]}
              hiddenMapStyleInputAttrs={hiddenLayerMapStyleInputAttrs}
              isEditing={isEditing && canEditLayerFields}
              isSubmitting={formCtx.submitting}
              isSubmitRequested={formCtx.isSubmitRequested}
              onSelectMapStyle={onSelectLayerMapStyle}
            />
          </div>
          <div class="border-border min-w-0 border-t xl:border-t-0 xl:border-l">
            <FormMarkerStyleSection
              value={selectedLayerMarkerStyle}
              allowInherit
              inheritedValue={inheritedMarkerStyle}
              isSubmitRequested={formCtx.isSubmitRequested}
              inputAttrs={layerPresentationFields.markerStyleCode.as(
                'hidden',
                selectedLayerMarkerStyle ?? '',
              )}
              isEditing={isEditing && canEditLayerFields}
              disabled={formCtx.submitting}
              onSelect={onSelectLayerMarkerStyle}
            />
          </div>
          <div class="border-border min-w-0 border-t xl:border-t-0 xl:border-l">
            <FormCardStyleSection
              value={selectedLayerCardStyle}
              allowInherit
              inheritedValue={inheritedCardStyle}
              inputAttrs={layerPresentationFields.cardStyleCode.as(
                'hidden',
                selectedLayerCardStyle ?? '',
              )}
              isEditing={isEditing && canEditLayerFields}
              isSubmitting={formCtx.submitting}
              isSubmitRequested={formCtx.isSubmitRequested}
              onSelect={onSelectLayerCardStyle}
            />
          </div>
          <div
            class="border-border grid min-w-0 grid-cols-1 border-t xl:col-span-3 xl:grid-cols-2"
          >
            <div class="min-w-0">
              <FormParentSection
                class={formSelectionSectionStyles}
                title={m.admin__forms_layer_parent_project_title()}
                subtitle={m.admin__forms_layer_parent_project_subtitle()}
                issues={parentProjectIssues}
                parent={selectedParentProject}
                fallbackImage={selectedParentProject
                  ? `/api/mapRenders/projects/${selectedParentProject.id}/asset`
                  : null}
                hiddenInputAttrs={hiddenParentProjectInputAttrs}
                closeOnParentChange={true}
                isEditing={isEditing && canSetParentProject}
                isSubmitting={formCtx.submitting}
                isSubmitRequested={formCtx.isSubmitRequested}
                startInAddingMode={isNewLayerRef}
                onSearch={onSearchParentProjects}
                onReplaceParent={onReplaceParentProject}
              />
            </div>
            <div class="border-border min-w-0 border-t xl:border-t-0 xl:border-l">
              <section
                class={`${formSelectionSectionStyles} flex min-h-0 flex-col gap-4`}
              >
                <SectionHeader
                  title={m.admin__forms_layer_project_default_title()}
                  description={m.admin__forms_layer_project_default_subtitle()}
                />
                <div class="ml-6">
                  <Card.Root
                    size="md"
                    class="border-border bg-foreground/4 min-h-14 rounded-lg border bg-none shadow-none before:hidden"
                  >
                    <label
                      for="layer-default-shown"
                      class="flex min-w-0 flex-1 items-center px-5 py-3 text-sm font-semibold"
                    >
                      {m.admin__forms_layer_default_shown()}
                    </label>
                    <Card.Actions
                      padding="none"
                      bg="none"
                      class="border-border/60 w-auto! min-w-0! shrink-0 border-l px-12!"
                    >
                      <Switch
                        id="layer-default-shown"
                        checked={isDefaultVisible}
                        disabled={!isEditing ||
                          !canEditLayerFields ||
                          formCtx.submitting}
                        size="sm"
                        onCheckedChange={value =>
                          onDefaultVisibleChange(value === true)}
                      />
                    </Card.Actions>
                  </Card.Root>
                </div>
              </section>
              <input {...defaultVisibleInputAttrs}>
            </div>
          </div>
        </div>
      </FormSurface>
    </Main.Facet>

    <Main.Facet
      isVisible={isFieldsFacet && hasSelectedParentProject}
      transition="fade"
      fillHeight={true}
      previousAction={buildFacetNavAction('fields', 'previous')}
      nextAction={buildFacetNavAction('fields', 'next')}
      class="right-0! left-0!"
      attrs={{ 'data-facet-id': 'fields' }}
    >
      <FormSurface>
        <div class="grid grid-cols-1 lg:grid-cols-2">
          {#each propertyColumns as column, columnIndex}
            <div
              class={columnIndex > 0
                ? 'border-border min-w-0 border-t lg:border-t-0 lg:border-l'
                : 'min-w-0'}
            >
              <LayerPropertyCard.Column
                title={column.title}
                description={column.description}
                rows={column.rows}
                toRowFields={index => formCtx.form.fields.data.properties[index]}
                isEditing={isEditing && canEditLayerFields}
                isContributableDisabled={column.isContributableDisabled}
                isFlipDisabled={isLayerCardFlipDisabled}
                transfer={layerPropertyTransfer}
                onVisibleChange={(index, value) =>
                  updateLayerPropertyToggle(index, 'isVisible', value)}
                onUserContributableChange={(index, value) =>
                  updateLayerPropertyToggle(index, 'isUserContributable', value)}
              />
            </div>
          {/each}
        </div>
      </FormSurface>
    </Main.Facet>
    <Main.Facet
      extraScroll={320}
      isVisible={activeFacet === 'location'}
      transition="fade"
      fillHeight={true}
      previousAction={buildFacetNavAction('location', 'previous')}
      nextAction={buildFacetNavAction('location', 'next')}
      class="right-0! left-0!"
      attrs={{ 'data-facet-id': 'location' }}
    >
      <FormSurface>
        {#if layer?.data?.id}
          {#if formCtx.form.fields.value().data?.featureIntentSettings !== undefined}
            <input
              {...formCtx.form.fields.data.featureIntentSettings.as(
                'hidden',
                String(formCtx.form.fields.value().data?.featureIntentSettings),
              )}
            >
          {/if}
          <FeatureIntentSettings
            draft={formCtx.form.fields.value().data?.featureIntentSettings as
              | string
              | undefined}
            revision={layer?.data?.modifiedAt}
            onDraftChange={draft =>
              formCtx.form.fields.data.featureIntentSettings.set(draft)}
            scopeType="layer"
            scopeId={layer.data.id}
            disabled={!isEditing || formCtx.submitting}
          />
        {/if}
      </FormSurface>
    </Main.Facet>
    <Main.Facet
      isVisible={activeFacet === 'advanced'}
      transition="fade"
      fillHeight={true}
      previousAction={buildFacetNavAction('advanced', 'previous')}
      nextAction={buildFacetNavAction('advanced', 'next')}
      class="right-0! left-0!"
      attrs={{ 'data-facet-id': 'advanced' }}
    >
      <FormSurface>
        <section class="flex min-h-0 flex-col gap-6 pb-6">
          <SectionHeader title={m.project_advanced()} />
          <div
            class="mx-6 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,max(480px,calc((100%_-_2rem)/2))),1fr))] gap-8"
          >
            {#each [
              {
                key: 'allowFeatureDescriptions',
                label: m.feature_policy_descriptions(),
              },
              {
                key: 'locationBasedFeatureNames',
                label: m.feature_policy_location_names(),
              },
            ] as setting (setting.key)}
              {@const policyValue =
                formCtx.form.fields.value().data?.metadata?.[setting.key]}
              <div
                class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-xl border border-[var(--form-control-border)] bg-[var(--form-control-edit-fill)] px-5 py-3"
              >
                <h3 class="min-w-0 text-sm font-semibold break-words whitespace-normal">
                  {setting.label}
                </h3>
                <Select
                  class="w-auto! min-w-0! justify-self-end"
                  reserveTriggerSpace
                  displayClass="px-3! [&>div]:p-0!"
                  triggerClass="relative shrink-0 cursor-pointer gap-2 bg-background/50! border-[var(--form-control-border)]!"
                  placeholder={setting.label}
                  value={policyValue == null ? 'inherit' : String(policyValue)}
                  items={[
                    { value: 'inherit', label: m.location_policy_inherit() },
                    { value: 'true', label: m.feature_policy_enabled() },
                    { value: 'false', label: m.feature_policy_disabled() },
                  ]}
                  isEditing={isEditing && canEditLayerFields}
                  disabled={formCtx.submitting}
                  triggerAttrs={{ 'aria-label': setting.label }}
                  onValueChange={value =>
                    setFeaturePolicyOverride(
                      setting.key as
                        | 'allowFeatureDescriptions'
                        | 'locationBasedFeatureNames',
                      value === 'inherit' ? '' : value,
                    )}
                />
              </div>
            {/each}
          </div>
        </section>
        {#if committedLayer?.data?.id}
          {#key committedLayer.data.id}
            <LayerRelocationPolicyPanel
              layerId={committedLayer.data.id}
              staged={stagedRelocationPolicy}
              isEditing={isEditing && canEditLayerFields}
              saving={formCtx.submitting}
              onChange={onRelocationPolicyChange}
            />
          {/key}
        {/if}
      </FormSurface>
    </Main.Facet>
    {#each ['allowFeatureDescriptions', 'locationBasedFeatureNames'] as key}
      {@const value = formCtx.form.fields.value().data?.metadata?.[key]}
      {#if typeof value === 'boolean'}
        <input
          {...layerPresentationFields[
            key as 'allowFeatureDescriptions' | 'locationBasedFeatureNames'
          ].as('hidden', value)}
        >
      {/if}
    {/each}
    {#if stagedRelocationPolicy}
      <input {...hiddenRelocationPolicyAttrs()}>
    {/if}
  </Main.Form>
  <Main.Facet
    isVisible={activeFacet === 'features'}
    transition="fade"
    fillHeight={true}
    edgeToEdge={true}
    contentClass="h-full overflow-hidden"
    attrs={{ 'data-facet-id': 'features' }}
  >
    {#if activeFacet === 'features' && layer?.data?.id}
      {#key layer.data.id}
        {@const deferredResourceId = layer.data!.id}
        <Deferred
          load={() =>
            import(
              '#lib/bits/patterns/resource/adminFeatureIndex/ScopedFeatureIndex.svelte'
            )}
        >
          {#snippet pending()}
            <ScopedFeatureIndexSkeleton />
          {/snippet}
          {#snippet children(module)}
            <module.default
              embedded
              resourceType="layer"
              resourceId={deferredResourceId}
            />
          {/snippet}
        </Deferred>
      {/key}
    {/if}
  </Main.Facet>
  <Main.Facet
    isVisible={activeFacet === 'updates' && canEditLayerCore}
    class="right-0! left-0!"
    attrs={{ 'data-facet-id': 'updates' }}
  >
    {#if activeFacet === 'updates' &&
      canEditLayerCore &&
      isCurrentRefLoaded &&
      layer?.data?.id}
      {#key `${layer.data.id}:${layer.data.modifiedAt}:${adminCtx.view.account.user?.id}`}
        {@const deferredResourceId = layer.data!.id}
        <Deferred
          load={() =>
            import('#lib/bits/patterns/revisionHistory/AdminResourceHistory.svelte')}
        >
          {#snippet pending()}
            <HistorySkeleton showFields={false} />
          {/snippet}
          {#snippet children(module)}
            <module.default resource="layer" resourceId={deferredResourceId} />
          {/snippet}
        </Deferred>
      {/key}
    {/if}
  </Main.Facet>
</Main.Root>

{#if pendingPublishId && pendingPublishId === layer?.data?.id}
  <PublishChildrenDialog
    resourceType="layer"
    onChoice={choice => onPublishToggle(choice)}
    onCancel={() => {
      pendingPublishId = null
    }}
  />
{/if}

{#if pendingPreviewId && pendingPreviewId === layer?.data?.id}
  <PublishChildrenDialog
    resourceType="layer"
    mode="preview"
    onChoice={choice => onPreview(choice)}
    onCancel={() => {
      pendingPreviewId = null
    }}
  />
{/if}

{#if pendingImagePublicationId && pendingImagePublicationId === layer?.data?.id}
  <PublishUnclassifiedImagesDialog
    scopeType="layer"
    scopeId={pendingImagePublicationId}
    onDone={() => (pendingImagePublicationId = null)}
  />
{/if}
