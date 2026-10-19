<script lang="ts">
import type { RemoteForm, RemoteFormInput, RemoteFormFields } from '$app/server'

// SVELTE
import { page } from '$app/state'
import { untrack } from 'svelte'
// I18N
import { getLocaleKey, getLocaleOrder, m } from '#lib/i18n.js'
// TOAST
import { toast } from 'svelte-sonner'
// SERVICES
import {
  bindAdminFacetHistorySync,
  captureHeaderTransitionSnapshot,
  createFacetNavActionBuilder,
  createResourceFormConfig,
  focusFacetFromHash,
  getEditorCtrl,
  handleResourceBooleanStateToggle,
  revalidateAfterSubmitAttempt,
  resolveOptimisticHeaderFacets,
  resolveOptimisticHeaderStatus,
  resolveFacetTabsWithIssues,
  resetLocaleFields,
  syncAdminFacetFromHash,
  toFormLevelIssueMessages,
  toUniqueIssueMessages,
  translateLocaleIntoEmptyFields,
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
  overrideLayerEntityBoolean,
  overrideLayerListItemFromSubmit,
  overrideLayerListItemBoolean,
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
import {
  archiveLayer,
  getLayer,
  getLayers,
  layerForm,
  publishLayer,
} from '#lib/api/layer.remote.js'
import { getProjects } from '#lib/api/project.remote.js'
import { getProjectProperties } from '#lib/api/property.remote.js'
import {
  resolveLayerProjectSelectionScope,
  toLayerAuthActor,
} from '#lib/api/services/authz/index.js'
// SCHEMA
import { LayerPreflightFormData } from '#lib/db/zod/index.js'
// CONFIG
import { NEW_REF, NEW_TITLE } from '#lib/constants.js'
// BITS COMPONENTS
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import {
  formSectionDividerStyles,
  formSelectionSectionStyles,
} from '#lib/bits/patterns/forms/formSurface/formSurface.styles.js'
import FormCardStyleSection from '#lib/bits/patterns/forms/formCardStyleSection/FormCardStyleSection.svelte'
import { isCardStyleCode, DEFAULT_CARD_STYLE } from '#lib/features/cardStyle.js'
import type { CardStyleCode } from '#lib/features/cardStyle.js'
import {
  FormI18nDescriptorFields,
  FormI18nSection,
  FormParentSection,
  FormMapStyleSection,
  GridSpacer,
  LayerPropertyCard,
  Main,
} from '#lib/bits/index.js'
import { SectionHeaderPrimitive } from '#lib/bits/custom/form/index.js'
// MAP STYLES
import {
  REGISTERED_MAP_STYLE_CATALOG,
  SELECTABLE_MAP_STYLE_CATALOG,
} from '#lib/map/styles/catalog.js'
import { getMapStyleCatalogI18n } from '#lib/map/styles/i18n.js'
import { getMapStyleRenderAssetPath } from '#lib/map/styles/render.shared.js'
import { isMapStyleKey } from '#lib/map/styles/registry.js'
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
import type { Locale } from '#lib/types.js'

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
// - onTranslate
// - onResetLocale
// - onReplaceParentProject
// - syncProjectPropertiesIntoLayerForm
// - onSearchParentProjects
// - updateLayerPropertyToggle
//
// REMOTE REFRESH + STATE TOGGLES
// - refreshLayer
// - handleLayerStateToggle
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
const translatableI18nFields = ['name', 'nameShort', 'description'] as const

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

      const layerId = layer?.data?.id

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
    refreshResource: async ({ success, result }) => {
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
// Metadata retains arbitrary JSON keys; expose its known string controls through
// SvelteKit's field contract instead of treating their .as method as a JSON key.
const layerPresentationFields = $derived(
  formCtx.form.fields.data.metadata as unknown as RemoteFormFields<{
    mapStyleCode?: string
    cardStyleCode?: string
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
const projectDefaultMapStyle = $derived<MapStyleSelectionItem>({
  id: 'project-default',
  code: '__project-default__',
  i18n: {
    en: {
      name: m.theme_map_project_default(),
      description: m.theme_map_project_default_description(),
    },
  },
})
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

const hasSelectedParentProject = $derived(selectedParentProjectId.length > 0)

/********************
 *  FACET + PERMISSION STATE
 ************/
const headerFacetTabs = $derived(
  getAdminFacetTabsForResource(FirstClassResource.layer, {
    coreOnly: !hasSelectedParentProject,
  }),
)

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
const canSetParentProject = $derived(canEditLayerFields)
const canPublishLayer = $derived(layerPermissions.canPublish)
const canDeleteLayer = $derived(layerPermissions.canArchive)
const canSubmitLayer = $derived(isCoreFacet ? canEditLayerCore : canEditLayerFields)

/********************
 *  FIELD PRESENTATION
 ************/
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

// I18N actions
async function onTranslate(
  sourceLocale: Locale,
  targetLocale: Locale,
): Promise<boolean> {
  const translated = await translateLocaleIntoEmptyFields({
    form: formCtx.form,
    sourceLocale,
    targetLocale,
    fields: [...translatableI18nFields],
  })
  if (translated) revalidateAfterProgrammaticChange()
  return translated
}

function onResetLocale(targetLocale: Locale): void {
  resetLocaleFields({
    form: formCtx.form,
    targetLocale,
    fields: [...translatableI18nFields],
  })
  revalidateAfterProgrammaticChange()
}

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

async function handleLayerStateToggle({
  field,
  successWhenTrue,
  successWhenFalse,
  setBusy,
  mutate,
}: {
  field: 'isPublished' | 'isArchived'
  successWhenTrue: string
  successWhenFalse: string
  setBusy: (value: boolean) => void
  mutate: (payload: { id: string; state: boolean }) => Promise<{ data: { id: string } }>
}): Promise<void> {
  const current = layer?.data
  if (!current) return
  const nextState = !current[field]
  setBusy(true)
  const mutation = adminCtx.view.cacheCtx.beginMutation('layer', {
    meta: { id: current.id },
    data: { [field]: nextState },
  })
  try {
    await (mutate as typeof publishLayer)({
      id: current.id,
      state: nextState,
      meta: { isAdminRequest: true },
    }).updates(
      ...mutation.updates,
      getLayer({
        ref: layerRef,
        refKey: 'id',
        meta: { ...adminCtx.view.resources.queryMeta, profile: 'admin' },
      }).withOverride(overrideLayerEntityBoolean(field, nextState)),
    )
    mutation.settle(true)
    commitLayerState(await refreshLayer())
    await adminCtx.view.cacheCtx.reconcile('layer')
    toast.success(nextState ? successWhenTrue : successWhenFalse)
  } catch {
    mutation.settle(false)
    toast.error(m.long_crazy_peacock_care())
  } finally {
    setBusy(false)
  }
}

async function onPublishToggle(): Promise<void> {
  if (!isCurrentRefLoaded || !canPublishLayer) return
  await handleLayerStateToggle({
    field: 'isPublished',
    successWhenTrue: m.published(),
    successWhenFalse: m.forms__unpublished(),
    setBusy: value => headerCtrl.setPublishing(value),
    mutate: publishLayer,
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
  const resolvedFacetTabsSnapshot = untrack(() => headerFacetTabsWithIssues)
  return editorCtrl.syncRouteAndLoad({
    ref: layerRef,
    resetFormActionsSignature: () => {
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
        const nextFacet =
          currentFacet && resolvedFacetTabsSnapshot.has(currentFacet)
            ? currentFacet
            : 'core'
        adminCtx.setFacet(nextFacet, nextRef, FirstClassResource.layer)
      })
    },
    load: refreshLayer,
    commit: commitSettledLayerState,
  })
})

$effect(() => {
  activeFacet
  contentsElement
  focusFacetFromHash(contentsElement, activeFacet)
})

// Facet guards
$effect(() => {
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
      attrs={{ 'data-facet-id': 'core' }}
    >
      <FormSurface>
        <FormI18nSection
          title="Profile"
          {locales}
          {onTranslate}
          {onResetLocale}
          {isEditing}
        >
          {#snippet left()}
            <div class="flex items-center gap-3">
              <LayerIcon class="size-6 text-primary" aria-hidden="true" />
              <h2 class="text-xl font-semibold tracking-tight">Profile</h2>
            </div>
          {/snippet}
          {#snippet center()}
            <SectionHeaderPrimitive.Issues issues={formLevelIssues} />
          {/snippet}

          {#snippet children(
            locale,
          )}
            <FormI18nDescriptorFields
              form={formCtx.form}
              fields={formCtx.form.fields.data.i18n[locale]}
              {locale}
              isEditing={isEditing && canEditLayerCore}
              {isRequiredInPreflight}
            />
          {/snippet}
        </FormI18nSection>

        <div class={`${formSectionDividerStyles} grid grid-cols-1 xl:grid-cols-3`}>
          <div class="min-w-0">
            <FormParentSection
              class={formSelectionSectionStyles}
              title={m.admin__forms_layer_parent_project_title()}
              subtitle={m.admin__forms_layer_parent_project_subtitle()}
              issues={parentProjectIssues}
              parent={selectedParentProject}
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
          <div class="min-w-0 border-t border-border xl:border-l xl:border-t-0">
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
          <div class="min-w-0 border-t border-border xl:border-l xl:border-t-0">
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
        </div>
      </FormSurface>
    </Main.Facet>

    <Main.Facet
      isVisible={isFieldsFacet && hasSelectedParentProject}
      transition="fade"
      fillHeight={true}
      previousAction={buildFacetNavAction('fields', 'previous')}
      nextAction={buildFacetNavAction('fields', 'next')}
      attrs={{ 'data-facet-id': 'fields' }}
    >
      <div class="bits-form__section" data-facet-id="fields">
        <section class="bits-form__section">
          <GridSpacer cols={2} leftCols={1} rightCols={1}>
            {#snippet left()}
              <LayerPropertyCard.Column
                title={propertyColumns[0].title}
                description={propertyColumns[0].description}
                rows={propertyColumns[0].rows}
                toRowFields={index => formCtx.form.fields.data.properties[index]}
                isEditing={isEditing && canEditLayerFields}
                isContributableDisabled={propertyColumns[0].isContributableDisabled}
                isFlipDisabled={isLayerCardFlipDisabled}
                onVisibleChange={(index, value) =>
                  updateLayerPropertyToggle(index, 'isVisible', value)}
                onUserContributableChange={(index, value) =>
                  updateLayerPropertyToggle(index, 'isUserContributable', value)}
              />
            {/snippet}

            {#snippet right()}
              <LayerPropertyCard.Column
                title={propertyColumns[1].title}
                description={propertyColumns[1].description}
                rows={propertyColumns[1].rows}
                toRowFields={index => formCtx.form.fields.data.properties[index]}
                isEditing={isEditing && canEditLayerFields}
                isContributableDisabled={propertyColumns[1].isContributableDisabled}
                isFlipDisabled={isLayerCardFlipDisabled}
                onVisibleChange={(index, value) =>
                  updateLayerPropertyToggle(index, 'isVisible', value)}
                onUserContributableChange={(index, value) =>
                  updateLayerPropertyToggle(index, 'isUserContributable', value)}
              />
            {/snippet}
          </GridSpacer>
        </section>
      </div>
    </Main.Facet>
  </Main.Form>
</Main.Root>
