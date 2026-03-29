<script lang="ts">
// SVELTE
import type { RemoteQuery, RemoteQueryOverride } from '@sveltejs/kit'
import { goto } from '$app/navigation'
import { page } from '$app/state'
import { onMount, untrack } from 'svelte'
// TOAST
import { toast } from 'svelte-sonner'
// ADAPTERS
import { useImageProviderModel } from '$lib/adapters/image'
// I18N
import {
  getLocale,
  getLocaleKey,
  getLocaleOrder,
  m,
  toLocaleKey,
  translateI18nFields,
} from '$lib/i18n'
// SERVICES
import {
  bindAdminFacetHistorySync,
  captureHeaderTransitionSnapshot,
  createFacetNavActionBuilder,
  createResourceFormConfig,
  focusFacetFromHash,
  getEditorCtrl,
  prepareSubmitPayloadMeta,
  revalidateAfterSubmitAttempt,
  resolveFacetTabsWithIssues,
  resolveOptimisticHeaderFacets,
  resolveOptimisticHeaderStatus,
  syncAdminFacetFromHash,
  toFormLevelIssueMessages,
  updateFormData,
} from '$lib/client/services/form'
import {
  getProgrammaticFeatureInputEntries,
  getNonTranslatableFeatureFieldItems,
  getTranslatableSpecifierProperties,
  toLayerBackedFeatureProperties,
  toEmptyFeatureFormInput,
  toCurrentAuthorizationUser,
  toCurrentContributorUser,
  toFeatureFormInput,
  DEFAULT_NEW_FEATURE_COORDINATES,
} from '$lib/client/services/feature'
import {
  getCoordinates,
  getUserLocationCoordinates,
} from '$lib/client/services/geospatial'
import {
  getFeatureImageProviderOptions,
  getFeatureImagesFacetHref,
  getSafeImageUrl,
} from '$lib/client/services/image'
import { getIssueMessagesForPath } from '$lib/client/services/issues'
import {
  getNameForToast,
  overrideResourceEntityBoolean,
  overrideResourceListItemBoolean,
} from '$lib/client/services/resource'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
import { getHeaderCtrl } from '$lib/context/header.svelte'
// REMOTE
import {
  archiveFeature,
  featureForm,
  getFeature,
  getFeatures,
  publishFeature,
} from '$lib/api/server/feature.remote'
import { getLayer, getLayers } from '$lib/api/server/layer.remote'
import { getOrganisationsWhichHaveLayers } from '$lib/api/server/organisation.remote'
import { getProjectsWhichHaveLayers } from '$lib/api/server/project.remote'
// SCHEMA
import { FeaturePreflightFormData } from '$lib/db/zod'
// FACTORIES
import { configureForm } from '$lib/factories.svelte'
// BITS
import {
  cx,
  FormFacetNav,
  FormFeatureFields,
  FormFeatureParentSection,
  FormFeatureVisualSection,
  FormFeatureSectionHeader,
  FeatureImageEditor,
  FormI18nDescriptorFields,
  FormI18nSection,
  FormMapSection,
  Main,
} from '$lib/bits'
import {
  createFeatureParentSearchPrisms,
  createFeatureParentSectionController,
  toParentLayerItem,
  toParentOrganisationItem,
  toParentProjectItem,
} from '$lib/bits/patterns/forms/formFeatureParentSection'
import {
  createFeatureVisualSectionController,
  HiddenInputs,
} from '$lib/bits/custom/form'
import {
  FEATURE_EDITOR_COLLECTIONS_SECTION_CLASS,
  FEATURE_EDITOR_CONTENT_PAD_CLASS,
  FEATURE_EDITOR_CONTENT_SECTION_CLASS,
  FEATURE_EDITOR_FORM_CLASS,
  FEATURE_EDITOR_PLACEHOLDER_CLASS,
  FEATURE_EDITOR_ROOT_CLASS,
  getFeatureEditorFacetClass,
} from './page.styles'
import ImageProvider from '$lib/providers/ImageProvider.svelte'
import { canCreateFeatureForProject } from '$lib/api/services/authz/feature'
// NAVIGATION
import {
  getAdjacentResourceRefs,
  getAdminFacetOrderForResource,
  getAdminFacetTabsForResource,
  getUrlForResource,
} from '$lib/navigation'
// UTILS
import { createSchemaRequiredInferer } from '$lib/utils/form-schema'
// ICONS
import FeatureIcon from 'virtual:icons/lucide/map-pin'
// CONFIG
import { NEW_REF, NEW_TITLE } from '$lib/constants'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// TYPES
import type { Point } from 'geojson'
import type { FacetType, HeaderTransitionSnapshot, Id, Locale } from '$lib/types'
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'
import type {
  FeatureFormInput,
  FeatureGetState,
} from '$lib/db/zod/schema/feature.types'
import type { Layer } from '$lib/db/zod/schema/layer.types'
import type {
  ParentSectionLayerItem,
  ParentSectionOrganisationItem,
  ParentSectionProjectItem,
} from '$lib/bits/patterns/forms/formParentSection'
import type { ParentProjectRecord } from '$lib/bits/patterns/forms/formFeatureParentSection'

type FeaturePageState = FeatureGetState
const noopHeaderAction = (): void => {}

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// PAGE SETUP
// - adminCtx
// - headerCtrl
// - facetTabs
// - editorCtrl
// - featureRef
// - localeKey
// - locales
// - activeFacet
// - featureFacetOrder
//
// INTERNAL NAVIGATION STATE
// - isCoreFacet
// - isFieldsFacet
// - isAddressFacet
// - isImagesFacet
//
// INTERNAL NAVIGATION ACTIONS
// - goToFacet
// - buildFacetNavAction
//
// INTERNAL NAVIGATION SYNC
// - lastSyncedFacetHash
// - hash -> facet sync
// - facet -> history sync
// - route/ref load sync
// - facet focus sync
// - header facet sync
// - validation facet redirect
//
// UI STATE
// - isNewFeatureRef
// - lastHeaderKey
// - lastFormActionsSignature
// - optimisticHeaderState
// - isEditing
// - showsVisualSection
// - isVisualSectionCollapsed
// - visualSectionReopenScrollStartAt
// - visualSectionReopenBufferTimeout
// - visualSectionReopenSettleTimeout
// - isVisualSectionReopenArmed
// - contentsElement
//
// UI EFFECTS
// - optimistic header snapshot sync
//
// RESOURCE STATE
// - feature
// - committedFeature
// - settledFeatureRef
//
// SET NAVIGATION STATE
// - featureList
// - currentFeatureId
// - previousFeatureRef
// - nextFeatureRef
//
// ON MOUNT
// - fields facet guard
// - new-feature bootstrap effects
//
// FORM STATE
// - emptyFeatureFormSeed
// - featureFormSource
// - hasProgrammaticDirtyChanges
// - suppressFormLevelIssues
// - configuredFeatureForm
// - formCtx
// - isDirty
// - isRequiredInPreflight
// - currentFormValue
//
// USER + RESOURCE DERIVATIONS
// - currentUser
// - currentContributorUser
// - currentAuthorizationUser
// - currentFeatureData
//
// PARENT RESOURCE STATE
// - organisationIdValue
// - projectIdValue
// - layerIdValue
// - hasSelectedLayer
// - selectedOrganisationById
// - selectedProjectById
// - selectedLayerById
// - isReplacingParentOrganisation
// - isReplacingParentProject
// - isReplacingParentLayer
// - selectedOrganisation
// - selectedProject
// - selectedLayer
// - organisationIssues
// - projectIssues
// - layerIssues
// - hiddenOrganisationInputAttrs
// - hiddenProjectInputAttrs
// - hiddenLayerInputAttrs
// - syncSelectedOrganisation
// - syncSelectedProject
// - syncSelectedLayer
// - applyFeatureParentSelection
// - featureParentSectionCtrl
// - getCreatableProjectRecords
//
// MAP STATE
// - featureCoordinates
// - initialMapCenter
//
// DESCRIPTOR STATE
// - title
//
// IMAGE + PRESENTATION STATE
// - isCanonicalImagePending
// - canonicalImageMeasuredAspectRatio
// - presentedCanonicalImageSrc
// - presentedCanonicalImageHref
// - presentedCanonicalImageTitle
// - featureVisualSectionCtrl
// - canonicalImageHref
// - canonicalImage
// - canonicalImageSrc
// - resolvedCanonicalImageAspectRatio
// - hasPresentedCanonicalImageSizing
// - featureImageProviderProps
// - featureImageProviderModel
//
// ISSUE STATE
// - visibleAllIssues
// - facetIssueState
// - facetIssueSummary
// - resolvedFacetTabsWithIssues
// - formLevelIssues
//
// FIELD + PROPERTY STATE
// - nonTranslatableItems
// - translatableSpecifierItems
// - featureDescriptorFieldConfigs
// - featureDescriptorTranslatableFields
// - commitFeatureState
// - commitSettledFeatureState
// - isCurrentRefLoaded
// - isCurrentRefSettled
// - refreshFeature
// - syncLayerBackedProperties
// - updateFeatureData
// - updatePropertyValue
// - updatePropertyI18nValue
// - togglePropertyI18nValueGen
//
// PROGRAMMATIC FORM SERIALIZATION
// - programmaticFeatureInputEntries
//
// TRANSLATION ACTIONS
// - onTranslateDescriptorLocale
// - onResetDescriptorLocale
// - onTranslateTranslatableValues
// - onResetTranslatableValues
//
// GEOMETRY + RESOURCE STATE TOGGLES
// - handleCoordinateChange
// - handleFeatureStateToggle
// - onPublishToggle
// - onDeleteToggle
//
// FORM ACTIONS
// - revalidateAfterProgrammaticChange
// - onSubmit
// - onReset
//
// HEADER WIRING
// - noopHeaderAction
// - header handler wiring
// - header status sync
//
// IMAGE EFFECTS
// - canonical image pending sync
// - canonical image ref sync
// - canonical image presentation sync
//
// PARENT RESOURCE EFFECTS
// - selected parent hydration
// - new-feature parent bootstrap
//
// VISUAL SECTION EFFECTS
// - visual section scroll wiring

/********************
 *  PAGE SETUP
 ************/

// § Context

const adminCtx = getAdminCtx()

// § Controllers

const headerCtrl = getHeaderCtrl()

// Build the shared editor controller once so route sync and header wiring stay consistent.
const facetTabs = getAdminFacetTabsForResource(FirstClassResource.feature)
const editorCtrl = getEditorCtrl({
  headerCtrl,
  icon: FeatureIcon,
  facetTabs,
})

const featureRef = $derived(page.params.feature as string)

// § i18n

const locales = $derived(getLocaleOrder(getLocaleKey()))
const localeKey = $derived(getLocaleKey())

// § Internal navigation

let lastSyncedFacetHash = $state('')
const activeFacet = $derived(
  adminCtx.activeFacet === false ? 'core' : adminCtx.activeFacet,
)
// Resolve the canonical facet order once so hash sync and step navigation use the same source.
const featureFacetOrder = $derived.by(() =>
  getAdminFacetOrderForResource(FirstClassResource.feature),
)

/********************
 *  INTERNAL NAVIGATION STATE
 ************/

const isCoreFacet = $derived(activeFacet === 'core')
const isFieldsFacet = $derived(activeFacet === 'fields')
const isAddressFacet = $derived(activeFacet === 'address')
const isImagesFacet = $derived(activeFacet === 'images')

/********************
 *  INTERNAL NAVIGATION ACTIONS
 ************/

function goToFacet(facet: FacetType): void {
  if (facet === 'fields' && !hasSelectedLayer) return
  if (facet === activeFacet) return
  const href = getUrlForResource(
    adminCtx,
    FirstClassResource.feature,
    featureRef,
    facet,
  )
  if (!href) return
  adminCtx.setFacet(facet, featureRef, FirstClassResource.feature)
  void goto(href, {
    noScroll: true,
    keepFocus: true,
    replaceState: false,
  })
}

const buildFacetNavAction = createFacetNavActionBuilder<FacetType>({
  resourceType: FirstClassResource.feature,
  getFacetOrder: () => featureFacetOrder,
  getActiveFacet: () => activeFacet as FacetType,
  navigateToFacet: goToFacet,
  isFacetDisabled: facet => facet === 'fields' && !hasSelectedLayer,
})

/********************
 *  INTERNAL NAVIGATION SYNC
 ************/

// Reflect URL hash changes back into admin facet state without echoing locally synced updates.
$effect(() => {
  const currentHash = page.url.hash
  if (currentHash === lastSyncedFacetHash) return
  lastSyncedFacetHash = currentHash
  syncAdminFacetFromHash({
    hash: currentHash,
    activeFacet,
    facetOrder: featureFacetOrder,
    adminCtx,
    resourceType: FirstClassResource.feature,
    resourceRef: featureRef,
  })
})

// Keep browser history/hash output in sync when facet state changes from in-app navigation.
bindAdminFacetHistorySync({
  getFacetOrder: () => featureFacetOrder,
  getActiveFacet: () => adminCtx.activeFacet as FacetType | false,
  adminCtx,
  resourceType: FirstClassResource.feature,
  getResourceRef: () => featureRef,
})

// Delegate feature-ref transitions to the shared editor controller so load/reset behavior stays centralized.
$effect(() => {
  const resolvedFacetTabsSnapshot = untrack(() => facetTabs)
  return editorCtrl.syncRouteAndLoad({
    ref: featureRef,
    resetFormActionsSignature: () => {
      lastFormActionsSignature = ''
      suppressFormLevelIssues = true
      settledFeatureRef = null
    },
    setFacetForRef: nextRef => {
      untrack(() => {
        const currentFacet = adminCtx.activeFacet
        const nextFacet =
          currentFacet && resolvedFacetTabsSnapshot.has(currentFacet)
            ? currentFacet
            : 'core'
        adminCtx.setFacet(nextFacet as never, nextRef, FirstClassResource.feature)
      })
    },
    load: refreshFeature,
    commit: commitSettledFeatureState,
  })
})

// Move focus into the active facet section after the active facet or form root changes.
$effect(() => {
  activeFacet
  contentsElement
  focusFacetFromHash(contentsElement, activeFacet)
})

// Rebuild the header facet model only when its visible signature changes.
$effect(() => {
  const resolvedFacets = resolveOptimisticHeaderFacets(
    isCurrentRefSettled,
    resolvedFacetTabsWithIssues,
    optimisticHeaderState,
  )
  const displayFacets = (
    Array.isArray(resolvedFacets)
      ? resolvedFacets
      : Array.from(resolvedFacets.entries()).map(([ref, config]) =>
          typeof config === 'string'
            ? { ref, label: config, icon: null, disabled: false }
            : {
                ref,
                label: config.label,
                icon: config.icon ?? null,
                hasIssues: config.hasIssues === true,
                disabled: false,
              },
        )
  ).map(facet => ({
    ...facet,
    disabled: facet.ref === 'fields' ? !hasSelectedLayer : Boolean(facet.disabled),
  }))
  const facetKey = displayFacets
    .map(
      facet =>
        `${facet.ref}:${facet.hasIssues === true ? '1' : '0'}:${facet.disabled === true ? '1' : '0'}`,
    )
    .join('|')
  const headerKey = `${featureRef}:${title}:${facetKey}`
  if (headerKey === lastHeaderKey) return
  lastHeaderKey = headerKey
  untrack(() => {
    headerCtrl.setHeaderForEntity(title, FeatureIcon, new Map())
    headerCtrl.setFacets(displayFacets)
  })
})

// After a failed submit, jump to the first facet with issues so validation errors are immediately visible.
$effect(() => {
  if (!formCtx.wasSubmitAttempted) return
  if (visibleAllIssues.length === 0) return
  const targetFacet = facetIssueSummary.firstFacetWithIssues
  if (!targetFacet) return
  if (activeFacet === targetFacet) return
  adminCtx.setFacet(targetFacet, featureRef, FirstClassResource.feature)
})

/********************
 *  UI STATE
 ************/

// § Variant

const isNewFeatureRef = $derived(featureRef === NEW_REF)

// § Header

let lastHeaderKey = ''
let lastFormActionsSignature = ''
// Preserve the last known header affordances while the next ref is still loading.
let optimisticHeaderState = $state<HeaderTransitionSnapshot>({
  canEdit: true,
  canPublish: true,
  showDeleteAction: true,
  showPublishAction: true,
  isPublished: false,
  isDeleted: false,
  facets: [],
})
const isEditing = $derived(headerCtrl.state.isEditing)

// § Sections

// Only keep the visual section mounted on facets that actually render it.
const showsVisualSection = $derived(isCoreFacet || isFieldsFacet)
let isVisualSectionCollapsed = $state(
  adminCtx.appCtx.getUserPreferences().admin?.isAdminMapCollapsed ?? false,
)
let visualSectionReopenScrollStartAt: number | null = null
let visualSectionReopenBufferTimeout: ReturnType<typeof setTimeout> | null = null
let visualSectionReopenSettleTimeout: ReturnType<typeof setTimeout> | null = null
let isVisualSectionReopenArmed = true

// § Elements

let contentsElement = $state<HTMLFormElement | undefined>()

/********************
 *  UI EFFECTS
 ************/

$effect(() => {
  featureRef
  optimisticHeaderState = captureHeaderTransitionSnapshot(headerCtrl)
})

$effect(() => {
  const isImageFacetActive = isImagesFacet
  const status = resolveOptimisticHeaderStatus({
    isSettled: isCurrentRefSettled,
    isImageFacetActive,
    isNewRef: isNewFeatureRef,
    dirty: isDirty,
    isSubmitting: formCtx.submitting,
    hasIssues: visibleAllIssues.length > 0,
    isPublished: Boolean(feature?.data?.isPublished),
    isDeleted: Boolean(feature?.data?.isArchived),
    canEdit: true,
    canPublish: true,
    showDeleteAction: !isNewFeatureRef,
    showPublishAction: !isNewFeatureRef,
    snapshot: optimisticHeaderState,
  })
  const inertActionOverrides =
    isCurrentRefSettled && !isImageFacetActive
      ? {}
      : {
          onEditingToggle: noopHeaderAction,
          onReset: noopHeaderAction,
          onSave: noopHeaderAction,
          onDeleteToggle: noopHeaderAction,
          onPublishToggle: noopHeaderAction,
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

/********************
 *  RESOURCE STATE
 ************/

let feature = $state<FeaturePageState>(null)
let committedFeature = $state<FeaturePageState>(null)
let settledFeatureRef = $state<string | null>(null)

/********************
 *  SET NAVIGATION STATE
 ************/

const featureList = $derived(adminCtx.appCtx.state.resources.feature ?? [])
const currentFeatureId = $derived(feature?.data?.id ?? null)
const featureStepperRefs = $derived(
  getAdjacentResourceRefs(featureList, currentFeatureId),
)
const previousFeatureRef = $derived(featureStepperRefs.previousRef)
const nextFeatureRef = $derived(featureStepperRefs.nextRef)

/********************
 *  ON MOUNT
 ************/

onMount(() => {
  untrack(() => {
    editorCtrl.wireHeaderHandlers({
      reset: onReset,
      submit: onSubmit,
      togglePublish: onPublishToggle,
      toggleDelete: onDeleteToggle,
    })
  })
})

$effect(() => {
  if (activeFacet !== 'fields') return
  if (hasSelectedLayer) return
  untrack(() => {
    adminCtx.setFacet('core', featureRef, FirstClassResource.feature)
  })
})

$effect(() => {
  if (!isNewFeatureRef) return
  if (!organisationIdValue || projectIdValue) return

  let cancelled = false
  void getCreatableProjectRecords({
    organisationIds: [organisationIdValue],
  }).then(projects => {
    if (cancelled || projectIdValue) return
    if (projects.length !== 1) return

    const project = toParentProjectItem(projects[0])
    if (!project) return
    onReplaceParentProject(project)
  })

  return () => {
    cancelled = true
  }
})

$effect(() => {
  if (!isNewFeatureRef) return
  if (!projectIdValue || layerIdValue) return

  let cancelled = false
  void getLayers({
    q: '',
    prisms: createFeatureParentSearchPrisms({
      organisationIds: organisationIdValue ? [organisationIdValue] : [],
      projectIds: [projectIdValue],
    }),
    conditions: { isArchived: false, isPublished: null },
    meta: { isAdminRequest: true, profile: 'admin' as const },
  }).then(result => {
    if (cancelled || layerIdValue) return

    const layers = (result.data ?? [])
      .map(item => toParentLayerItem(item as never))
      .filter(Boolean) as ParentSectionLayerItem[]

    if (layers.length !== 1) return
    onReplaceParentLayer(layers[0])
  })

  return () => {
    cancelled = true
  }
})

/********************
 *  FORM STATE
 ************/

let hasProgrammaticDirtyChanges = $state(false)
let suppressFormLevelIssues = $state(false)
const initialEmptyFeatureFormSeed = toEmptyFeatureFormInput()
let emptyFeatureFormSeed = $state<FeatureFormInput>(initialEmptyFeatureFormSeed)
let featureFormSource = $state<FeatureFormInput>(initialEmptyFeatureFormSeed)

const configuredFeatureForm = configureForm(() => ({
  form: featureForm as never,
  onsubmit: (({ data }: { data: FeatureFormInput }) => {
    // Stamp create/update submit metadata late so the payload always matches the active ref.
    const submittedPayload = prepareSubmitPayloadMeta(data, {
      defaultMode: isNewFeatureRef ? 'create' : 'update',
      resolveUpdateId: () => feature?.data?.id ?? committedFeature?.data?.id ?? '',
    })
    return submittedPayload as typeof data
  }) as never,
  ...createResourceFormConfig({
    formEl: contentsElement,
    key: featureRef,
    schema: FeaturePreflightFormData as never,
    data: featureFormSource,
    submitUpdates: async () => {
      // Refresh the list after every submit and prepend the entity query when editing an existing feature.
      const updates: Array<RemoteQuery<unknown> | RemoteQueryOverride> = [
        getFeatures({
          conditions: adminCtx.appCtx.isSuperAdmin()
            ? { isArchived: null, isPublished: null }
            : { isArchived: false, isPublished: null },
          prisms: adminCtx.appCtx.state.prisms,
          meta: { isAdminRequest: true, profile: 'card' },
        }),
      ]

      if (!isNewFeatureRef) {
        updates.unshift(
          getFeature({
            ref: featureRef,
            refKey: 'id',
            meta: { isAdminRequest: true, profile: 'admin' },
          }),
        )
      }

      return updates
    },
    adminCtx,
    headerCtrl,
    resourceType: FirstClassResource.feature,
    getEntity: () => feature,
    refreshResource: async () => {
      await refreshFeature()
    },
  }),
  onissues: ({ issues }) => {
    console.error('[feature-editor] preflight invalidation', {
      featureRef,
      issues: issues.map(issue => ({
        path: issue.path,
        message: issue.message,
      })),
    })
  },
}))
const formCtx = $derived(configuredFeatureForm())
const isDirty = $derived(Boolean(formCtx.dirty || hasProgrammaticDirtyChanges))
const isRequiredInPreflight = createSchemaRequiredInferer(() => featureFormSource)
const currentFormValue = $derived(formCtx.form.fields.value() as FeatureFormInput)
const currentFeatureData = $derived(currentFormValue?.data ?? emptyFeatureFormSeed.data)

// Hide form-level issues during programmatic resets so transient invalid states do not flash.
const visibleAllIssues = $derived.by((): unknown[] =>
  suppressFormLevelIssues ? [] : (formCtx.allIssues ?? []),
)
// Derive both the first bad facet and the decorated facet tabs from the same issue snapshot.
const facetIssueState = $derived.by(() =>
  resolveFacetTabsWithIssues({
    issues: visibleAllIssues,
    facets: facetTabs,
    formEl: contentsElement,
  }),
)
const facetIssueSummary = $derived(facetIssueState.facetIssueSummary)
const resolvedFacetTabsWithIssues = $derived(facetIssueState.facetTabsWithIssues)
const formLevelIssues = $derived.by((): string[] =>
  toFormLevelIssueMessages(visibleAllIssues),
)

/********************
 *  FORM STATE : EFFECTS
 ************/

$effect(() => {
  if (!isNewFeatureRef) return
  const nextSeed = toEmptyFeatureFormInput()
  nextSeed.data.contributorId = currentUser?.id ?? null
  emptyFeatureFormSeed = nextSeed
  featureFormSource = nextSeed
})

/********************
 *  SECTION : CORE STATE
 ************/

let selectedOrganisationById = $state<Record<string, ParentSectionOrganisationItem>>({})
let selectedProjectById = $state<Record<string, ParentSectionProjectItem>>({})
let selectedLayerById = $state<Record<string, ParentSectionLayerItem>>({})

let isReplacingParentOrganisation = $state(false)
let isReplacingParentProject = $state(false)
let isReplacingParentLayer = $state(false)

const organisationIdValue = $derived(String(currentFeatureData.organisationId ?? ''))
const projectIdValue = $derived(String(currentFeatureData.projectId ?? ''))
const layerIdValue = $derived(String(currentFeatureData.layerId ?? ''))
const hasSelectedLayer = $derived(layerIdValue.trim().length > 0)

// Resolve the currently selected hydrated parent records from the local caches keyed by form ids.
const selectedOrganisation = $derived.by(() => {
  if (!organisationIdValue) return null
  return selectedOrganisationById[organisationIdValue] ?? null
})
const selectedProject = $derived.by(() => {
  if (!projectIdValue) return null
  return selectedProjectById[projectIdValue] ?? null
})
const selectedLayer = $derived.by(() => {
  if (!layerIdValue) return null
  return selectedLayerById[layerIdValue] ?? null
})

// Fall back to the new-feature coordinates until the form geometry becomes valid.
const featureCoordinates = $derived(
  getCoordinates(
    ((currentFeatureData.geometry as Point)?.coordinates ??
      DEFAULT_NEW_FEATURE_COORDINATES) as [number, number],
  ),
)
const title = $derived(
  currentFeatureData.i18n?.[localeKey]?.title ||
    feature?.data?.i18n?.[localeKey]?.title ||
    NEW_TITLE,
)

const featureDescriptorFieldConfigs = [
  { key: 'title', label: m.feature__title(), kind: 'input' },
  { key: 'description', label: m.feature__description(), kind: 'textarea' },
] as const
const featureDescriptorTranslatableFields = ['title', 'description'] as const

/********************
 *  SECTION : CORE ISSUES
 ************/

const organisationIssues = $derived(
  getIssueMessagesForPath(visibleAllIssues, ['data', 'organisationId']),
)
const projectIssues = $derived(
  getIssueMessagesForPath(visibleAllIssues, ['data', 'projectId']),
)
const layerIssues = $derived(
  getIssueMessagesForPath(visibleAllIssues, ['data', 'layerId']),
)

/********************
 *  SECTION : CORE FLAGS
 ************/

async function handleFeatureStateToggle(
  field: 'isPublished' | 'isArchived',
): Promise<void> {
  if (!isCurrentRefLoaded) return
  const current = feature?.data
  if (!current) return
  const nextState = !current[field]
  const mutate = field === 'isPublished' ? publishFeature : archiveFeature
  const setBusy =
    field === 'isPublished'
      ? (value: boolean) => headerCtrl.setPublishing(value)
      : (value: boolean) => headerCtrl.setDeleting(value)

  try {
    setBusy(true)
    await mutate({
      id: current.id,
      state: nextState,
      meta: { isAdminRequest: true },
    }).updates(
      getFeature({
        ref: current.id,
        refKey: 'id',
        meta: { isAdminRequest: true, profile: 'admin' },
      }).withOverride(overrideResourceEntityBoolean(field, nextState)),
      getFeatures({
        conditions: adminCtx.appCtx.isSuperAdmin()
          ? { isArchived: null, isPublished: null }
          : { isArchived: false, isPublished: null },
        prisms: adminCtx.appCtx.state.prisms,
        meta: { isAdminRequest: true, profile: 'card' },
      }).withOverride(overrideResourceListItemBoolean(current.id, field, nextState)),
    )

    await refreshFeature()
    toast.success(
      `${
        field === 'isPublished'
          ? nextState
            ? m.published()
            : m.forms__unpublished()
          : nextState
            ? m.forms__delete()
            : m.forms__restored()
      } ${getNameForToast(feature, 'title')}`,
    )
  } catch {
    toast.error(m.long_crazy_peacock_care())
  } finally {
    setBusy(false)
  }
}

function onPublishToggle(): void {
  void handleFeatureStateToggle('isPublished')
}

function onDeleteToggle(): void {
  void handleFeatureStateToggle('isArchived')
}

/********************
 *  SECTION : CORE I18N
 ************/

async function onTranslateDescriptorLocale(
  sourceLocale: Locale,
  targetLocale: Locale,
): Promise<boolean> {
  const targetLocaleKey = toLocaleKey(targetLocale)
  const fieldsToTranslate = featureDescriptorTranslatableFields.filter(field => {
    const currentValue = currentFeatureData.i18n?.[targetLocaleKey]?.[field] ?? ''
    return currentValue.trim().length === 0
  })
  if (fieldsToTranslate.length === 0) return false

  const translated = await translateI18nFields({
    source: sourceLocale,
    target: targetLocale,
    fields: [...fieldsToTranslate],
    i18n: {
      en: Object.fromEntries(
        fieldsToTranslate.map(field => [
          field,
          currentFeatureData.i18n?.en?.[field] ?? '',
        ]),
      ),
      'zh-hans': Object.fromEntries(
        fieldsToTranslate.map(field => [
          field,
          currentFeatureData.i18n?.zhHans?.[field] ?? '',
        ]),
      ),
      'zh-hant': Object.fromEntries(
        fieldsToTranslate.map(field => [
          field,
          currentFeatureData.i18n?.zhHant?.[field] ?? '',
        ]),
      ),
    },
  })

  updateFeatureData(
    data => ({
      ...data,
      i18n: {
        ...data.i18n,
        [targetLocaleKey]: {
          ...data.i18n[targetLocaleKey],
          ...Object.fromEntries(
            fieldsToTranslate.map(field => [field, translated[field] ?? '']),
          ),
          ...Object.fromEntries(
            fieldsToTranslate.map(field => [
              `${field}Gen`,
              Boolean((translated[field] ?? '').trim()),
            ]),
          ),
        },
      },
    }),
    { revalidate: true },
  )
  return true
}

function onResetDescriptorLocale(targetLocale: Locale): void {
  const targetLocaleKey = toLocaleKey(targetLocale)
  updateFeatureData(
    data => ({
      ...data,
      i18n: {
        ...data.i18n,
        [targetLocaleKey]: {
          ...data.i18n[targetLocaleKey],
          title: '',
          titleGen: false,
          description: '',
          descriptionGen: false,
        },
      },
    }),
    { revalidate: true },
  )
}

async function onTranslateTranslatableValues(
  sourceLocale: Locale,
  targetLocale: Locale,
): Promise<boolean> {
  const targetLocaleKey = toLocaleKey(targetLocale)
  const propertyIds = translatableSpecifierItems
    .filter(property => {
      const currentValue = property.i18n?.[targetLocaleKey]?.value ?? ''
      return currentValue.trim().length === 0
    })
    .map(property => property.propertyId)

  if (propertyIds.length === 0) return false

  const i18nPayload = {
    en: Object.fromEntries(
      propertyIds.map(propertyId => [
        propertyId,
        translatableSpecifierItems.find(property => property.propertyId === propertyId)
          ?.i18n?.en?.value ?? '',
      ]),
    ),
    'zh-hans': Object.fromEntries(
      propertyIds.map(propertyId => [
        propertyId,
        translatableSpecifierItems.find(property => property.propertyId === propertyId)
          ?.i18n?.zhHans?.value ?? '',
      ]),
    ),
    'zh-hant': Object.fromEntries(
      propertyIds.map(propertyId => [
        propertyId,
        translatableSpecifierItems.find(property => property.propertyId === propertyId)
          ?.i18n?.zhHant?.value ?? '',
      ]),
    ),
  }

  const translated = await translateI18nFields({
    source: sourceLocale,
    target: targetLocale,
    fields: propertyIds,
    i18n: i18nPayload,
  })

  for (const propertyId of propertyIds) {
    const nextValue = translated[propertyId] ?? ''
    updatePropertyI18nValue(
      propertyId,
      targetLocaleKey,
      nextValue,
      nextValue.trim().length > 0,
    )
  }
  revalidateAfterProgrammaticChange()
  return true
}

function onResetTranslatableValues(targetLocale: Locale): void {
  const targetLocaleKey = toLocaleKey(targetLocale)
  for (const property of translatableSpecifierItems) {
    updatePropertyI18nValue(property.propertyId, targetLocaleKey, '', false)
  }
  revalidateAfterProgrammaticChange()
}

/********************
 *  SECTION : CORE HIDDEN INPUTS
 ************/

// Mirror parent ids into hidden controls so replacement flows keep submitting the current selection.
const hiddenOrganisationInputAttrs = $derived.by(() => {
  if (!organisationIdValue) return null
  return formCtx.form.fields.data.organisationId.as('hidden', organisationIdValue)
})
const hiddenProjectInputAttrs = $derived.by(() => {
  if (!projectIdValue) return null
  return formCtx.form.fields.data.projectId.as('hidden', projectIdValue)
})
const hiddenLayerInputAttrs = $derived.by(() => {
  if (!layerIdValue) return null
  return formCtx.form.fields.data.layerId.as('hidden', layerIdValue)
})

/********************
 *  USER STATE
 ************/

const currentUser = $derived(adminCtx.appCtx.user ?? null)
const currentContributorUser = $derived(toCurrentContributorUser(currentUser))
const currentAuthorizationUser = $derived(toCurrentAuthorizationUser(currentUser))

/********************
 *  MAP STATE
 ************/

const initialMapCenter = $derived(getUserLocationCoordinates(adminCtx.appCtx))

/********************
 *  MAP MUTATION
 ************/

function handleCoordinateChange(nextCoordinates: number[]): void {
  updateFeatureData(
    data => ({
      ...data,
      geometry: {
        ...(data.geometry as Point),
        type: 'Point',
        coordinates: nextCoordinates,
      },
    }),
    { revalidate: true },
  )
}

/********************
 *  IMAGE STATE
 ************/

let isCanonicalImagePending = $state(false)
let canonicalImageMeasuredAspectRatio = $state<number | null>(null)
let presentedCanonicalImageSrc = $state<string | null>(null)
let presentedCanonicalImageHref = $state<string | undefined>(undefined)
let presentedCanonicalImageTitle = $state(NEW_TITLE)
const featureVisualSectionCtrl = createFeatureVisualSectionController({
  adminCtx,
  getActiveFacet: () => activeFacet,
  getShowsVisualSection: () => showsVisualSection,
  getPreviousFeatureRef: () => previousFeatureRef,
  getNextFeatureRef: () => nextFeatureRef,
  getIsVisualSectionCollapsed: () => isVisualSectionCollapsed,
  setIsVisualSectionCollapsed: value => {
    isVisualSectionCollapsed = value
  },
  getVisualSectionReopenScrollStartAt: () => visualSectionReopenScrollStartAt,
  setVisualSectionReopenScrollStartAt: value => {
    visualSectionReopenScrollStartAt = value
  },
  getVisualSectionReopenBufferTimeout: () => visualSectionReopenBufferTimeout,
  setVisualSectionReopenBufferTimeout: value => {
    visualSectionReopenBufferTimeout = value
  },
  getVisualSectionReopenSettleTimeout: () => visualSectionReopenSettleTimeout,
  setVisualSectionReopenSettleTimeout: value => {
    visualSectionReopenSettleTimeout = value
  },
  getIsVisualSectionReopenArmed: () => isVisualSectionReopenArmed,
  setIsVisualSectionReopenArmed: value => {
    isVisualSectionReopenArmed = value
  },
  getContentsElement: () => contentsElement,
  setCanonicalImageMeasuredAspectRatio: value => {
    canonicalImageMeasuredAspectRatio = value
  },
})
const {
  clearVisualSectionReopenState,
  collapseVisualSectionAndScrollToTop,
  expandVisualSection,
  handleCanonicalImageLoad,
  handleFeatureStepperNavigation,
  syncVisualSectionWithScrollPosition,
  syncVisualSectionWithWheelIntent,
} = featureVisualSectionCtrl

// Keep visual-section routing and presentation URLs derived from the currently committed feature image.
const canonicalImageHref = $derived(
  getFeatureImagesFacetHref(adminCtx, feature?.data?.id as Id | null | undefined),
)
const canonicalImage = $derived.by(() => {
  const primaryImage = (feature?.data?.image as ImageCtxEnvelope | null) ?? null
  if (primaryImage) return primaryImage

  const fallbackImage = Array.isArray(feature?.data?.images)
    ? ((feature?.data?.images[0] as ImageCtxEnvelope | null | undefined) ?? null)
    : null

  return fallbackImage
})
const canonicalImageSrc = $derived(getSafeImageUrl(canonicalImage))
const resolvedCanonicalImageAspectRatio = $derived(
  canonicalImageMeasuredAspectRatio ?? 1,
)
const hasPresentedCanonicalImageSizing = $derived(
  Boolean(presentedCanonicalImageSrc && canonicalImageMeasuredAspectRatio != null),
)

// Build image-provider context from the resolved parent hierarchy so gallery actions target the right feature.
const featureImageProviderProps = $derived.by(() => {
  const featureData = feature?.data
  const organisation =
    selectedOrganisation ??
    adminCtx.appCtx.state.resources.organisation?.find(
      item => item.id === organisationIdValue,
    ) ??
    null
  const project =
    selectedProject ??
    adminCtx.appCtx.state.resources.project?.find(item => item.id === projectIdValue) ??
    null

  return getFeatureImageProviderOptions({
    featureRef,
    isNewFeatureRef,
    feature: featureData,
    organisation,
    project,
  })
})

const featureImageProviderModel = useImageProviderModel(
  () => page,
  () => featureImageProviderProps,
)

/********************
 *  IMAGE : EFFECTS
 ************/

$effect(() => {
  canonicalImageSrc
  isCanonicalImagePending = Boolean(presentedCanonicalImageSrc)

  // Keep the last confirmed ratio while a replacement image is loading.
  if (!presentedCanonicalImageSrc) {
    canonicalImageMeasuredAspectRatio = null
  }
})

$effect(() => {
  featureRef
  if (presentedCanonicalImageSrc) {
    isCanonicalImagePending = true
  }
})

$effect(() => {
  const nextSrc = canonicalImageSrc
  const nextHref = canonicalImageHref
  const nextTitle = title

  if (!nextSrc) {
    if (isCurrentRefSettled) {
      presentedCanonicalImageSrc = null
      presentedCanonicalImageHref = nextHref
      presentedCanonicalImageTitle = nextTitle
      isCanonicalImagePending = false
      canonicalImageMeasuredAspectRatio = null
    }
    return
  }

  if (nextSrc === presentedCanonicalImageSrc) {
    presentedCanonicalImageHref = nextHref
    presentedCanonicalImageTitle = nextTitle
    isCanonicalImagePending = false
    return
  }

  let cancelled = false
  const image = new Image()

  // Show the resolved image source immediately and keep it in a pending visual
  // state while the browser finishes loading/measuring the asset.
  presentedCanonicalImageSrc = nextSrc
  presentedCanonicalImageHref = nextHref
  presentedCanonicalImageTitle = nextTitle
  isCanonicalImagePending = true

  image.onload = () => {
    if (cancelled) return
    isCanonicalImagePending = false
    handleCanonicalImageLoad({
      width: image.naturalWidth,
      height: image.naturalHeight,
    })
  }

  image.onerror = () => {
    if (cancelled) return
    isCanonicalImagePending = false
  }

  image.src = nextSrc

  return () => {
    cancelled = true
  }
})

/********************
 *  SECTION : FIELDS STATE
 ************/

const nonTranslatableItems = $derived(
  getNonTranslatableFeatureFieldItems({
    properties: currentFeatureData.properties,
    localeKey,
    isEditing,
    onChange: updatePropertyValue,
  }),
)

const translatableSpecifierItems = $derived(
  getTranslatableSpecifierProperties(currentFeatureData.properties),
)

/********************
 *  SECTION :: FIELDS MUTATION
 ************/

function updatePropertyValue(propertyId: string, nextValue: string | boolean): void {
  updateFeatureData(data => ({
    ...data,
    properties: (data.properties ?? []).map(property =>
      property.propertyId === propertyId
        ? {
            ...property,
            value:
              typeof nextValue === 'boolean' ? String(nextValue) : String(nextValue),
            propertyValueId:
              property.property?.component === 'SelectField'
                ? String(nextValue)
                : property.propertyValueId,
          }
        : property,
    ),
  }))
}

function updatePropertyI18nValue(
  propertyId: string,
  locale: keyof FeatureFormInput['data']['i18n'],
  nextValue: string,
  valueGen: boolean = false,
): void {
  updateFeatureData(data => ({
    ...data,
    properties: (data.properties ?? []).map(property =>
      property.propertyId === propertyId
        ? {
            ...property,
            i18n: {
              en: property.i18n?.en ?? { value: '', valueGen: false },
              zhHans: property.i18n?.zhHans ?? { value: '', valueGen: false },
              zhHant: property.i18n?.zhHant ?? { value: '', valueGen: false },
              ...(property.i18n ?? {}),
              [locale]: {
                value: nextValue,
                valueGen,
              },
            },
          }
        : property,
    ),
  }))
}

function togglePropertyI18nValueGen(
  propertyId: string,
  locale: keyof FeatureFormInput['data']['i18n'],
): void {
  const currentProperty = currentFeatureData.properties?.find(
    property => property.propertyId === propertyId,
  )

  updatePropertyI18nValue(
    propertyId,
    locale,
    currentProperty?.i18n?.[locale]?.value ?? '',
    !currentProperty?.i18n?.[locale]?.valueGen,
  )
}

/**
 * Refreshes layer-backed feature properties for the current layer selection.
 *
 * @param layerId Selected layer id, if any.
 * @returns A promise that resolves after property state is synchronized.
 */
async function syncLayerBackedProperties(
  layerId: string | null | undefined,
): Promise<void> {
  const resolvedLayerId = layerId?.trim() ?? ''

  if (!resolvedLayerId) {
    updateFeatureData(data => {
      if ((data.properties ?? []).length === 0) return data
      return {
        ...data,
        properties: [],
      }
    })
    return
  }

  try {
    // Fetch the authoritative layer definition before rebuilding derived feature properties.
    const result = await getLayer({
      ref: resolvedLayerId,
      refKey: 'id',
      meta: { isAdminRequest: true, profile: 'admin' },
    })
    const layer = (result?.data ?? null) as Layer | null
    syncSelectedLayer(toParentLayerItem(layer as never))
    updateFeatureData(data => ({
      ...data,
      properties: toLayerBackedFeatureProperties(layer, data.properties),
    }))
  } catch {
    updateFeatureData(data => {
      if ((data.properties ?? []).length === 0) return data
      return {
        ...data,
        properties: [],
      }
    })
  }
}

/********************
 *  FORM MUTATION
 ************/

/**
 * Applies a programmatic form-data mutation and optionally revalidates issues.
 *
 * @param mutator Pure function that returns the next feature form data.
 * @param options Optional revalidation behavior.
 */
function updateFeatureData(
  mutator: (data: FeatureFormInput['data']) => FeatureFormInput['data'],
  options: { revalidate?: boolean } = {},
): void {
  updateFormData(formCtx.form, data => mutator(data as FeatureFormInput['data']))
  hasProgrammaticDirtyChanges = true
  if (options.revalidate) revalidateAfterProgrammaticChange()
}

/********************
 *  FORM SUBMISSION STATE
 ************/

function commitFeatureState(value: FeaturePageState): void {
  committedFeature = value
  feature = value
}

// Mark the ref as settled only after the loaded feature state has been committed.
function commitSettledFeatureState(value: FeaturePageState): void {
  commitFeatureState(value)
  settledFeatureRef = value?.data?.id ?? null
}

/********************
 *  FORM SUBMISSION ACTION
 ************/

function onSubmit(): void {
  suppressFormLevelIssues = false
  if (!isCurrentRefLoaded) return
  formCtx.requestSubmit({
    meta: {
      ...(currentFormValue.meta ?? {}),
      mode: isNewFeatureRef ? 'create' : 'update',
      isAdminRequest: true,
    },
  })
}

/********************
 *  FORM SUBMISSION GUARD
 ************/

const isCurrentRefLoaded = $derived.by(() => {
  if (isNewFeatureRef) return true
  return feature?.data?.id === featureRef && committedFeature?.data?.id === featureRef
})

const isCurrentRefSettled = $derived(
  isNewFeatureRef || settledFeatureRef === featureRef,
)

/********************
 *  FORM RESET
 ************/

function onReset(): void {
  suppressFormLevelIssues = true
  const emptyResetValue = toEmptyFeatureFormInput()
  const resetValue = committedFeature?.data
    ? toFeatureFormInput(committedFeature.data)
    : {
        ...emptyResetValue,
        data: {
          ...emptyResetValue.data,
          contributorId: currentUser?.id ?? null,
        },
      }
  featureFormSource = resetValue
  hasProgrammaticDirtyChanges = false
  formCtx.reset(resetValue)
}

/********************
 *  PROGRAMMATIC FORM
 ************/

// Serialize non-native feature fields into hidden inputs before remote form submission.
const programmaticFeatureInputEntries = $derived(
  getProgrammaticFeatureInputEntries(currentFeatureData),
)

function revalidateAfterProgrammaticChange(): void {
  revalidateAfterSubmitAttempt({
    wasSubmitAttempted: formCtx.wasSubmitAttempted,
    validate: formCtx.validate,
  })
}

/********************
 *  SEARCH : PARENTS
 ************/

async function refreshFeature(ref: string = featureRef): Promise<FeatureGetState> {
  if (ref === NEW_REF) {
    const emptyState: FeatureGetState = null
    commitSettledFeatureState(emptyState)
    featureFormSource = emptyFeatureFormSeed
    hasProgrammaticDirtyChanges = false
    return emptyState
  }

  const result = (await getFeature({
    ref,
    refKey: 'id',
    meta: { isAdminRequest: true, profile: 'admin' },
  }).catch(() => null)) as FeatureGetState

  commitSettledFeatureState(result)
  if (result?.data) {
    const nextFormSource = toFeatureFormInput(result.data)
    featureFormSource = nextFormSource
    hasProgrammaticDirtyChanges = false
    adminCtx.appCtx.setFeatureById(result.data as never)
  }
  return result
}

/**
 * Caches the hydrated organisation record for the current parent-selection UI.
 *
 * @param organisation Normalized organisation item from a search or fetch result.
 */
function syncSelectedOrganisation(
  organisation: ParentSectionOrganisationItem | null | undefined,
): void {
  if (!organisation?.id) return
  selectedOrganisationById = {
    ...selectedOrganisationById,
    [organisation.id]: organisation,
  }
}

/**
 * Caches the hydrated project record for the current parent-selection UI.
 *
 * @param project Normalized project item from a search or fetch result.
 */
function syncSelectedProject(
  project: ParentSectionProjectItem | null | undefined,
): void {
  if (!project?.id) return
  selectedProjectById = {
    ...selectedProjectById,
    [project.id]: project,
  }
}

/**
 * Caches the hydrated layer record for the current parent-selection UI.
 *
 * @param layer Normalized layer item from a search or fetch result.
 */
function syncSelectedLayer(layer: ParentSectionLayerItem | null | undefined): void {
  if (!layer?.id) return
  selectedLayerById = {
    ...selectedLayerById,
    [layer.id]: layer,
  }
}

/**
 * Applies the selected parent ids into form state and refreshes any layer-backed
 * feature properties derived from the resulting layer.
 *
 * @param params Selected organisation/project/layer ids.
 */
function applyFeatureParentSelection(params: {
  organisationId?: string
  projectId?: string
  layerId?: string
}): void {
  const nextLayerId = params.layerId ?? ''
  // Commit the parent-id trio together so downstream derived state sees one coherent selection.
  updateFeatureData(
    data => ({
      ...data,
      organisationId: params.organisationId ?? '',
      projectId: params.projectId ?? '',
      layerId: nextLayerId,
    }),
    { revalidate: true },
  )
  void syncLayerBackedProperties(nextLayerId)
}

/********************
 *  SEARCH : PARENTS : EFFECTS
 ************/

$effect(() => {
  const id = organisationIdValue
  if (!id || selectedOrganisationById[id]) return
  let cancelled = false
  void adminCtx.appCtx.getOrganisationById(id).then(organisation => {
    if (cancelled) return
    syncSelectedOrganisation(toParentOrganisationItem(organisation as never))
  })
  return () => {
    cancelled = true
  }
})

$effect(() => {
  const id = projectIdValue
  if (!id || selectedProjectById[id]) return
  let cancelled = false
  void adminCtx.appCtx.getProjectById(id).then(project => {
    if (cancelled) return
    syncSelectedProject(toParentProjectItem(project as never))
  })
  return () => {
    cancelled = true
  }
})

$effect(() => {
  const id = layerIdValue
  if (!id || selectedLayerById[id]) return
  let cancelled = false
  void adminCtx.appCtx.getLayerById(id).then(layer => {
    if (cancelled) return
    syncSelectedLayer(toParentLayerItem(layer as never))
  })
  return () => {
    cancelled = true
  }
})

$effect(() => {
  if (!isNewFeatureRef) return
  if (organisationIdValue || projectIdValue) return

  let cancelled = false
  void getCreatableProjectRecords().then(async projects => {
    if (cancelled || organisationIdValue || projectIdValue) return

    if (projects.length === 1) {
      const project = toParentProjectItem(projects[0])
      if (project) onReplaceParentProject(project)
      return
    }

    const organisationIds = Array.from(
      new Set(
        projects
          .map(project => project.organisationId)
          .filter(
            (organisationId): organisationId is string =>
              typeof organisationId === 'string' && organisationId.trim().length > 0,
          ),
      ),
    )

    if (organisationIds.length !== 1) return

    const organisation = await adminCtx.appCtx.getOrganisationById(organisationIds[0])
    if (cancelled || organisationIdValue || projectIdValue) return
    const item = toParentOrganisationItem(organisation as never)
    if (!item) return
    onReplaceParentOrganisation(item)
  })

  return () => {
    cancelled = true
  }
})

/********************
 *  PARENT RESOURCE ACTIONS
 ************/

const featureParentSectionCtrl = createFeatureParentSectionController({
  getCreatableProjectRecords,
  searchParentOrganisations: async ({ query, organisationIds }) =>
    (
      await getOrganisationsWhichHaveLayers({
        q: query,
        prisms: createFeatureParentSearchPrisms(),
        conditions: {
          id: organisationIds,
          isArchived: false,
          isPublished: null,
        },
        meta: { isAdminRequest: true, profile: 'admin' as const },
      })
    ).data ?? [],
  searchParentLayers: async ({ query, organisationIds = [], projectIds = [] }) =>
    (
      await getLayers({
        q: query,
        prisms: createFeatureParentSearchPrisms({
          organisationIds,
          projectIds,
        }),
        conditions: { isArchived: false, isPublished: null },
        meta: { isAdminRequest: true, profile: 'admin' as const },
      })
    ).data ?? [],
  syncSelectedOrganisation,
  syncSelectedProject,
  syncSelectedLayer,
  getSelectedOrganisation: () => selectedOrganisation,
  getSelectedProject: () => selectedProject,
  getSelectedLayer: () => selectedLayer,
  getOrganisationIdValue: () => organisationIdValue,
  getProjectIdValue: () => projectIdValue,
  getLayerIdValue: () => layerIdValue,
  getIsReplacingParentProject: () => isReplacingParentProject,
  getIsReplacingParentLayer: () => isReplacingParentLayer,
  setIsReplacingParentOrganisation: value => {
    isReplacingParentOrganisation = value
  },
  setIsReplacingParentProject: value => {
    isReplacingParentProject = value
  },
  setIsReplacingParentLayer: value => {
    isReplacingParentLayer = value
  },
  applyFeatureParentSelection,
})
const {
  beginReplaceParentLayer,
  beginReplaceParentOrganisation,
  beginReplaceParentProject,
  cancelReplaceParentLayer,
  cancelReplaceParentOrganisation,
  cancelReplaceParentProject,
  onRemoveParentLayer,
  onRemoveParentOrganisation,
  onRemoveParentProject,
  onReplaceParentLayer,
  onReplaceParentOrganisation,
  onReplaceParentProject,
  onSearchParentLayers,
  onSearchParentOrganisations,
  onSearchParentProjects,
  resetFeatureParents,
} = featureParentSectionCtrl

/**
 * Loads projects that currently support feature creation within the requested scope.
 *
 * @param params Optional query text and organisation filters.
 * @returns Creatable project records filtered by authorization.
 */
async function getCreatableProjectRecords(
  params: { query?: string; organisationIds?: string[] } = {},
): Promise<ParentProjectRecord[]> {
  const result = await getProjectsWhichHaveLayers({
    q: params.query ?? '',
    prisms: createFeatureParentSearchPrisms({
      organisationIds: params.organisationIds ?? [],
    }),
    conditions: { isArchived: false, isPublished: null },
    meta: { isAdminRequest: true, profile: 'admin' as const },
  })

  return (result.data ?? []).filter(project =>
    canCreateFeatureForProject({
      user: {
        id: currentAuthorizationUser?.id,
        isAnonymous: currentAuthorizationUser?.isAnonymous,
        superAdmin: currentAuthorizationUser?.superAdmin,
      },
      userRoles: currentAuthorizationUser?.roles ?? [],
      resource: {
        organisationId: project.organisationId,
        projectId: project.id,
        layerId: '',
        resourceHubId: project.hubId ?? null,
      },
    }),
  ) as ParentProjectRecord[]
}

/********************
 *  SCROLL EFFECTS
 ************/

$effect(() => {
  showsVisualSection
  activeFacet

  if (!showsVisualSection) {
    clearVisualSectionReopenState()
    return
  }

  let activeSection: HTMLElement | null = null

  const bindScrollTarget = (): void => {
    activeSection?.removeEventListener('scroll', syncVisualSectionWithScrollPosition)
    activeSection?.removeEventListener('wheel', syncVisualSectionWithWheelIntent)
    activeSection = document.querySelector<HTMLElement>(
      `[data-facet-id="${activeFacet}"]`,
    )
    activeSection?.addEventListener('scroll', syncVisualSectionWithScrollPosition, {
      passive: true,
    })
    activeSection?.addEventListener('wheel', syncVisualSectionWithWheelIntent, {
      passive: true,
    })
    syncVisualSectionWithScrollPosition()
  }

  queueMicrotask(bindScrollTarget)

  return () => {
    activeSection?.removeEventListener('scroll', syncVisualSectionWithScrollPosition)
    activeSection?.removeEventListener('wheel', syncVisualSectionWithWheelIntent)
    clearVisualSectionReopenState()
  }
})
</script>

<Main.Root class={FEATURE_EDITOR_ROOT_CLASS}>
  <Main.Form
    bind:formEl={contentsElement}
    attrs={formCtx.attributes}
    isReady={true}
    class={FEATURE_EDITOR_FORM_CLASS}
  >
    <HiddenInputs inputs={programmaticFeatureInputEntries} />

    {#if showsVisualSection}
      <FormFeatureVisualSection
        {hasPresentedCanonicalImageSizing}
        {isCanonicalImagePending}
        imageAspectRatio={resolvedCanonicalImageAspectRatio}
        isCollapsed={isVisualSectionCollapsed}
        isNewFeature={isNewFeatureRef}
        contributorUser={currentContributorUser}
        contributorId={feature?.data?.contributorId ?? null}
        createdAt={feature?.data?.createdAt ?? null}
        {isEditing}
        isIntangible={Boolean(currentFeatureData.isIntangible)}
        isVisitable={currentFeatureData.isVisitable}
        hasPrevious={Boolean(previousFeatureRef)}
        hasNext={Boolean(nextFeatureRef)}
        onIntangibleChange={value =>
          updateFeatureData(data => ({ ...data, isIntangible: value }))}
        onVisitableChange={value =>
          updateFeatureData(data => ({ ...data, isVisitable: value }))}
        onExpand={expandVisualSection}
        onCollapse={collapseVisualSectionAndScrollToTop}
        onNavigatePrevious={() => handleFeatureStepperNavigation('previous')}
        onNavigateNext={() => handleFeatureStepperNavigation('next')}
      >
        {#snippet map()}
          <Main.VisualSectionMap isCollapsed={isVisualSectionCollapsed}>
            <FormMapSection
              initialCenter={initialMapCenter}
              coordinates={featureCoordinates ?? DEFAULT_NEW_FEATURE_COORDINATES}
              addressMeta={currentFeatureData.addressMeta ?? null}
              draggable={isEditing}
              onCoordinateChange={handleCoordinateChange}
            />
          </Main.VisualSectionMap>
        {/snippet}

        {#snippet image()}
          <Main.VisualSectionImage
            href={presentedCanonicalImageHref}
            src={presentedCanonicalImageSrc}
            alt={presentedCanonicalImageTitle}
            isPending={isCanonicalImagePending}
            isCollapsed={isVisualSectionCollapsed}
            emptyText={m.feature__no_canonical_image_yet()}
            onImageLoad={handleCanonicalImageLoad}
          />
        {/snippet}
      </FormFeatureVisualSection>
    {/if}

    <Main.Facet
      isVisible={isCoreFacet}
      transition="fade"
      fillHeight={true}
      class={getFeatureEditorFacetClass({
        showsVisualSection,
        isVisualSectionCollapsed,
      })}
      attrs={{ 'data-facet-id': 'core' }}
    >
      <div class={FEATURE_EDITOR_CONTENT_PAD_CLASS}>
        <FormI18nSection
          class={cx(FEATURE_EDITOR_CONTENT_SECTION_CLASS, 'mt-4')}
          {locales}
          onTranslate={onTranslateDescriptorLocale}
          onResetLocale={onResetDescriptorLocale}
          sectionKey="descriptor"
          {isEditing}
        >
          {#snippet center()}
            <FormFeatureSectionHeader
              title={m.admin__forms_common_descriptors()}
              subtitle={m.feature__descriptor_subtitle()}
              issues={formLevelIssues}
            />
          {/snippet}

          {#snippet children(locale)}
            <FormI18nDescriptorFields
              form={formCtx.form}
              fields={formCtx.form.fields.data.i18n[locale]}
              {locale}
              {isEditing}
              fieldConfigs={featureDescriptorFieldConfigs as never}
              {isRequiredInPreflight}
            />
          {/snippet}
        </FormI18nSection>

        <FormFeatureParentSection
          class={cx(
            FEATURE_EDITOR_CONTENT_SECTION_CLASS,
            FEATURE_EDITOR_COLLECTIONS_SECTION_CLASS,
          )}
          {isEditing}
          onClearAll={resetFeatureParents}
          sharedSectionProps={{
                isEditing,
                isSubmitting: formCtx.submitting,
                isSubmitRequested: formCtx.isSubmitRequested,
              }}
          organisationSection={{
                issues: organisationIssues,
                parent: selectedOrganisation,
                hiddenInputAttrs: hiddenOrganisationInputAttrs,
                startInAddingMode: organisationIdValue.length === 0,
                searchScopeKey: 'organisation',
                onBeginReplaceParent: beginReplaceParentOrganisation,
                onCancelReplaceParent: cancelReplaceParentOrganisation,
                onRemoveParent: onRemoveParentOrganisation,
                onSearch: onSearchParentOrganisations,
                onReplaceParent: onReplaceParentOrganisation,
              }}
          projectSection={{
                issues: projectIssues,
                parent: selectedProject,
                hiddenInputAttrs: hiddenProjectInputAttrs,
                closeOnParentChange: true,
                startInAddingMode: projectIdValue.length === 0,
                searchScopeKey: organisationIdValue,
                onBeginReplaceParent: beginReplaceParentProject,
                onCancelReplaceParent: cancelReplaceParentProject,
                onRemoveParent: onRemoveParentProject,
                onSearch: onSearchParentProjects,
                onReplaceParent: onReplaceParentProject,
              }}
          layerSection={{
                issues: layerIssues,
                parent: selectedLayer,
                hiddenInputAttrs: hiddenLayerInputAttrs,
                closeOnParentChange: true,
                startInAddingMode: layerIdValue.length === 0,
                searchScopeKey: `${organisationIdValue}:${projectIdValue}`,
                onBeginReplaceParent: beginReplaceParentLayer,
                onCancelReplaceParent: cancelReplaceParentLayer,
                onRemoveParent: onRemoveParentLayer,
                onSearch: onSearchParentLayers,
                onReplaceParent: onReplaceParentLayer,
              }}
        />
        <FormFacetNav
          previousAction={buildFacetNavAction('core', 'previous')}
          nextAction={buildFacetNavAction('core', 'next')}
        />
      </div>
    </Main.Facet>

    <Main.Facet
      isVisible={isFieldsFacet}
      transition="fade"
      fillHeight={true}
      class={getFeatureEditorFacetClass({
        showsVisualSection,
        isVisualSectionCollapsed,
      })}
      attrs={{ 'data-facet-id': 'fields' }}
    >
      <FormFeatureFields
        {localeKey}
        {locales}
        {nonTranslatableItems}
        {translatableSpecifierItems}
        {isEditing}
        previousAction={buildFacetNavAction('fields', 'previous')}
        nextAction={buildFacetNavAction('fields', 'next')}
        onTranslate={onTranslateTranslatableValues}
        onResetLocale={onResetTranslatableValues}
        onToggleGenAI={togglePropertyI18nValueGen}
        onValueChange={updatePropertyI18nValue}
      />
    </Main.Facet>

    <Main.Facet
      isVisible={isAddressFacet}
      transition="fade"
      fillHeight={true}
      class={getFeatureEditorFacetClass({
        showsVisualSection,
        isVisualSectionCollapsed,
      })}
      attrs={{ 'data-facet-id': 'address' }}
    >
      <div class={FEATURE_EDITOR_PLACEHOLDER_CLASS}>
        <p>{m.feature__address_refactor_placeholder()}</p>

        <FormFacetNav
          previousAction={buildFacetNavAction('address', 'previous')}
          nextAction={buildFacetNavAction('address', 'next')}
        />
      </div>
    </Main.Facet>

    <Main.Facet
      isVisible={isImagesFacet}
      transition="fade"
      fillHeight={true}
      edgeToEdge={true}
      contentClass="h-full overflow-hidden"
      attrs={{ 'data-facet-id': 'images' }}
    >
      {#if featureImageProviderProps.isValid}
        <ImageProvider model={featureImageProviderModel}>
          <FeatureImageEditor />
        </ImageProvider>
      {/if}
    </Main.Facet>
  </Main.Form>
</Main.Root>
