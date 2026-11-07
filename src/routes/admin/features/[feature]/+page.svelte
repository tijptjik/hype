<script lang="ts">
// FEATURE LIFECYCLE
import FeatureIdentityDialog from '#lib/bits/patterns/revisionHistory/FeatureIdentityDialog.svelte'
import FeatureGalleryRevisionEditor from '#lib/bits/patterns/revisionHistory/FeatureGalleryRevisionEditor.svelte'
import FeatureRevisionWorkspace from '#lib/bits/patterns/revisionHistory/FeatureRevisionWorkspace.svelte'

// PROFILE POLICY
import FeatureProfileEditor from '#lib/bits/patterns/forms/featureLocation/FeatureProfileEditor.svelte'
import { resolveFeaturePresentationPolicy } from '#lib/features/presentationPolicy.js'
// PROFILE CONTENT
import {
  contentFormKey,
  canonicalContentTag,
  adaptContentMap,
} from '#lib/i18n/contentRecords.js'
import {
  resolveContentLocales,
  resolveMultilingualDefaults,
} from '#lib/content-locales/resolve.js'
import { getContentLocaleRecord } from '#lib/content-locales/catalogue.js'
import {
  restoreProfileLocales,
  type ProfileLocaleState,
} from '#lib/bits/patterns/forms/featureLocation/profileLocales.js'
import type { ProfileField } from '#lib/bits/patterns/forms/featureLocation/profileTranslation.js'
import { translateContentField } from '#lib/api/translation.remote.js'

import { isRangeProperty } from '#lib/properties/range.js'
import { show3dAddressOptions } from '#lib/projects/flags.js'
import type { RemoteQuery, RemoteQueryOverride } from '$app/server'

// SVELTE
import { goto, pushState } from '$app/navigation'

import { page } from '$app/state'
import { onMount, untrack, tick, type Snippet } from 'svelte'
import { slide } from 'svelte/transition'
import { prefersReducedMotion } from 'svelte/motion'
import { normalizePhoneNumber } from '#lib/utils/phone-property.js'

// TOAST
import { toast } from 'svelte-sonner'
// ADAPTERS
import { useImageProviderModel } from '#lib/adapters/image/index.js'
// I18N
import {
  getLocale,
  getLocaleKey,
  getLocaleOrder,
  m,
  toLocaleKey,
  translateI18nFields,
} from '#lib/i18n.js'
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
} from '#lib/client/services/form.js'
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
} from '#lib/client/services/feature.js'

import {
  getCoordinates,
  getUserLocationCoordinates,
} from '#lib/client/services/geospatial.js'

import {
  getFeatureImageProviderOptions,
  getFeatureImagesFacetHref,
  getSafeImageUrl,
} from '#lib/client/services/image.js'
import { getIssueMessagesForPath } from '#lib/client/services/issues.js'
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
// REMOTE
import {
  archiveFeature,
  featureForm,
  getFeature,
  getFeatures,
  publishFeature,
  publishFeatureImages,
} from '#lib/api/feature.remote.js'
import { getLayer, getLayers } from '#lib/api/layer.remote.js'
import { getOrganisationsWhichHaveLayers } from '#lib/api/organisation.remote.js'
import { getProjectsWhichHaveLayers } from '#lib/api/project.remote.js'
// SCHEMA
import { FeaturePreflightFormData } from '#lib/db/zod/index.js'
// FACTORIES
import { configureForm } from '#lib/factories.svelte.js'
// BITS
import {
  cx,
  FormFeatureFields,
  FormFeatureParentSection,
  FormFeatureVisualSection,
  FeatureImageEditor,
  FormI18nDescriptorFields,
  FormI18nSection,
  FormMapSection,
  Main,
} from '#lib/bits/index.js'
import {
  createFeatureParentSearchPrisms,
  createFeatureParentSectionController,
  toParentLayerItem,
  toParentOrganisationItem,
  toParentProjectItem,
} from '#lib/bits/patterns/forms/formFeatureParentSection/index.js'

import {
  createFeatureVisualSectionController,
  HiddenInputs,
  SectionHeaderPrimitive,
} from '#lib/bits/custom/form/index.js'

import {
  FEATURE_EDITOR_COLLECTIONS_SECTION_CLASS,
  FEATURE_EDITOR_CONTENT_PAD_CLASS,
  FEATURE_EDITOR_CONTENT_SECTION_CLASS,
  FEATURE_EDITOR_FORM_CLASS,
  FEATURE_EDITOR_ROOT_CLASS,
  getFeatureEditorFacetClass,
} from './page.styles'
import {
  getFeatureLocation,
  getFeatureDetachedBrands,
  unlinkFeatureLocation,
} from '#lib/api/location.remote.js'
import { linkDraftPlace } from '#lib/locations/linkDraftPlace.js'
import DraftFeatureLocationSearch from '#lib/bits/patterns/forms/featureLocation/DraftFeatureLocationSearch.svelte'
import { Button } from '#lib/bits/core/index.js'
import FeatureLocationSection from '#lib/bits/patterns/forms/featureLocation/FeatureLocationSection.svelte'
import FormFeatureAddress from '#lib/bits/patterns/forms/formFeatureAddress/FormFeatureAddress.svelte'
import {
  geocodeAddressCandidates,
  loadGeocodedAddressUnits,
} from '#lib/api/external/geocoding.js'
import {
  ADDRESS_LOCALES,
  emptyFeatureAddress,
  getAddressDisplay,
  getAddressUnits,
  invalidateAddressLocation,
  type FeatureAddress,
} from '#lib/addresses/featureAddress.js'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import ImageProvider from '#lib/providers/ImageProvider.svelte'
import { canCreateFeatureForProject } from '#lib/api/services/authz/feature.js'
// NAVIGATION
import {
  getAdjacentResourceRefs,
  getAdminFacetOrderForResource,
  getAdminFacetTabsForResource,
} from '#lib/navigation/index.js'
// UTILS
import { createSchemaRequiredInferer } from '#lib/utils/form-schema.js'
// ICONS
import FeatureIcon from 'virtual:icons/proicons/location'
import AddFeatureIcon from 'virtual:icons/proicons/add'
// CONFIG
import { NEW_REF, NEW_TITLE } from '#lib/constants.js'
// ENUMS
import { FirstClassResource } from '#lib/enums.js'
// TYPES
import type { LocationSearchMarker } from '#lib/locations/searchPresentation.js'
import type { Point } from 'geojson'

import type { FacetType } from '#lib/context/facets.js'
import type { HeaderTransitionSnapshot } from '#lib/client/services/formHeader.types.js'
import type { Id, Locale } from '#lib/types.js'
import type { ImageCtxEnvelope } from '#lib/db/zod/schema/image.types.js'
import type {
  Feature,
  FeatureFormInput,
  FeatureGetState,
} from '#lib/db/zod/schema/feature.types.js'
import type { Layer } from '#lib/db/zod/schema/layer.types.js'

import type {
  ParentSectionLayerItem,
  ParentSectionOrganisationItem,
  ParentSectionProjectItem,
} from '#lib/bits/patterns/forms/formParentSection/index.js'

import type { ParentProjectRecord } from '#lib/bits/patterns/forms/formFeatureParentSection/index.js'

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
// - isLocationFacet
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
// - presentedVisualFeatureRef
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
// - editorAddress
// - updateAddressDraft
// - lookupFeatureAddress
// - selectAddressCandidate
// - startLocationSearch
// - startManualLocation
// - selectDraftLocation
// - undoDraftLocationSelection
// - recoverDraftSearchHistory
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
// - visual section cleanup

/********************
 *  PAGE SETUP
 ************/

// § Context

const adminCtx = getAdminCtx()

// § Controllers

const headerCtrl = getHeaderCtrl()

// Build the shared editor controller once so route sync and header wiring stay consistent.
const facetTabs = getAdminFacetTabsForResource(FirstClassResource.feature)

const editorCtrl = getEditorCtrl({ headerCtrl, icon: FeatureIcon, facetTabs })
const featureRef = $derived(page.params.feature as string)
let locationSearchMarkers = $state<LocationSearchMarker[]>([])
let selectLocationMarker = $state<(id: string) => void>(() => {})
$effect(() => {
  featureRef
  locationSearchMarkers = []
})

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
  getAdminFacetOrderForResource(FirstClassResource.feature).filter(
    facet => featureRef !== NEW_REF || (facet !== 'images' && facet !== 'updates'),
  ),
)

/********************
 *  INTERNAL NAVIGATION STATE
 ************/
const isCoreFacet = $derived(activeFacet === 'core')

const isFieldsFacet = $derived(activeFacet === 'fields')
const isLocationFacet = $derived(activeFacet === 'location')
const isUpdatesFacet = $derived(activeFacet === 'updates')
const isImagesFacet = $derived(activeFacet === 'images')

/********************
 *  INTERNAL NAVIGATION ACTIONS
 ************/

function goToFacet(facet: FacetType): void {
  if ((facet === 'images' || facet === 'updates') && isNewFeatureRef) return
  if (facet === 'fields' && !hasSelectedLayer) return
  if (facet === activeFacet) return
  // The current route ref also covers unsaved Features, which have no cache record.
  const href = `/admin/features/${encodeURIComponent(featureRef)}#${facet}`
  adminCtx.setFacet(facet, featureRef, FirstClassResource.feature)
  void goto(href, {
    reset: false,
    replace: false,
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
  const currentHash = (page.shallow?.url ?? page.url).hash
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
          currentFacet &&
          !(nextRef === NEW_REF && (currentFacet === 'images' || currentFacet === 'updates')) &&
          resolvedFacetTabsSnapshot.has(currentFacet)
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
  if (activeFacet === 'location' && isNewFeatureRef && locationFocusRequest > 0) return
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
  )
    .filter(facet => !isNewFeatureRef || (facet.ref !== 'images' && facet.ref !== 'updates'))
    .map(facet => ({
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
  // Validation may focus its first issue once; browsing tabs must not retrigger this effect.
  if (untrack(() => activeFacet) === targetFacet) return

  adminCtx.setFacet(targetFacet, featureRef, FirstClassResource.feature)
})

/********************
 *  UI STATE
 ************/

// § Variant

const isNewFeatureRef = $derived(featureRef === NEW_REF)
let namingChosen = $state(false)
let locationFocusRequest = $state(0)
const DRAFT_MAP_CENTER: [number, number] = [114.17, 22.3]
const BUILDING_ZOOM = 20
const DEFAULT_FEATURE_MAP_ZOOM = 19
let draftHasPin = $state(false)
let draftHasAddress = $state(false)
let editorViewportHeight = $state(1040)
let draftFindMode = $state<'search' | 'pin'>('search')
let pinHighlightRequest = $state(0)
// Inactive facets mount on first visit, then retain drafts across tab switches.
let visitedUpdatesRef = $state<string | null>(null)
let visitedLocationRef = $state<string | null>(null)
let visitedImagesRef = $state<string | null>(null)
$effect(() => {
  if (isUpdatesFacet) visitedUpdatesRef = featureRef
  if (isLocationFacet) visitedLocationRef = featureRef
  if (isImagesFacet) visitedImagesRef = featureRef
})
const mountLocationFacet = $derived(
  isLocationFacet || visitedLocationRef === featureRef,
)

let draftSearch:
  | { backToResults: () => void; addManualLocation: () => void }
  | undefined = $state()
let draftSearchFilterPanel: Snippet | undefined = $state()
let draftSearchHasResults = $state(false)
let draftResultHistoryId: string | null = $state(null)
/** Recover a selected draft only for history traversal, not ordinary facet navigation.
 * @returns Nothing after SvelteKit has applied the shallow history state.
 */
function recoverDraftSearchHistory(): void {
  void tick().then(() => {
    if (
      isNewFeatureRef &&
      isLocationFacet &&
      draftSelectionBefore &&
      page.state.draftLocationResult !== draftResultHistoryId
    )
      draftSearch?.backToResults()
  })
}
let sharedLocationMapControls = $state<Snippet | undefined>()
let draftSelectionBefore = $state.raw<{
  geometry: typeof currentFeatureData.geometry
  addressMeta: typeof currentFeatureData.addressMeta
  hasPin: boolean
  hasAddress: boolean
  titles: Record<string, string>
  appliedTitles: Record<string, string>
  camera: ReturnType<import('#lib/map/controller.js').MapController['getCamera']>
} | null>(null)
let draftMapController = $state.raw<
  import('#lib/map/controller.js').MapController | null
>(null)
$effect(() => {
  featureRef
  namingChosen = false
  locationFocusRequest = 0
  draftHasPin = false
  draftHasAddress = false
  draftSelectionBefore = null
})

$effect(() => {
  if (isNewFeatureRef && isLocationFacet) namingChosen = true
})

/** Open draft Location discovery and request focus after the facet becomes visible.
 * @returns Nothing.
 */
function startLocationSearch(): void {
  goToFacet('location')
  locationFocusRequest++
}

/** Open manual address entry with a marker so geographic divisions can resolve.
 * @returns Nothing; an existing pin is preserved, otherwise the visible map centre supplies it.
 */
function startManualLocation(): void {
  // Wait for the map instead of fabricating a position before its camera is available.
  if (!draftHasPin && !dropDraftPin()) return
  draftPlaceSource = null
  draftSelectionBefore = null
  pinHighlightRequest += 1
  draftSearch?.addManualLocation()
  draftHasAddress = true
  draftLocationAccepted = true
}

let draftLocationAccepted = $state(false)
let draftLocalKind = $state<
  | 'establishment'
  | 'building'
  | 'address'
  | 'premises'
  | 'unknown'
  | 'natural'
  | undefined
>()
let draftLocationNames = $state<Record<string, string>>({})
let draftLocalNameMode = $state<'independent' | 'inherit'>('inherit')
let draftPlaceSource = $state<{
  ssId: string
  resourceReleaseId: string
  nameMode?: 'independent' | 'inherit'
} | null>(null)
let pendingPlaceLink = $state<{
  featureId: string
  ssId: string
  resourceReleaseId: string
  nameMode?: 'independent' | 'inherit'
} | null>(null)
let placeLinkBusy = $state(false)
let placeLinkError = $state(false)

/** Complete an explicitly requested association after the Feature has an ID.
 * @param saved Persisted identity and concurrency token. @returns Completion.
 * @remarks Creation remains successful if import/link fails; retain a retryable intent
 * against the created ID so retry can never create a second Feature.
 */
async function finishDraftPlaceLink(saved: {
  id: string
  modifiedAt: string
}): Promise<void> {
  const source =
    pendingPlaceLink?.featureId === saved.id ? pendingPlaceLink : draftPlaceSource
  if (!source) return
  pendingPlaceLink = {
    featureId: saved.id,
    ssId: source.ssId,
    resourceReleaseId: source.resourceReleaseId,
    nameMode: source.nameMode,
  }
  placeLinkBusy = true
  placeLinkError = false
  try {
    sessionStorage.setItem(
      `feature-place-link:${saved.id}`,
      JSON.stringify(pendingPlaceLink),
    )
    await linkDraftPlace({
      featureId: saved.id,
      modifiedAt: saved.modifiedAt,
      ssId: source.ssId,
      resourceReleaseId: source.resourceReleaseId,
      nameMode: source.nameMode,
    })
    sessionStorage.removeItem(`feature-place-link:${saved.id}`)
    pendingPlaceLink = null
    draftPlaceSource = null
    await getFeatureLocation({ featureId: saved.id }).refresh()
  } catch {
    placeLinkError = true
    toast.error(m.feature_search_link_failed())
  } finally {
    placeLinkBusy = false
    draftPlaceSource = null
  }
}

$effect(() => {
  if (isNewFeatureRef || typeof sessionStorage === 'undefined') return
  try {
    const raw = sessionStorage.getItem(`feature-place-link:${featureRef}`)
    if (!raw) return
    const intent = JSON.parse(raw)
    if (
      intent.featureId === featureRef &&
      typeof intent.ssId === 'string' &&
      typeof intent.resourceReleaseId === 'string'
    ) {
      pendingPlaceLink = intent
      placeLinkError = true
    }
  } catch {
    /* Invalid local retry state is not an association. */
  }
})

/** Preview the selected candidate without changing any Feature values.
 * @param result Source candidate. @returns Nothing.
 */
function previewDraftLocation(result: { address: FeatureAddress }): void {
  if (result.address.coordinates)
    draftMapController?.flyTo({
      center: result.address.coordinates as [number, number],
      zoom: 17,
      duration: prefersReducedMotion.current ? 0 : 900,
    })
}

/** Use source names as an editable starting point without replacing authored titles.
 * @param result Explicitly selected search preview. @returns Nothing.
 * @remarks Place linking is deferred until successful creation supplies a Feature ID.
 */
function selectDraftLocation(result: {
  address: FeatureAddress
  names: Record<string, string>
  kind?: 'establishment' | 'address'
  nameMode?: 'independent' | 'inherit'
  source?: {
    ssId: string
    resourceReleaseId: string
    nameMode?: 'independent' | 'inherit'
  }
}): void {
  draftLocalKind = result.kind
  draftLocationNames = { ...result.names }
  draftLocalNameMode = featurePresentationPolicy.locationBasedNames
    ? 'inherit'
    : (result.nameMode ?? 'independent')
  draftPlaceSource =
    result.kind === 'establishment' && result.source
      ? { ...result.source, nameMode: draftLocalNameMode }
      : null
  draftResultHistoryId = crypto.randomUUID()
  pushState(page.url.href, { ...page.state, draftLocationResult: draftResultHistoryId })
  // Capture only Location-owned draft fields; recovery must preserve unrelated edits.
  draftSelectionBefore = {
    geometry: structuredClone($state.snapshot(currentFeatureData.geometry)),
    addressMeta: structuredClone($state.snapshot(currentFeatureData.addressMeta)),
    hasPin: draftHasPin,
    hasAddress: draftHasAddress,
    titles: Object.fromEntries(
      Object.entries(currentFeatureData.i18n).map(([locale, value]) => [
        locale,
        value.title || '',
      ]),
    ),
    appliedTitles: {},
    camera: draftMapController?.getCamera() ?? null,
  }
  if (result.address.coordinates) handleCoordinateChange(result.address.coordinates)
  updateAddressDraft(result.address)
  draftHasAddress =
    result.kind === 'address' ||
    Boolean(getAddressDisplay(result.address, getLocaleKey()))
  if (result.address.coordinates) {
    const center = result.address.coordinates as [number, number]
    void tick().then(() =>
      draftMapController?.flyTo({
        center,
        zoom: 17,
        duration: prefersReducedMotion.current ? 0 : 900,
      }),
    )
  }
  updateFeatureData(data => ({
    ...data,
    i18n: Object.fromEntries(
      Object.entries(data.i18n).map(([locale, value]) => [
        locale,
        {
          ...value,
          title:
            result.kind === 'establishment' && result.nameMode === 'inherit'
              ? result.names[ADDRESS_LOCALES[locale as keyof typeof ADDRESS_LOCALES]] ||
                ''
              : value.title || '',
        },
      ]),
    ) as typeof data.i18n,
  }))
  draftSelectionBefore.appliedTitles = Object.fromEntries(
    Object.entries(currentFeatureData.i18n).map(([locale, value]) => [
      locale,
      value.title || '',
    ]),
  )
  namingChosen = true
}

/** Undo the chosen preview while preserving titles the user edited afterwards.
 * @returns Nothing; restores the previous Location fields, pin visibility and camera.
 */
function undoDraftLocationSelection(): void {
  draftPlaceSource = null
  const before = draftSelectionBefore
  if (!before) return
  addressLookupRevision++
  isAddressLookupLoading = false
  addressLookupMessage = ''
  addressCandidates = []
  updateFeatureData(
    data => ({
      ...data,
      geometry: before.geometry,
      addressMeta: before.addressMeta,
      i18n: Object.fromEntries(
        Object.entries(data.i18n).map(([locale, value]) => [
          locale,
          {
            ...value,
            title:
              value.title === before.appliedTitles[locale]
                ? before.titles[locale]
                : value.title,
          },
        ]),
      ) as typeof data.i18n,
    }),
    { revalidate: true },
  )
  draftHasPin = before.hasPin
  draftHasAddress = before.hasAddress
  draftSelectionBefore = null
  if (page.state.draftLocationResult === draftResultHistoryId) history.back()
  draftResultHistoryId = null
  if (before.camera)
    draftMapController?.flyTo({
      ...before.camera,
      duration: prefersReducedMotion.current ? 0 : 700,
    })
}

/** Place the draft pin at the visible map centre and zoom one step toward building detail.
 * @returns Whether the map was ready and its centre was used for the marker.
 */
function dropDraftPin(): boolean {
  const center = draftMapController?.getCamera()?.center
  if (!center) return false
  handlePinDrop([...center])
  pinHighlightRequest += 1
  return true
}

/** Prevent a new Feature from silently saving the editor's default camera coordinates.
 * @returns Whether the user has selected an actual position.
 */
function ensureDraftPin(): boolean {
  if (!isNewFeatureRef || draftHasPin) return true
  goToFacet('location')
  toast.error(m.feature_start_choose_position())
  return false
}

// § Header
let lastHeaderKey = ''

let identityOpen = $state(false)
let identityKind = $state<'split' | 'merge'>('split')
$effect(() => {
  // Entity metadata refreshes reset custom actions; restore them after title or facet changes.
  headerCtrl.state.meta.title
  headerCtrl.state.meta.facets
  const available = Boolean(currentFeatureId && isCurrentRefLoaded && !feature?.data?.isArchived)
  headerCtrl.setTitleMenuItems(available ? [
    { label: 'Split', disabled: isDirty, onSelect: () => { identityKind = 'split'; identityOpen = true } },
    { label: 'Merge', disabled: isDirty, onSelect: () => { identityKind = 'merge'; identityOpen = true } },
  ] : [])
  return () => headerCtrl.setTitleMenuItems([])
})


let revisionWorkspaceVersion = $state(0)
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
const showsVisualSection = $derived(isCoreFacet || isFieldsFacet || isLocationFacet)

let isVisualSectionCollapsed = $state(
  adminCtx.view.getUserPreferences().admin?.isAdminMapCollapsed ?? false,
)
let visualSectionHeight = $state(520)
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
// Resolve stepper identities after the requested record mounts, independently of parent cards.
$effect(() => {
  const scope = adminCtx.featureNavigationScope
  const id = currentFeatureId
  if (!id || id !== featureRef) return
  untrack(() => {
    void adminCtx.ensureFeatureNavigation(id).catch(error => {
      if (scope === adminCtx.featureNavigationScope)
        console.error('Feature navigation failed', error)
    })
  })
})

const featureList = $derived(adminCtx.featureNavigationRows)

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
  if (!isCurrentRefSettled) return
  // The resource settles before configureForm hydrates its fields; wait for this form's identity.
  if (!isNewFeatureRef && currentFormValue.meta?.id !== featureRef) return
  if (hasSelectedLayer) return
  untrack(() => {
    adminCtx.setFacet('core', featureRef, FirstClassResource.feature)
  })
})

$effect(() => {
  if (!isNewFeatureRef) return
  if (!organisationIdValue || projectIdValue) return

  let cancelled = false

  void getCreatableProjectRecords({ organisationIds: [organisationIdValue] }).then(
    projects => {
      if (cancelled || projectIdValue) return
      if (projects.length !== 1) return

      const project = toParentProjectItem(projects[0])

      if (!project) return

      onReplaceParentProject(project)
    },
  )

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
    meta: { ...adminCtx.view.resources.queryMeta, profile: 'admin' as const },
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
    if (!ensureDraftPin()) return false
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
          pagination: { limit: 50, offset: 0 },
          conditions: adminCtx.view.isSuperAdmin()
            ? { isArchived: null, isPublished: null }
            : { isArchived: false, isPublished: null },
          prisms: adminCtx.view.scope.prisms,
          meta: { ...adminCtx.view.resources.queryMeta, profile: 'card' },
        }),
      ]

      if (!isNewFeatureRef) {
        updates.unshift(
          getFeatureLocation({ featureId: featureRef }),
          getFeatureDetachedBrands({ featureId: featureRef }),
          getFeature({
            ref: featureRef,
            refKey: 'id',
            meta: { ...adminCtx.view.resources.queryMeta, profile: 'admin' },
          }),
        )
      }

      return updates
    },
    adminCtx,
    headerCtrl,
    resourceType: FirstClassResource.feature,
    getEntity: () => feature,
    refreshResource: async ({ success, result }) => {
      if (success && result && typeof result === 'object' && 'revisionApplied' in result) {
        await refreshFeature()
        hasProgrammaticDirtyChanges = false
        revisionWorkspaceVersion++
        return
      }
      if (success && result && typeof result === 'object' && 'revisionDraft' in result) {
        await refreshFeature()
        hasProgrammaticDirtyChanges = false
        revisionWorkspaceVersion++
        toast.success('Proposed changes saved for review.')
        return
      }

      if (
        success &&
        draftPlaceSource &&
        result &&
        typeof result === 'object' &&
        'data' in result
      ) {
        const saved = result.data as { id?: unknown; modifiedAt?: unknown }
        if (typeof saved?.id === 'string' && typeof saved.modifiedAt === 'string')
          await finishDraftPlaceLink({ id: saved.id, modifiedAt: saved.modifiedAt })
      }
      await refreshFeature()
    },
  }),
  onissues: ({ issues }) => {
    console.error('[feature-editor] preflight invalidation', {
      featureRef,
      issues: issues.map(issue => ({ path: issue.path, message: issue.message })),
    })
  },
}))

const formCtx = $derived(configuredFeatureForm())
const isDirty = $derived(Boolean(formCtx.dirty || hasProgrammaticDirtyChanges))
const isRequiredInPreflight = createSchemaRequiredInferer(() => featureFormSource)
const currentFormValue = $derived(formCtx.form.fields.value() as FeatureFormInput)
const currentFeatureData = $derived(currentFormValue?.data ?? emptyFeatureFormSeed.data)
const showNameFields = $derived(
  !isNewFeatureRef ||
    namingChosen ||
    Object.values(currentFeatureData.i18n ?? {}).some(value => Boolean(value?.title)),
)

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

// Profile order/visibility belongs to this account and record, independently of UI languages.
let profileLocaleDraft = $state<{ key: string; state: ProfileLocaleState } | null>(null)
let profileEpoch = $state(0)
const profileScope = $derived(
  `${adminCtx.view.user?.id ?? ''}:${currentFeatureId ?? featureRef}`,
)
// Reuse independently hydrated parent settings instead of requesting a second admin graph.
const profileProject = $derived.by(() =>
  adminCtx.view.cache.project.get(projectIdValue),
)
const profileOrganisation = $derived.by(() =>
  adminCtx.view.cache.organisation.get(organisationIdValue),
)
const profileDefaults = $derived(
  resolveContentLocales({
    userLocale: getLocaleKey(),
    projectSettings: profileProject?.settings,
    organisationSettings: profileOrganisation?.settings,
  }).locales,
)
const multilingualDefaults = $derived(
  resolveMultilingualDefaults({
    projectSettings: profileProject?.settings,
    organisationSettings: profileOrganisation?.settings,
  }),
)
const multilingualAccount = $derived(adminCtx.view.user?.id ?? '')
const multilingualChoice = $derived(
  adminCtx.featureMultilingual.get(multilingualAccount),
)
const profileLocaleState = $derived.by(() => {
  const saved =
    profileLocaleDraft?.key === profileScope ? profileLocaleDraft.state : undefined
  return {
    ...restoreProfileLocales(profileDefaults, currentFeatureData.i18n, saved),
    expanded: multilingualChoice ?? saved?.expanded ?? multilingualDefaults.content,
  }
})

/** Accept form-local toolbar choices without changing shared settings or content.
 * @param state Ordered selection and visibility. @returns Nothing.
 */
function setProfileLocaleState(state: ProfileLocaleState): void {
  if (state.expanded !== profileLocaleState.expanded)
    adminCtx.featureMultilingual.set(multilingualAccount, state.expanded)
  profileLocaleDraft = { key: profileScope, state }
}

/** Apply only a successful field translation; the Profile controller guards stale responses.
 * @param field Translated field. @param locale Canonical target. @param text Provider result.
 * @returns Nothing; other fields and verification flags are preserved.
 */
function applyProfileTranslation(
  field: ProfileField,
  locale: string,
  text: string,
): void {
  const key = contentFormKey(locale)
  updateFeatureData(
    data => ({
      ...data,
      i18n: {
        ...data.i18n,
        [key]: { ...data.i18n[key], [field]: text, [`${field}Gen`]: true },
      },
    }),
    { revalidate: true },
  )
}

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

// Parent records own policy. The Feature's tiny read projection covers the first editable frame.
const featurePresentationPolicy = $derived.by(() => {
  const flags =
    adminCtx.view.cache.project.get(projectIdValue)?.flags ?? selectedProject?.flags
  const metadata =
    adminCtx.view.cache.layer.get(layerIdValue)?.metadata ?? selectedLayer?.metadata
  const sameParents =
    projectIdValue === feature?.data?.projectId &&
    layerIdValue === feature?.data?.layerId
  if (
    (flags === undefined || metadata === undefined) &&
    sameParents &&
    feature?.data?.presentationPolicy
  )
    return feature.data.presentationPolicy
  return resolveFeaturePresentationPolicy(flags, metadata)
})
const acceptedNameSource = $derived(
  currentFeatureId && isLocationFacet
    ? getFeatureLocation({ featureId: currentFeatureId })
    : null,
)
let savedLocationNameDraft = $state<{
  featureId: string
  names: Record<string, string>
} | null>(null)
const profileLocationNames = $derived.by(() => {
  const names: Record<string, string> =
    isNewFeatureRef || draftLocalKind || draftPlaceSource
      ? draftLocationNames
      : savedLocationNameDraft?.featureId === currentFeatureId
        ? savedLocationNameDraft.names
        : Object.fromEntries(
            Object.entries(
              acceptedNameSource?.current?.effective.names ??
                feature?.data?.locationNames ??
                {},
            ).map(([locale, name]) => [locale, name ?? '']),
          )
  if (Object.values(names).some(name => name.trim())) return names
  if (draftLocalKind === 'address' || acceptedNameSource?.current?.kind === 'address') {
    return Object.fromEntries(
      Object.entries(ADDRESS_LOCALES).map(([locale, tag]) => [
        tag,
        getAddressDisplay(editorAddress, locale as keyof typeof ADDRESS_LOCALES),
      ]),
    )
  }
  return names
})
const profileNameMode = $derived(
  featurePresentationPolicy.locationBasedNames
    ? 'inherit'
    : isNewFeatureRef
      ? draftLocalNameMode
      : (currentFeatureData.locationNameMode ??
        feature?.data?.authoring?.nameMode ??
        acceptedNameSource?.current?.nameMode ??
        'independent'),
)
const profileNamesLocked = $derived(profileNameMode === 'inherit')
// Existing independent titles must not hide the explicit option to inherit the Location name.
const canOfferLocationName = $derived(
  !profileNamesLocked && Object.values(profileLocationNames).some(name => name.trim()),
)

/** Copy Location names into Feature titles while recording explicit inheritance intent.
 * @param names The current Location translations. @returns Nothing; normal form save persists titles.
 */
function inheritLocationNames(names: Record<string, string>): void {
  const byKey = adaptContentMap(names)
  const keys = [
    ...new Set([...Object.keys(currentFeatureData.i18n), ...Object.keys(byKey)]),
  ]
  const storedMode =
    currentFeatureData.locationNameMode ??
    (isNewFeatureRef
      ? draftLocalNameMode
      : (feature?.data?.authoring?.nameMode ?? acceptedNameSource?.current?.nameMode))
  if (
    storedMode === 'inherit' &&
    keys.every(
      key => (currentFeatureData.i18n[key]?.title ?? '') === (byKey[key] ?? ''),
    )
  )
    return
  updateFeatureData(data => ({
    ...data,
    locationNameMode: 'inherit',
    i18n: Object.fromEntries(
      keys.map(key => [
        key,
        {
          ...data.i18n[key],
          title: byKey[key] ?? '',
          titleGen:
            data.i18n[key]?.title === (byKey[key] ?? '')
              ? (data.i18n[key]?.titleGen ?? false)
              : false,
        },
      ]),
    ),
  }))
}
/** Choose Location naming for this Feature without changing its Location identity.
 * @returns Nothing; the association save stores the selected mode.
 */
function useLocationName(): void {
  draftLocalNameMode = 'inherit'
  if (draftPlaceSource) draftPlaceSource = { ...draftPlaceSource, nameMode: 'inherit' }
  inheritLocationNames(profileLocationNames)
}
/** Keep the current title while returning naming ownership to this Feature.
 * @returns Nothing; the normal form save persists the explicit record choice.
 */
function useIndependentFeatureName(): void {
  draftLocalNameMode = 'independent'
  if (draftPlaceSource)
    draftPlaceSource = { ...draftPlaceSource, nameMode: 'independent' }
  updateFeatureData(data => ({ ...data, locationNameMode: 'independent' }))
}
// New drafts follow their Location selection. Saved records change only through explicit naming actions,
// never merely by entering edit mode or resolving an asynchronous read.
$effect(() => {
  const names = profileLocationNames
  const locked = profileNamesLocked
  const editing = isEditing
  if (isNewFeatureRef && locked && editing && Object.keys(names).length)
    untrack(() => inheritLocationNames(names))
})

const featureDescriptorFieldConfigs = $derived([
  {
    key: 'title',
    label: m.feature__title(),
    kind: 'input',
    readonly: profileNamesLocked,
  },
  ...(featurePresentationPolicy.allowDescriptions
    ? [{ key: 'description', label: m.feature__description(), kind: 'textarea' }]
    : []),
])

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
let imagePublicationPrompt = $state<{
  featureId: string
  routeRef: string
} | null>(null)

// Action ownership also covers the hydrated creation route, which skips form reloading.
let featureActionRevision = 0
$effect(() => {
  featureRef
  adminCtx.view.resources.scopeKey
  featureActionRevision += 1
  untrack(() => headerCtrl.setFormActions({ isPublishing: false, isDeleting: false }))
  imagePublicationPrompt = null
  return () => {
    featureActionRevision += 1
  }
})

/**
 * Captures the current Feature action lifecycle independently of form hydration.
 * @returns A predicate rejecting completions after navigation, scope change or unmount.
 */
function captureFeatureAction(): () => boolean {
  const revision = featureActionRevision
  const ref = featureRef
  const scope = adminCtx.view.resources.scopeKey
  return () =>
    revision === featureActionRevision &&
    ref === featureRef &&
    scope === adminCtx.view.resources.scopeKey
}

/**
 * Applies a Feature toggle acknowledgement and its native detail update.
 * @param field Publication or archive field to toggle.
 * @returns Completion of the write and current-route feedback.
 */
async function handleFeatureStateToggle(
  field: 'isPublished' | 'isArchived',
): Promise<void> {
  if (!isCurrentRefLoaded) return
  const current = feature?.data

  if (!current) return

  const isCurrentAction = captureFeatureAction()
  const nextState = !current[field]

  const setBusy =
    field === 'isPublished'
      ? (value: boolean) => headerCtrl.setPublishing(value)
      : (value: boolean) => headerCtrl.setDeleting(value)
  setBusy(true)
  const mutation = adminCtx.view.cacheCtx.beginMutation('feature', {
    meta: { id: current.id },
    data: { [field]: nextState },
  })
  try {
    const detail = getFeature({
      ref: current.id,
      refKey: 'id',
      meta: { ...adminCtx.view.resources.queryMeta, profile: 'admin' },
    })
    const result = await (field === 'isPublished' ? publishFeature : archiveFeature)({
      id: current.id,
      state: nextState,
      meta: { isAdminRequest: true },
    }).updates(...mutation.updates, detail)
    mutation.settle(true)
    if (!isCurrentAction()) return
    // The requested native update includes publication image policy; avoid a second read.
    if (feature?.data?.id === current.id) {
      const refreshed =
        detail.current?.data?.id === current.id ? detail.current.data : undefined
      commitSettledFeatureState({
        ...feature,
        data: { ...feature.data, ...refreshed, ...result.data },
      } as FeatureGetState)
    }
    if (field === 'isPublished') {
      imagePublicationPrompt = nextState
        ? { featureId: current.id, routeRef: featureRef }
        : null
    }
    toast.success(
      field === 'isPublished'
        ? nextState
          ? m.published()
          : m.forms__unpublished()
        : nextState
          ? m.forms__delete()
          : m.forms__restored(),
    )
  } catch {
    mutation.settle(false)
    if (!isCurrentAction()) return
    toast.error(m.long_crazy_peacock_care())
  } finally {
    if (isCurrentAction()) setBusy(false)
  }
}

const shouldOfferImagePublication = $derived(
  selectedProject?.flags?.autoFeatureFirstImage === false &&
    (feature?.data?.images ?? []).some(
      image => image.intent !== 'research' && !image.isPublished,
    ),
)

/**
 * Applies the bulk-publication result to every active non-research image envelope.
 *
 * @param value Feature record whose gallery state should be projected locally.
 * @returns A Feature record with only publishable image assignments updated.
 */
function withPublishedFeatureImages(value: Feature): Feature {
  const markPublished = (
    image: NonNullable<Feature['images']>[number],
  ): NonNullable<Feature['images']>[number] =>
    image.intent === 'research' || image.isPublished
      ? image
      : { ...image, isPublished: true }

  return {
    ...value,
    image: value.image ? markPublished(value.image) : value.image,
    images: value.images?.map(markPublished),
  }
}

/** Publishes all active non-research photos after the editor explicitly opts in.
 * @returns Resolves when the Feature image state has been refreshed.
 */
async function publishRemainingFeatureImages(): Promise<void> {
  const current = feature?.data
  const previousFeatureState = feature
  if (!current || !previousFeatureState) return
  const isCurrentAction = captureFeatureAction()
  headerCtrl.setPublishing(true)
  const optimisticFeature = withPublishedFeatureImages(current)
  const optimisticFeatureState = { ...previousFeatureState, data: optimisticFeature }
  const mutation = adminCtx.view.cacheCtx.beginMutation('feature', {
    meta: { id: current.id },
    data: {
      image: optimisticFeature.image,
      images: optimisticFeature.images,
    },
  })
  // Keep the form and gallery in step with the shared cache while the command is in flight.
  commitFeatureState(optimisticFeatureState)
  // Svelte wraps the assigned record; compare the retained proxy rather than the input object.
  const appliedFeatureState = feature
  // Retain only changed publication fields, keyed by the actual assigned image proxies.
  type GalleryImage = NonNullable<Feature['image']>
  const publicationBefore = new Map<GalleryImage, GalleryImage['isPublished']>()
  if (feature?.data?.image && current.image && feature.data.image !== current.image)
    publicationBefore.set(feature.data.image, current.image.isPublished)
  feature?.data?.images?.forEach((image, index) => {
    const previous = current.images?.[index]
    if (previous && image !== previous)
      publicationBefore.set(image, previous.isPublished)
  })
  /**
   * Reverts this action's publication field without replacing other image data.
   * @param image Current image envelope, potentially edited while the command was pending.
   * @returns The preserved envelope with only an owned publication change reverted.
   */
  const rollbackImage = (image: GalleryImage): GalleryImage =>
    publicationBefore.has(image)
      ? { ...image, isPublished: publicationBefore.get(image)! }
      : image
  try {
    const detail = getFeature({
      ref: current.id,
      refKey: 'id',
      meta: { ...adminCtx.view.resources.queryMeta, profile: 'admin' },
    })
    await publishFeatureImages({
      id: current.id,
      meta: { isAdminRequest: true },
    }).updates(...mutation.updates, detail)
    mutation.settle(true)
    if (!isCurrentAction()) return
    // Use the native refresh, retaining newer editor data if no detail was returned.
    if (detail.current?.data?.id === current.id) {
      commitSettledFeatureState(detail.current as FeatureGetState)
    } else if (feature === appliedFeatureState) {
      commitSettledFeatureState(feature)
    }
    toast.success(m.feature_images_published())
  } catch {
    mutation.settle(false)
    if (!isCurrentAction()) return
    // Preserve gallery membership and metadata edits while reverting owned publication fields.
    if (feature?.data?.id === current.id) {
      commitFeatureState({
        ...feature,
        data: {
          ...feature.data,
          image: feature.data.image
            ? rollbackImage(feature.data.image)
            : feature.data.image,
          images: feature.data.images?.map(rollbackImage),
        },
      })
    }
    toast.error(m.long_crazy_peacock_care())
  } finally {
    if (isCurrentAction()) headerCtrl.setPublishing(false)
  }
}

// Anchor the follow-up action to the publish control so it moves with the admin drawer without resizing content.
$effect(() => {
  const current = feature?.data
  if (
    !current?.isPublished ||
    !shouldOfferImagePublication ||
    imagePublicationPrompt?.featureId !== current.id ||
    imagePublicationPrompt?.routeRef !== featureRef
  ) {
    headerCtrl.setFormActions({ publishPrompt: null })
    return
  }
  headerCtrl.setFormActions({
    publishPrompt: {
      text: m.feature_unpublished_photos(),
      actionText: m.publish_children__all(),
      onClick: () => void publishRemainingFeatureImages(),
    },
  })
})

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
  const sourceLocaleKey = toLocaleKey(sourceLocale)
  const targetLocaleKey = toLocaleKey(targetLocale)

  const fieldsToTranslate = featureDescriptorTranslatableFields.filter(field => {
    const currentValue = currentFeatureData.i18n?.[targetLocaleKey]?.[field] ?? ''

    return currentValue.trim().length === 0
  })

  if (fieldsToTranslate.length === 0) return false

  const translated = await translateI18nFields({
    source: sourceLocaleKey,
    target: targetLocaleKey,
    fields: [...fieldsToTranslate],
    i18n: {
      en: Object.fromEntries(
        fieldsToTranslate.map(field => [
          field,
          currentFeatureData.i18n?.en?.[field] ?? '',
        ]),
      ),
      zhHans: Object.fromEntries(
        fieldsToTranslate.map(field => [
          field,
          currentFeatureData.i18n?.zhHans?.[field] ?? '',
        ]),
      ),
      zhHant: Object.fromEntries(
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
  const sourceLocaleKey = toLocaleKey(sourceLocale)
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

    zhHans: Object.fromEntries(
      propertyIds.map(propertyId => [
        propertyId,
        translatableSpecifierItems.find(property => property.propertyId === propertyId)
          ?.i18n?.zhHans?.value ?? '',
      ]),
    ),

    zhHant: Object.fromEntries(
      propertyIds.map(propertyId => [
        propertyId,
        translatableSpecifierItems.find(property => property.propertyId === propertyId)
          ?.i18n?.zhHant?.value ?? '',
      ]),
    ),
  }

  const translated = await translateI18nFields({
    source: sourceLocaleKey,
    target: targetLocaleKey,
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
const currentUser = $derived(adminCtx.view.user ?? null)

const currentContributorUser = $derived(toCurrentContributorUser(currentUser))
const currentAuthorizationUser = $derived(toCurrentAuthorizationUser(currentUser))

/********************
 *  MAP STATE
 ************/

const initialMapCenter = $derived(getUserLocationCoordinates(adminCtx.view))

/********************
 *  ADDRESS EDITOR
 ************/
let isAddressLookupLoading = $state(false)
let addressLookupMessage = $state('')
let addressLookupRevision = 0
let addressCandidates = $state<FeatureAddress[]>([])
let addressCandidateQuery = $state('')

const editorAddress = $derived.by((): FeatureAddress => {
  if (currentFeatureData.addressMeta?.address)
    return currentFeatureData.addressMeta.address
  // Unsaved and not-yet-migrated records retain their original labels as evidence.
  const fallback = Object.fromEntries(
    Object.entries(ADDRESS_LOCALES).map(([locale, tag]) => [
      tag,
      currentFeatureData.i18n?.[locale as keyof typeof ADDRESS_LOCALES]
        ?.displayAddress ?? '',
    ]),
  )
  const address = emptyFeatureAddress(fallback)
  address.legacy = {
    addressMeta: currentFeatureData.addressMeta ?? {},
    i18n: currentFeatureData.i18n ?? {},
  }
  return address
})

$effect(() => {
  featureRef
  isEditing
  addressLookupRevision += 1
  isAddressLookupLoading = false
  addressLookupMessage = ''
  addressCandidates = []
})

/** Updates the canonical address and its display-only projections in one draft mutation.
 * @param address Source envelope and per-feature corrections.
 * @returns Nothing; persistence uses the existing authorized Save/Cancel workflow.
 */
function updateAddressDraft(address: FeatureAddress): void {
  addressLookupRevision += 1
  isAddressLookupLoading = false
  addressLookupMessage = ''
  addressCandidates = []
  updateFeatureData(data => ({
    ...data,
    addressMeta: { ...data.addressMeta, address },
    i18n: Object.fromEntries(
      Object.entries(data.i18n).map(([locale, value]) => [
        locale,
        {
          ...value,
          displayAddress: getAddressDisplay(
            address,
            locale as keyof typeof ADDRESS_LOCALES,
          ),
          displayAddressGen:
            Object.keys(
              address.overrides[
                ADDRESS_LOCALES[locale as keyof typeof ADDRESS_LOCALES]
              ] ?? {},
            ).length === 0,
          addressProperties: {},
        },
      ]),
    ) as typeof data.i18n,
  }))
}

/** Fetches the selected pin or an address query without overwriting a newer draft.
 * @param query Optional forward search; reverse lookup preserves the selected pin.
 * @returns Completion of the lookup; errors leave settled address data intact.
 */
async function lookupFeatureAddress(query?: string): Promise<void> {
  if (!isEditing || !featureCoordinates) return
  const revision = ++addressLookupRevision
  const ref = featureRef
  const draftSignature = JSON.stringify(currentFeatureData)
  isAddressLookupLoading = true
  addressLookupMessage = ''
  addressCandidates = []
  const isCurrent = (): boolean =>
    revision === addressLookupRevision &&
    ref === featureRef &&
    isEditing &&
    JSON.stringify(currentFeatureData) === draftSignature
  try {
    const results = await geocodeAddressCandidates(
      query?.trim()
        ? { address: query.trim() }
        : { lng: featureCoordinates[0], lat: featureCoordinates[1] },
    )
    if (!isCurrent()) return
    addressCandidates = results.flatMap(result =>
      result.addressMeta.address ? [result.addressMeta.address] : [],
    )
    addressCandidateQuery = query?.trim() ?? ''
    if (!addressCandidates.length) addressLookupMessage = m.feature_address_no_match()
  } catch {
    if (isCurrent()) addressLookupMessage = m.feature_address_failed()
  } finally {
    if (revision === addressLookupRevision) isAddressLookupLoading = false
  }
}

/** Applies only the candidate the user selected, with publication-pinned details.
 * @param candidate Selected source summary. @returns Completion without replacing a newer draft.
 */
async function selectAddressCandidate(candidate: FeatureAddress): Promise<void> {
  const revision = ++addressLookupRevision
  const signature = JSON.stringify(currentFeatureData)
  const previous = editorAddress
  const forward = Boolean(addressCandidateQuery)
  isAddressLookupLoading = true
  try {
    const address = await loadGeocodedAddressUnits(candidate)
    if (
      revision !== addressLookupRevision ||
      !isEditing ||
      signature !== JSON.stringify(currentFeatureData)
    )
      return
    if (previous.legacy) address.legacy = previous.legacy
    if (
      previous.source.address2dId &&
      previous.source.address2dId === address.source.address2dId
    ) {
      address.overrides = previous.overrides
      const unit = getAddressUnits(address, 'en').find(
        item => item.value === previous.source.address3dUnitId,
      )
      if (unit) {
        address.source.address3dId = unit.inventoryId
        address.source.address3dUnitId = unit.value
      }
    }
    if (forward && address.coordinates) handleCoordinateChange(address.coordinates)
    updateAddressDraft(address)
  } catch {
    if (revision === addressLookupRevision)
      addressLookupMessage = m.feature_address_failed()
  } finally {
    if (revision === addressLookupRevision) isAddressLookupLoading = false
  }
}

/********************
 *  MAP MUTATION
 ************/

/** Move the pin and progressively zoom toward the building detail used by saved Features.
 * @param nextCoordinates Dropped marker longitude/latitude.
 * @returns Nothing; the camera moves after reactive marker updates finish.
 */
function handlePinDrop(nextCoordinates: number[]): void {
  const controller = draftMapController
  const camera = controller?.getCamera()
  handleCoordinateChange(nextCoordinates)
  if (!controller || !camera) return
  // Let Maplet synchronize the marker before starting the drop's camera animation.
  void tick().then(() => {
    if (draftMapController !== controller) return
    controller.easeTo({
      center: [nextCoordinates[0], nextCoordinates[1]],
      zoom: Math.max(camera.zoom, Math.min(camera.zoom + 2, BUILDING_ZOOM)),
      duration: prefersReducedMotion.current ? 0 : 520,
    })
  })
}

/** Moves the draft marker and invalidates any address tied to the previous point.
 * @param nextCoordinates Selected longitude/latitude.
 * @returns Nothing; the address is retained for review until a new lookup.
 */
function handleCoordinateChange(nextCoordinates: number[]): void {
  if (isNewFeatureRef) draftHasPin = true
  addressLookupRevision += 1
  isAddressLookupLoading = false
  addressLookupMessage = ''
  addressCandidates = []
  updateFeatureData(
    data => ({
      ...data,
      geometry: {
        ...(data.geometry as Point),
        type: 'Point',
        coordinates: nextCoordinates,
      },
      addressMeta: invalidateAddressLocation(data.addressMeta ?? {}, nextCoordinates),
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
let presentedVisualFeatureRef = $state<string | null>(null)
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
  expandVisualSection,
  handleCanonicalImageLoad,
  handleFeatureStepperNavigation,
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
    adminCtx.view.queries.rows.organisation?.find(
      item => item.id === organisationIdValue,
    ) ??
    null
  const project =
    selectedProject ??
    adminCtx.view.queries.rows.project?.find(item => item.id === projectIdValue) ??
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
  const nextSrc = canonicalImageSrc
  const nextHref = canonicalImageHref
  const nextTitle = title
  const settled = isCurrentRefSettled
  // Invalidate pending decodes immediately when navigation requests another feature.
  const requestedRef = featureRef

  return untrack(() => {
    if (!settled) {
      isCanonicalImagePending = Boolean(presentedCanonicalImageSrc)
      return
    }
    if (!nextSrc) {
      presentedCanonicalImageSrc = null
      presentedCanonicalImageHref = nextHref
      presentedCanonicalImageTitle = nextTitle
      isCanonicalImagePending = false
      canonicalImageMeasuredAspectRatio = null
      presentedVisualFeatureRef = requestedRef
      return
    }
    if (nextSrc === presentedCanonicalImageSrc) {
      presentedCanonicalImageHref = nextHref
      presentedCanonicalImageTitle = nextTitle
      isCanonicalImagePending = false
      presentedVisualFeatureRef = requestedRef
      return
    }

    let cancelled = false
    const image = new Image()
    isCanonicalImagePending = true

    // Keep the last confirmed image and ratio until its replacement is paint-ready;
    // publish the source and dimensions together to crossfade while the frame resizes.
    image.onload = async () => {
      try {
        await image.decode()
      } catch {
        // An already loaded image can still be paintable when decode rejects.
      }
      if (cancelled) return
      handleCanonicalImageLoad({
        width: image.naturalWidth,
        height: image.naturalHeight,
      })
      presentedCanonicalImageSrc = nextSrc
      presentedCanonicalImageHref = nextHref
      presentedCanonicalImageTitle = nextTitle
      isCanonicalImagePending = false
      presentedVisualFeatureRef = requestedRef
    }
    image.onerror = () => {
      if (cancelled) return
      // Do not leave another feature's photo linked to the current feature on failure.
      presentedCanonicalImageSrc = null
      presentedCanonicalImageHref = nextHref
      presentedCanonicalImageTitle = nextTitle
      canonicalImageMeasuredAspectRatio = null
      isCanonicalImagePending = false
      presentedVisualFeatureRef = requestedRef
    }
    image.src = nextSrc

    return () => {
      cancelled = true
    }
  })
})

/********************
 *  SECTION : FIELDS STATE
 ************/

// Linked Features edit brands through their Location association, never the legacy classifier.
const editableFeatureProperties = $derived(
  feature?.data?.locationBrands != null
    ? (currentFeatureData.properties ?? []).filter(
        property => property.property?.key !== 'brand',
      )
    : currentFeatureData.properties,
)

const nonTranslatableItems = $derived(
  getNonTranslatableFeatureFieldItems({
    properties: editableFeatureProperties,
    localeKey,
    isEditing,
    onChange: updatePropertyValue,
  }),
)

const translatableSpecifierItems = $derived(
  getTranslatableSpecifierProperties(editableFeatureProperties),
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
            valueJson:
              property.property?.dataType === 'link' ||
              isRangeProperty(property.property ?? {})
                ? String(nextValue)
                : null,
            value:
              property.property?.dataType === 'link' ||
              isRangeProperty(property.property ?? {})
                ? ''
                : property.property?.component === 'SelectField'
                  ? ''
                  : typeof nextValue === 'boolean'
                    ? String(nextValue)
                    : String(nextValue),
            propertyValueId:
              property.property?.component === 'SelectField'
                ? String(nextValue)
                : property.propertyValueId,
          }
        : property,
    ),
  }))
  // Server issues survive preflight-only checks; validate-only requests clear stale
  // property errors after a row is edited or removed without writing the feature.
  if (formCtx.wasSubmitAttempted)
    void tick().then(() => formCtx.validate({ preflightOnly: false }))
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
              [locale]: { value: nextValue, valueGen },
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
      return { ...data, properties: [] }
    })
    return
  }

  try {
    // Fetch the authoritative layer definition before rebuilding derived feature properties.
    const result = await getLayer({
      ref: resolvedLayerId,
      refKey: 'id',
      meta: { ...adminCtx.view.resources.queryMeta, profile: 'admin' },
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

      return { ...data, properties: [] }
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

/**
 * Validate custom phone controls, then submit the current editor values.
 * @returns Resolves after focusing an invalid phone or requesting form submission.
 */
async function onSubmit(): Promise<void> {
  suppressFormLevelIssues = false
  if (!isCurrentRefLoaded || !ensureDraftPin()) return
  // Flush the last input edit before serializing custom property controls.
  await tick()
  const phoneInputs = Array.from(
    contentsElement?.querySelectorAll<HTMLInputElement>('input[data-feature-phone]') ??
      [],
  )
  const invalidPhone = phoneInputs.find(
    input => input.value.trim() && !normalizePhoneNumber(input.value),
  )
  if (invalidPhone) {
    adminCtx.setFacet('fields', featureRef, FirstClassResource.feature)
    await tick()
    invalidPhone.focus()
    invalidPhone.dispatchEvent(new Event('invalid', { cancelable: true }))
    invalidPhone.scrollIntoView({ block: 'center', behavior: 'smooth' })
    return
  }
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
  addressLookupRevision += 1
  isAddressLookupLoading = false
  addressLookupMessage = ''
  addressCandidates = []
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
  getProgrammaticFeatureInputEntries(currentFeatureData).map(entry => {
    // Register dynamic paths with the remote form so SvelteKit encodes its form identity.
    const path = entry.name.replace(/\[(\d+)\]/g, '.$1').split('.')
    let field: unknown = formCtx.form.fields
    for (const key of path) field = (field as Record<string, unknown>)[key]
    return (
      field as { as: (type: 'hidden', value: string) => Record<string, string> }
    ).as('hidden', entry.value)
  }),
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

/** Load the requested Feature independently of parent cards and inactive facets.
 * @param ref Feature reference captured at the start of navigation.
 * @returns The loaded Feature; superseded navigation never changes the active form.
 */
async function refreshFeature(
  ref: string = featureRef,
  options: { adoptCreated?: boolean } = {},
): Promise<FeatureGetState> {
  if (ref === NEW_REF) {
    const emptyState: FeatureGetState = null
    commitSettledFeatureState(emptyState)
    featureFormSource = emptyFeatureFormSeed
    hasProgrammaticDirtyChanges = false
    return emptyState
  }

  const expectedRef = options.adoptCreated ? NEW_REF : ref
  const result = (await getFeature({
    ref,
    refKey: 'id',
    meta: { ...adminCtx.view.resources.queryMeta, profile: 'admin' },
  }).catch(() => null)) as FeatureGetState

  // Parent cards and policy hydrate through the independent parent effects below.
  // Commit the requested record immediately; a slow parent must never hold the form inert.
  // Slow responses from a previous Next/Previous navigation must not replace this form.
  if (expectedRef !== featureRef) return result
  commitSettledFeatureState(result)
  if (result?.data) {
    const nextFormSource = toFeatureFormInput(result.data)
    featureFormSource = nextFormSource
    hasProgrammaticDirtyChanges = false
    adminCtx.view.setFeatureById(result.data as never)
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

  selectedProjectById = { ...selectedProjectById, [project.id]: project }
}

/**
 * Caches the hydrated layer record for the current parent-selection UI.
 *
 * @param layer Normalized layer item from a search or fetch result.
 */
function syncSelectedLayer(layer: ParentSectionLayerItem | null | undefined): void {
  if (!layer?.id) return

  selectedLayerById = { ...selectedLayerById, [layer.id]: layer }
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
  void adminCtx.view.getOrganisationById(id).then(organisation => {
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
  void adminCtx.view.getProjectById(id).then(project => {
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
  void adminCtx.view.getLayerById(id).then(layer => {
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

    const organisation = await adminCtx.view.getOrganisationById(organisationIds[0])

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
        meta: { ...adminCtx.view.resources.queryMeta, profile: 'admin' as const },
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
        meta: { ...adminCtx.view.resources.queryMeta, profile: 'admin' as const },
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
    meta: { ...adminCtx.view.resources.queryMeta, profile: 'admin' as const },
  })

  // Projects carry their organisation ID; resolve the owning hub from that resource.
  const ancestors = await Promise.all(
    [...new Set(result.data.map(project => project.organisationId))].map(
      async id => [id, await adminCtx.view.getOrganisationById(id)] as const,
    ),
  )

  const organisations = new Map(ancestors)
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
        resourceHubId: organisations.get(project.organisationId)?.hubId ?? null,
      },
    }),
  ) as ParentProjectRecord[]
}

/********************
 *  VISUAL SECTION CLEANUP
 ************/

// Scrolling leaves the visual height unchanged; only explicit controls resize it.
$effect(() => () => clearVisualSectionReopenState())
</script>

{#if currentFeatureId && feature?.data?.layerId}
  <FeatureIdentityDialog bind:open={identityOpen} kind={identityKind} featureId={currentFeatureId} layerId={feature.data.layerId}
    onApplied={async ids => {
      // Identity commands mutate accepted content outside this form's ordinary save flow.
      await getFeature({ ref: currentFeatureId, refKey: 'id', meta: { ...adminCtx.view.resources.queryMeta, profile: 'admin' } }).refresh()
      await refreshFeature()
      if (ids[0] !== currentFeatureId) await goto(`/admin/features/${encodeURIComponent(ids[0])}`)
    }} />
{/if}


<svelte:window
  bind:innerHeight={editorViewportHeight}
  onpopstate={recoverDraftSearchHistory}
/>

<Main.Root
  onDimensionsChange={(width, height) =>
    adminCtx.view.layout.setMainDimensions(width, height)}
  class={FEATURE_EDITOR_ROOT_CLASS}
>
  <Main.Form
    bind:formEl={contentsElement}
    attrs={{
      ...formCtx.attributes,
      style: `--feature-preview-height:${visualSectionHeight}px`,
    }}
    isReady={true}
    class={FEATURE_EDITOR_FORM_CLASS}
  >
    {#if currentFeatureData.locationNameMode}
      <input
        {...formCtx.form.fields.data.locationNameMode.as(
          'hidden',
          currentFeatureData.locationNameMode,
        )}
      >
    {/if}
    <HiddenInputs inputs={programmaticFeatureInputEntries} />

    {#if showsVisualSection}
      <FormFeatureVisualSection
        expandedHeight={Math.min(1200, editorViewportHeight * 0.5)}
        showImage={!isLocationFacet}
        showControls={!isLocationFacet}
        onHeightChange={height => (visualSectionHeight = height)}
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
        isVisitable={currentFeatureData.isVisitable === true ||
          currentFeatureData.isVisitable === 'true'}
        hasPrevious={Boolean(previousFeatureRef)}
        hasNext={Boolean(nextFeatureRef)}
        onIntangibleChange={value =>
          updateFeatureData(data => ({ ...data, isIntangible: value }))}
        onVisitableChange={value =>
          updateFeatureData(data => ({ ...data, isVisitable: value }))}
        onExpand={expandVisualSection}
        onCollapse={() => (isVisualSectionCollapsed = true)}
        onNavigatePrevious={() => handleFeatureStepperNavigation('previous')}
        onNavigateNext={() => handleFeatureStepperNavigation('next')}
      >
        {#snippet map()}
          <Main.VisualSectionMap isCollapsed={isVisualSectionCollapsed}>
            <div class="relative h-full w-full">
              <FormMapSection
                {pinHighlightRequest}
                onMapReady={controller => (draftMapController = controller)}
                locationCandidates={isLocationFacet ? locationSearchMarkers : []}
                onLocationCandidateSelect={selectLocationMarker}
                showMarker={!isNewFeatureRef || draftHasPin}
                initialCenter={isNewFeatureRef ? DRAFT_MAP_CENTER : initialMapCenter}
                initialZoom={isNewFeatureRef ? 11.5 : DEFAULT_FEATURE_MAP_ZOOM}
                coordinates={featureCoordinates ?? DEFAULT_NEW_FEATURE_COORDINATES}
                coordinateTransitionPending={!isCurrentRefSettled ||
                  ((isCoreFacet || isFieldsFacet) &&
                    presentedVisualFeatureRef !== featureRef)}
                addressMeta={currentFeatureData.addressMeta ?? null}
                draggable={isEditing}
                onCoordinateChange={handlePinDrop}
              />
              {#if isLocationFacet && draftSearchFilterPanel}
                <div
                  class="absolute inset-0 z-20 flex items-end justify-center overflow-hidden bg-black/15"
                  data-location-filter-panel
                >
                  {@render draftSearchFilterPanel()}
                </div>
              {/if}
              {#if isLocationFacet && sharedLocationMapControls}
                <div class="absolute top-3 right-3 z-10" data-location-map-controls>
                  {@render sharedLocationMapControls()}
                </div>
              {/if}
            </div>
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
          />
        {/snippet}
      </FormFeatureVisualSection>
    {/if}

    <Main.Facet
      isVisible={isCoreFacet}
      transition="fade"
      fillHeight={true}
      class={getFeatureEditorFacetClass({
        isVisible: isCoreFacet,
        showsVisualSection,
        isVisualSectionCollapsed,
      })}
      navMode="footer"
      previousAction={buildFacetNavAction('core', 'previous')}
      nextAction={buildFacetNavAction('core', 'next')}
      attrs={{ 'data-facet-id': 'core' }}
    >
      <FormSurface class={`${FEATURE_EDITOR_CONTENT_PAD_CLASS} pt-7! pb-12`}>
        <SectionHeaderPrimitive.Issues issues={formLevelIssues} />
        {#if !showNameFields}
          <div
            class="flex min-h-44 flex-col items-center justify-center gap-4 py-8"
            out:slide={{ duration: prefersReducedMotion.current ? 0 : 180 }}
          >
            <div class="flex flex-wrap justify-center gap-4">
              <Button
                type="button"
                text={m.feature_start_name()}
                color="secondary"
                style="outline"
                size="md"
                iconComponent={AddFeatureIcon}
                onClick={() => (namingChosen = true)}
              />
              <Button
                type="button"
                text={m.feature_start_find_place()}
                color="primary"
                size="md"
                class="text-white!"
                iconComponent={FeatureIcon}
                onClick={startLocationSearch}
              />
            </div>
            <p class="text-muted-foreground text-center">
              {m.feature_start_description()}
            </p>
          </div>
        {:else}
          <div in:slide={{ duration: prefersReducedMotion.current ? 0 : 280 }}>
            <FeatureProfileEditor
              localeState={profileLocaleState}
              onLocaleStateChange={setProfileLocaleState}
              values={currentFeatureData.i18n}
              contextKey={`${profileScope}:${profileEpoch}:${profileNameMode}:${isEditing}`}
              {isEditing}
              loading={!isCurrentRefSettled}
              retainContent={Boolean(currentFeatureId)}
              recordKey={currentFeatureId ?? ''}
              allowDescriptions={featurePresentationPolicy.allowDescriptions}
              inherited={profileNamesLocked}
              policyRequired={featurePresentationPolicy.locationBasedNames}
              offerName={canOfferLocationName}
              locationNames={profileLocationNames}
              onUseName={useLocationName}
              onIndependentName={useIndependentFeatureName}
              onEditLocation={() => goToFacet('location')}
              translate={(source, target, text) =>
                translateContentField({ source, target, text })}
              onTranslated={applyProfileTranslation}
            >
              {#snippet children(field, locale, onEditStart, prefix)}
                {@const key = contentFormKey(locale)}
                {@const language = getContentLocaleRecord(locale, getLocaleKey())}
                {@const config = featureDescriptorFieldConfigs.find(
                  config => config.key === field,
                )!}
                <FormI18nDescriptorFields
                  form={formCtx.form}
                  fields={formCtx.form.fields.data.i18n[key]}
                  locale={key}
                  {isEditing}
                  inline
                  {onEditStart}
                  fieldConfigs={[
                    {
                      ...config,
                      label: prefix,
                      ariaLabel: `${config.label} · ${language.name}`,
                    },
                  ] as never}
                  {isRequiredInPreflight}
                />
              {/snippet}
            </FeatureProfileEditor>
          </div>
        {/if}

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
      </FormSurface>
    </Main.Facet>

    <Main.Facet
      isVisible={isFieldsFacet}
      transition="fade"
      fillHeight={true}
      class={getFeatureEditorFacetClass({
        isVisible: isFieldsFacet,
        showsVisualSection,
        isVisualSectionCollapsed,
      })}
      navMode="footer"
      previousAction={buildFacetNavAction('fields', 'previous')}
      nextAction={buildFacetNavAction('fields', 'next')}
      attrs={{ 'data-facet-id': 'fields' }}
    >
      {#if nonTranslatableItems.length === 0 && translatableSpecifierItems.length === 0}
        <div
          class="flex h-full min-h-72 flex-col items-center justify-center gap-3 px-6 py-12 text-center"
        >
          <h2 class="text-xl font-semibold tracking-tight">
            {m.feature__fields_empty_title()}
          </h2>
          <p class="text-muted-foreground max-w-md text-sm">
            {m.feature__fields_empty_description()}
          </p>
          <div class="mt-2 flex flex-wrap justify-center gap-4">
            {#if projectIdValue}
              <a
                class="text-primary font-medium underline underline-offset-4"
                href={`/admin/projects/${projectIdValue}#fields`}
                >{m.feature__fields_configure_project()}</a
              >
            {/if}
            {#if layerIdValue}
              <a
                class="text-primary font-medium underline underline-offset-4"
                href={`/admin/layers/${layerIdValue}#fields`}
                >{m.feature__fields_configure_layer()}</a
              >
            {/if}
            {#if !layerIdValue}
              <a
                class="text-primary font-medium underline underline-offset-4"
                href="#core"
                >{m.feature__fields_choose_layer()}</a
              >
            {/if}
          </div>
        </div>
      {:else}
        <FormSurface class={`${FEATURE_EDITOR_CONTENT_PAD_CLASS} pt-9! pb-12`}>
          <FormFeatureFields
            {localeKey}
            {locales}
            {nonTranslatableItems}
            {translatableSpecifierItems}
            {isEditing}
            onTranslate={onTranslateTranslatableValues}
            onResetLocale={onResetTranslatableValues}
            onToggleGenAI={togglePropertyI18nValueGen}
            onValueChange={updatePropertyI18nValue}
          />
        </FormSurface>
      {/if}
    </Main.Facet>

    <Main.Facet
      isVisible={isLocationFacet}
      transition="fade"
      fillHeight={true}
      contentClass="h-full overflow-y-auto"
      class={getFeatureEditorFacetClass({
        isVisible: isLocationFacet,
        showsVisualSection,
        isVisualSectionCollapsed,
      })}
      navMode="overlay"
      previousAction={isNewFeatureRef && draftSelectionBefore
        ? {
            text: m.feature_start_back_results(),
            onClick: () => draftSearch?.backToResults(),
          }
        : buildFacetNavAction('location', 'previous')}
      nextAction={buildFacetNavAction('location', 'next')}
      centerAction={isNewFeatureRef && (draftSearchHasResults || draftLocationAccepted)
        ? {
            id: 'draft-manual-entry',
            disabled: !draftHasPin && !draftMapController,
            centerInContent: !draftSearchHasResults && !draftLocationAccepted,
            text: m.feature_search_manual_location(),
            onClick: startManualLocation,
          }
        : null}
      attrs={{ 'data-facet-id': 'location' }}
    >
      {#if mountLocationFacet}
        <FormSurface class="mb-0! flex h-full min-h-0 flex-col overflow-hidden">
          {#key featureRef}
            {#snippet addressEditor(
              locationControl?: Snippet<[Snippet?]>,
              locationContent?: Snippet,
              hideDetails = false,
              showLookup = true,
              lookupOverride?: (query?: string) => void,
              locationActions?: Snippet,
              locationMapControls?: Snippet,
            )}
              <FormFeatureAddress
                fixedMap={true}
                hasLocation={!isNewFeatureRef || draftHasPin}
                coordinatesInLocationControl={isNewFeatureRef && !draftLocationAccepted}
                showMap={false}
                onMapControlsChange={controls => (sharedLocationMapControls = controls)}
                {locationActions}
                {locationMapControls}
                {locationControl}
                {locationContent}
                hideDetails={hideDetails || (isNewFeatureRef && !draftLocationAccepted)}
                showAddressDetails={!isNewFeatureRef || draftHasAddress}
                showDivisions={!isNewFeatureRef || draftHasPin}
                showCoordinates={!isNewFeatureRef ||
                  (draftHasPin && (draftFindMode === 'pin' || draftLocationAccepted))}
                {showLookup}
                show3dAddressOptions={show3dAddressOptions(selectedProject?.flags)}
                address={editorAddress}
                coordinates={featureCoordinates ?? DEFAULT_NEW_FEATURE_COORDINATES}
                {isEditing}
                isLoading={isAddressLookupLoading}
                message={addressLookupMessage ||
                  (isNewFeatureRef &&
                  draftHasAddress &&
                  editorAddress.matchStatus === 'unresolved'
                    ? ''
                    : '')}
                candidates={addressCandidates}
                onSelectCandidate={selectAddressCandidate}
                onCoordinateChange={handleCoordinateChange}
                onLookup={lookupOverride ?? lookupFeatureAddress}
                onChange={updateAddressDraft}
              />
            {/snippet}
            {#if placeLinkError && pendingPlaceLink?.featureId === currentFeatureId}
              <div
                role="alert"
                class="border-border flex shrink-0 flex-wrap items-center gap-3 border-b px-6 py-3 text-sm"
              >
                <span>{m.feature_search_link_pending_saved()}</span>
                <button
                  type="button"
                  class="bg-primary rounded-lg px-3 py-2 text-white"
                  disabled={placeLinkBusy || isDirty}
                  onclick={() => {
                    if (feature?.data) void finishDraftPlaceLink(feature.data)
                  }}
                >
                  {m.feature_search_retry_link()}
                </button>
                <button
                  type="button"
                  class="hover:bg-muted rounded-lg px-3 py-2"
                  disabled={placeLinkBusy}
                  onclick={() => {
                    if (pendingPlaceLink)
                      sessionStorage.removeItem(
                        `feature-place-link:${pendingPlaceLink.featureId}`,
                      )
                    pendingPlaceLink = null
                    draftPlaceSource = null
                    placeLinkError = false
                  }}
                >
                  {m.feature_search_keep_address()}
                </button>
              </div>
            {/if}
            {#if currentFeatureId && feature?.data?.modifiedAt}
              <FeatureLocationSection
                onAddressSelected={updateAddressDraft}
                address={editorAddress}
                featureName={currentFeatureData.i18n?.[getLocaleKey()]?.title ?? ''}
                onMapCandidates={(markers, select) => {
                  locationSearchMarkers = markers
                  selectLocationMarker = select
                }}
                featureId={currentFeatureId}
                projectId={feature.data.projectId}
                coordinates={featureCoordinates ?? DEFAULT_NEW_FEATURE_COORDINATES}
                modifiedAt={feature.data.modifiedAt}
                {isEditing}
                {isDirty}
                onSourceUpdate={async () => {
                  await getFeature({
                    ref: featureRef,
                    refKey: 'id',
                    meta: { ...adminCtx.view.resources.queryMeta, profile: 'admin' },
                  }).refresh()
                  await refreshFeature()
                }}
                onUnlink={async expectedRevision => {
                  const current = feature?.data
                  if (!current || isDirty) return
                  await unlinkFeatureLocation({
                    featureId: current.id,
                    expectedFeatureModifiedAt: current.modifiedAt,
                    expectedRevision,
                  }).updates(
                    getFeature({
                      ref: current.id,
                      refKey: 'id',
                      meta: { ...adminCtx.view.resources.queryMeta, profile: 'admin' },
                    }),
                    getFeatureLocation({ featureId: current.id }),
                    getFeatureDetachedBrands({ featureId: current.id }),
                  )
                  await refreshFeature()
                }}
                reset={currentFeatureData.locationReset}
                onResetFields={reset =>
                  updateFeatureData(data => ({ ...data, locationReset: reset }))}
                brandEdit={currentFeatureData.locationBrandEdit}
                onBrandEdit={edit =>
                  updateFeatureData(data => ({ ...data, locationBrandEdit: edit }))}
              >
                {#snippet children(
                  locationControl,
                  locationContent,
                  hideDetails,
                  showLookup,
                  lookupOverride,
                  locationActions,
                  locationMapControls,
                )}
                  {@render addressEditor(
                    locationControl,
                    locationContent,
                    hideDetails,
                    showLookup,
                    lookupOverride,
                    locationActions,
                    locationMapControls,
                  )}
                {/snippet}
              </FeatureLocationSection>
            {:else}
              <DraftFeatureLocationSearch
                bind:this={draftSearch}
                onFilterPanelChange={panel => (draftSearchFilterPanel = panel)}
                onResultsChange={hasResults => (draftSearchHasResults = hasResults)}
                onResultsEnd={() => {
                  const button = document.getElementById('draft-manual-entry')
                  if (!button) return false
                  button.focus()
                  return document.activeElement === button
                }}
                active={isLocationFacet}
                focusRequest={locationFocusRequest}
                onSelect={selectDraftLocation}
                onPreview={previewDraftLocation}
                onUnlink={() => (draftPlaceSource = null)}
                onAcceptedChange={accepted => (draftLocationAccepted = accepted)}
                onBack={undoDraftLocationSelection}
                hasPin={draftHasPin}
                coordinates={featureCoordinates
                  ? [featureCoordinates[0], featureCoordinates[1]]
                  : undefined}
                onModeChange={mode => (draftFindMode = mode)}
                onManualEntry={startManualLocation}
                onDropPin={draftMapController ? dropDraftPin : undefined}
                onMapCandidates={(markers, select) => {
                  locationSearchMarkers = markers
                  selectLocationMarker = select
                }}
              >
                {#snippet children(searchControl, searchResults, mapControls)}
                  {@render addressEditor(
                    searchControl,
                    searchResults,
                    false,
                    false,
                    undefined,
                    undefined,
                    mapControls,
                  )}
                {/snippet}
              </DraftFeatureLocationSearch>
            {/if}
          {/key}
        </FormSurface>
      {/if}
    </Main.Facet>

    <Main.Facet
      isVisible={isUpdatesFacet}
      transition="fade"
      attrs={{ 'data-facet-id': 'updates' }}
    >
      {#if currentFeatureId &&
        !isNewFeatureRef &&
        (isUpdatesFacet || visitedUpdatesRef === featureRef)}
        {#key currentFeatureId}
          <FeatureRevisionWorkspace featureId={currentFeatureId} {isDirty} refreshVersion={revisionWorkspaceVersion} onPublished={async () => { await refreshFeature(); revisionWorkspaceVersion++ }} />

        {/key}
      {/if}
    </Main.Facet>

    <Main.Facet
      isVisible={isImagesFacet}
      transition="fade"
      fillHeight={true}
      edgeToEdge={true}
      contentClass="h-full overflow-y-auto"
      attrs={{ 'data-facet-id': 'images' }}
    >
      {#if featureImageProviderProps.isValid &&
        (isImagesFacet || visitedImagesRef === featureRef)}
        <ImageProvider model={featureImageProviderModel}>
          <FeatureImageEditor>
            {#snippet textControls(imageId)}
              {#if currentFeatureId}
                {#key currentFeatureId}
                  <FeatureGalleryRevisionEditor featureId={currentFeatureId} {imageId} {isDirty}
                    onSaved={() => { revisionWorkspaceVersion++; toast.success('Image text saved.') }} />
                {/key}
              {/if}
            {/snippet}
          </FeatureImageEditor>
        </ImageProvider>
      {/if}
    </Main.Facet>
  </Main.Form>
</Main.Root>
