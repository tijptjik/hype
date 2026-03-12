<script lang="ts">
// SVELTE
import { page } from '$app/state'
import type { RemoteForm, RemoteFormInput } from '@sveltejs/kit'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { untrack } from 'svelte'
// I18N
import { getLocale, getLocaleKey, getLocaleOrder, m, toLocaleKey } from '$lib/i18n'
// TOAST
import { toast } from 'svelte-sonner'
// SERVICES
import {
  captureHeaderTransitionSnapshot,
  createResourceEditorPage,
  createResourceFormConfig,
  handleResourceBooleanStateToggle,
  revalidateAfterSubmitAttempt,
  resolveOptimisticHeaderFacets,
  resolveOptimisticHeaderStatus,
  resolveFacetTabsWithIssues,
  resetLocaleFields,
  toFormLevelIssueMessages,
  toUniqueIssueMessages,
  translateLocaleIntoEmptyFields,
  updateFormData,
} from '$lib/client/services/form'
import {
  getCurrentLayerFormData,
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
} from '$lib/client/services/layer'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
import { getHeaderCtrl } from '$lib/context/header.svelte'
// REMOTE
import {
  archiveLayer,
  getLayer,
  getLayers,
  layerForm,
  publishLayer,
} from '$lib/api/server/layer.remote'
import { getProjects } from '$lib/api/server/project.remote'
import { getProjectProperties } from '$lib/api/server/property.remote'
import {
  resolveLayerProjectSelectionScope,
  toLayerAuthActor,
} from '$lib/api/services/authz'
// SCHEMA
import { LayerPreflightFormData } from '$lib/db/zod'
// CONFIG
import { NEW_REF, NEW_TITLE } from '$lib/constants'
// BITS COMPONENTS
import {
  FormI18nDescriptorFields,
  FormI18nSection,
  FormParentProjectSection,
  GridSpacer,
  LayerPropertyCard,
  Main,
} from '$lib/bits'
import type { ParentSectionProjectItem } from '$lib/bits'
import { SectionHeaderPrimitive } from '$lib/bits/custom/form'
// FACTORIES
import { configureForm } from '$lib/factories.svelte'
import type { RemoteFormOptions } from '$lib/factories.svelte'
// NAVIGATION
import { getAdminFacetTabsForResource, navigateOnAdmin } from '$lib/navigation'
// UTILS
import { createSchemaRequiredInferer } from '$lib/utils/form-schema'
// ICONS
import LayerIcon from 'virtual:icons/lucide/layers'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// TYPES
import type { FormDataUpdaterForm, HeaderTransitionSnapshot, Locale } from '$lib/types'
import type { Property } from '$lib/db/zod/schema/property.types'
import type {
  LayerGetState,
  LayerPropertyPartialExtra,
  LayerSubmitData,
} from '$lib/db/zod/schema/layer.types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// PAGE SETUP
// - adminCtx
// - headerCtrl
// - facetTabs
// - resourceEditorPage
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
const resourceEditorPage = createResourceEditorPage({
  headerCtrl,
  icon: LayerIcon,
  facetTabs,
})

const layerRef = $derived(page.params.layer as string)
const locales = $derived(getLocaleOrder(getLocale()))
const activeFacet = $derived(
  adminCtx.activeFacet === false ? 'core' : adminCtx.activeFacet,
)

let contentsElement: HTMLFormElement | undefined = $state()

let lastHeaderKey = $state('')
let lastFormActionsSignature = $state('')
let suppressFormLevelIssues = $state(false)
let hasAutoEnteredEditForNew = $state(false)
let lastMergedProjectId = $state<string | null>(null)
let settledLayerRef = $state<string | null>(null)
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

const isCoreFacet = $derived(activeFacet === 'core')
const isFieldsFacet = $derived(activeFacet === 'fields')
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
type LayerRemoteFormInput = RemoteFormInput & LayerEditorFormInput
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
        meta: { isAdminRequest: true, profile: 'admin' },
      })
      const listQuery = getLayers({
        conditions: adminCtx.appCtx.isSuperAdmin()
          ? { isArchived: null, isPublished: null }
          : { isArchived: false, isPublished: null },
        prisms: adminCtx.appCtx.state.prisms,
        meta: { isAdminRequest: true, profile: 'card' },
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
const currentUser = $derived(adminCtx.appCtx.getUser())
const currentActor = $derived(toLayerAuthActor(currentUser ?? {}))
let selectedParentProjectById = $state<Record<string, ParentSectionProjectItem>>({})

const selectedParentProject = $derived.by((): ParentSectionProjectItem | null => {
  return toSelectedParentProject({
    form: formDataUpdater,
    layer,
    selectedParentProjectById,
    projectCache: adminCtx.appCtx.cache.project,
  })
})
const selectedParentProjectId = $derived(selectedParentProject?.id ?? '')
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
    prismProjectId: adminCtx.appCtx.getPrism(FirstClassResource.project)[0] ?? null,
    prismOrganisationId:
      adminCtx.appCtx.getPrism(FirstClassResource.organisation)[0] ?? null,
    resourceHubId: adminCtx.appCtx.hub?.id ?? null,
    projectCache: adminCtx.appCtx.cache.project,
    organisationCache: adminCtx.appCtx.cache.organisation,
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
    propertyCache: adminCtx.appCtx.cache.property,
    hubCodeById: hubId => adminCtx.appCtx.cache.hub.get(hubId)?.code ?? null,
    userPreferences: adminCtx.appCtx.getUserPreferences(),
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
    let propertyState: { data?: Property[] | null }
    try {
      propertyState = (await getProjectProperties({
        projectId,
        meta: { isAdminRequest: true },
      })) as { data?: Property[] | null }
    } catch {
      toast.error(m.long_crazy_peacock_care())
      return
    }

    const projectProperties = Array.isArray(propertyState?.data)
      ? propertyState.data
      : []

    for (const projectProperty of projectProperties) {
      if (!projectProperty?.id) continue
      adminCtx.appCtx.cache.property.set(projectProperty.id, projectProperty)
    }

    applyProjectPropertiesToLayerForm({
      form: formDataUpdater,
      projectProperties,
    })

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
        data: {
          ...committedLayer.data,
          properties: mergedProperties,
        },
      })
    }

    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
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
    resourceHubId: adminCtx.appCtx.hub?.id ?? null,
  })
  if (!scope.canCreate) return []

  const baseParams = {
    q: query,
    prisms: adminCtx.appCtx.state.prisms,
    meta: { isAdminRequest: true, profile: 'card' as const },
  }
  const queryPlan = toLayerParentProjectSearchQueries({
    scope,
    baseParams,
  })
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
    data.properties[index] = {
      ...current,
      [field]: value,
    }
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
    return {
      data: null,
      durationMs: 0,
    }
  }

  return (await getLayer({
    ref,
    refKey: 'id',
    meta: { isAdminRequest: true, profile: 'admin' },
  })) as LayerGetState
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
  await handleResourceBooleanStateToggle({
    current: layer?.data,
    field,
    successWhenTrue,
    successWhenFalse,
    setBusy,
    mutate,
    applyOptimistic: nextState => {
      const layerId = layer?.data?.id
      if (!layerId) return

      getLayer({
        ref: layerRef,
        refKey: 'id',
        meta: { isAdminRequest: true, profile: 'admin' },
      }).withOverride(overrideLayerEntityBoolean(field, nextState))

      getLayers({
        conditions: adminCtx.appCtx.isSuperAdmin()
          ? { isArchived: null, isPublished: null }
          : { isArchived: false, isPublished: null },
        prisms: adminCtx.appCtx.state.prisms,
        meta: { isAdminRequest: true, profile: 'card' },
      }).withOverride(overrideLayerListItemBoolean(layerId, field, nextState))
    },
    refresh: () => refreshLayer(),
    commit: commitLayerState,
    onError: () => {
      toast.error(m.long_crazy_peacock_care())
    },
  })
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
  optimisticHeaderState = captureHeaderTransitionSnapshot(headerCtrl)
})

$effect(() => {
  const resolvedFacetTabsSnapshot = untrack(() => headerFacetTabsWithIssues)
  return resourceEditorPage.syncRouteAndLoad({
    ref: layerRef,
    resetFormActionsSignature: () => {
      lastFormActionsSignature = ''
      suppressFormLevelIssues = true
      lastMergedProjectId = null
      settledLayerRef = null
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
    return
  }
  headerCtrl.setHeaderForEntity(title, LayerIcon, displayFacets)
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
  resourceEditorPage.wireHeaderHandlers({
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

  lastFormActionsSignature = resourceEditorPage.syncHeaderStatus({
    headerCtrl,
    status: {
      ...status,
      ...inertActionOverrides,
    },
    lastSignature: lastFormActionsSignature,
  })
})
</script>

<Main.Root>
  <Main.Form
    bind:formEl={contentsElement}
    attrs={formCtx.attributes}
    isReady={Boolean(formCtx.form?.fields && (layer?.data || isNewLayerRef))}
  >
    <Main.Section
      isVisible={isCoreFacet}
      transition="fade"
      attrs={{ 'data-facet-id': 'core' }}
    >
      <div class="space-y-4" data-facet-id="core">
        <FormI18nSection
          title={m.admin__forms_common_descriptors()}
          {locales}
          {onTranslate}
          {onResetLocale}
          {isEditing}
        >
          {#snippet center()}
            <SectionHeaderPrimitive.Issues issues={formLevelIssues} />
          {/snippet}

          {#snippet children(locale)}
            {@const formLocale = toLocaleKey(locale)}
            <FormI18nDescriptorFields
              form={formCtx.form}
              fields={formCtx.form.fields.data.i18n[formLocale]}
              {formLocale}
              {locale}
              isEditing={isEditing && canEditLayerCore}
              {isRequiredInPreflight}
            />
          {/snippet}
        </FormI18nSection>

        <FormParentProjectSection
          title={m.admin__forms_layer_parent_project_title()}
          subtitle={m.admin__forms_layer_parent_project_subtitle()}
          issues={parentProjectIssues}
          parent={selectedParentProject}
          hiddenProjectInputAttrs={hiddenParentProjectInputAttrs}
          isEditing={isEditing && canSetParentProject}
          isSubmitting={formCtx.submitting}
          isSubmitRequested={formCtx.isSubmitRequested}
          startInAddingMode={isNewLayerRef}
          onSearchProjects={onSearchParentProjects}
          onReplaceParent={onReplaceParentProject}
        />
      </div>
    </Main.Section>

    <Main.Section
      isVisible={isFieldsFacet && hasSelectedParentProject}
      transition="fade"
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
    </Main.Section>
  </Main.Form>
</Main.Root>
