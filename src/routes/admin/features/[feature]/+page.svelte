<script lang="ts">
import { translationPromptAttributes } from '#lib/forms/translationReview.js'
import FeatureTitleSource from '#lib/bits/patterns/forms/featureIntent/FeatureTitleSource.svelte'
import FeatureRuleTitleField from '#lib/bits/patterns/forms/featureIntent/FeatureRuleTitleField.svelte'
import {
  featureNameTextValue,
  generateFeatureName,
  nameBooleanValue,
  TARGET_CONTEXTS,
  TargetContextSchema,
  targetLocationKinds,
  targetSuggestionKinds,
  type TargetContext,
} from '#lib/features/locationPolicy.js'

import FeatureSetup from '#lib/bits/patterns/forms/featureSetup/FeatureSetup.svelte'
import type {
  FeatureSetupResults,
  FeatureSetupScope,
} from '#lib/bits/patterns/forms/featureSetup/featureSetup.types.js'
import type { FeatureType } from '#lib/features/intents.js'

// DEFERRED FACETS
import Deferred from '#lib/bits/custom/deferred/Deferred.svelte'
// IMAGE PUBLICATION
import { refreshRemoteQuery } from '#lib/remote/index.js'
import PublishUnclassifiedImagesDialog from '#lib/bits/patterns/images/PublishUnclassifiedImagesDialog.svelte'

// REVISION WORKSPACE
import FeatureIdentityDialog from '#lib/bits/patterns/revisionHistory/FeatureIdentityDialog.svelte'

import FeatureProfileEditor from '#lib/bits/patterns/forms/featureLocation/FeatureProfileEditor.svelte'
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
import DraftLocationNameFields from '#lib/bits/patterns/forms/featureLocation/DraftLocationNameFields.svelte'
import LocationVisibilitySelect from '#lib/bits/patterns/forms/featureLocation/LocationVisibilitySelect.svelte'
import LocationControlsInfo from '#lib/bits/patterns/forms/featureLocation/LocationControlsInfo.svelte'
// MAP STREET MATCHING
import { loadAddressNames, setAddressName } from '#lib/addresses/nameCatalogue.js'
import { matchStreetHints, type NearbyStreet } from '#lib/map/nearbyStreets.js'
import { isRangeProperty } from '#lib/properties/range.js'
import { show3dAddressOptions } from '#lib/projects/flags.js'
import type { RemoteQuery, RemoteQueryOverride } from '$app/server'

// TRANSLATION PROVENANCE
import type { AutomaticTranslation } from '#lib/i18n/automatic.js'
// SVELTE
import { goto, pushState, replaceState, snapshot } from '$app/navigation'

import { page } from '$app/state'
import { untrack, tick, type Snippet } from 'svelte'
import { fade, slide } from 'svelte/transition'
import { prefersReducedMotion } from 'svelte/motion'
import { normalizePhoneNumber } from '#lib/utils/phone-property.js'

// TOAST
import { toast } from 'svelte-sonner'
// FORM ERRORS
import { submissionErrorMessage } from '#lib/forms/submissionError.js'
// FEATURE AUTHORING POLICY
import { resolveFeaturePresentationPolicy } from '#lib/features/presentationPolicy.js'
// PUBLICATION
import { canPreviewPublication } from '#lib/publication/permissions.js'
import { publicationPreviewUrl } from '#lib/publication/preview.js'
// ADAPTERS
import { useImageProviderModel } from '#lib/adapters/image/index.js'
// I18N
import {
  getI18n,
  getLocaleKey,
  getLocaleOrder,
  m,
  toLocaleKey,
  translateI18nFields,
} from '#lib/i18n.js'
// SERVICES
import { createDevFormDraft } from '#lib/client/devFormDraft.js'
import {
  captureFormNavigationSnapshot,
  isCurrentFormNavigationSnapshot,
  invalidateFormNavigationSnapshots,
  type FormNavigationSnapshot,
} from '#lib/client/formNavigationSnapshot.js'
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
} from '#lib/api/feature.remote.js'
import { getLayer, getLayers } from '#lib/api/layer.remote.js'
import {
  getOrganisation,
  getOrganisationsWhichHaveLayers,
} from '#lib/api/organisation.remote.js'
import { getProjectsWhichHaveLayers } from '#lib/api/project.remote.js'
// SCHEMA
import { FeaturePreflightFormData } from '#lib/db/zod/schema/feature.form.js'
// FACTORIES
import { configureForm } from '#lib/factories.svelte.js'
// BITS
import { cx } from '#lib/bits/utils.js'
import FormFeatureFields from '#lib/bits/patterns/forms/formFeatureFields/FormFeatureFields.svelte'
import FormFeatureParentSection from '#lib/bits/patterns/forms/formFeatureParentSection/FormFeatureParentSection.svelte'
import FormFeatureVisualSection from '#lib/bits/custom/form/src/formFeatureVisualSection/FormFeatureVisualSection.svelte'

import FormI18nDescriptorFields from '#lib/bits/patterns/forms/formI18nSection/components/FormI18nDescriptorFields.svelte'
import FormMapSection from '#lib/bits/patterns/forms/formMapSection/FormMapSection.svelte'
import * as Main from '#lib/bits/custom/main/index.js'
import {
  createFeatureParentSearchPrisms,
  createFeatureParentSectionController,
  filterCreatableParentProjects,
  featureCreationSourceLayerId,
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
} from '#lib/api/location.remote.js'
import {
  addressBuildingNames,
  addressLocationNames,
  localIdentityFromAddress,
} from '#lib/locations/addressIdentity.js'
import {
  linkDraftLocalLocation,
  type DraftLocalLocationIntent,
} from '#lib/locations/linkDraftLocalLocation.js'
import {
  BuildingSourceSchema,
  type BuildingSource,
} from '#lib/locations/buildingSource.js'
import { LocalLocationInputSchema } from '#lib/locations/local.js'
import {
  AccessibilityDraftSchema,
  type AccessibilityDraft,
} from '#lib/locations/accessibility.js'
import { saveDraftAccessibility } from '#lib/locations/saveDraftAccessibility.js'
import { linkDraftPlace } from '#lib/locations/linkDraftPlace.js'
import DraftFeatureLocationSearch from '#lib/bits/patterns/forms/featureLocation/DraftFeatureLocationSearch.svelte'
import { Button } from '#lib/bits/core/index.js'
import FeatureLocationSection from '#lib/bits/patterns/forms/featureLocation/FeatureLocationSection.svelte'
import {
  addressCandidatePoint,
  nearbyAddressCandidates,
} from '#lib/addresses/nearbyCandidates.js'
import { recoverAddressNumber } from '#lib/addresses/recoverAddressNumber.js'
import {
  missingMapParts,
  applyMapMissingParts,
  type MapMissingParts,
} from '#lib/addresses/mapMissingParts.js'
import LocationMoveConfirmation from '#lib/bits/patterns/forms/featureLocation/LocationMoveConfirmation.svelte'
import {
  resolveMapAddressChange,
  type MapAddressChange,
} from '#lib/locations/resolveMapAddressChange.js'
import { locationDistance } from '#lib/locations/searchPresentation.js'
import { mapAddressDisagreements } from '#lib/addresses/mapAddressDisagreement.js'
import { exactAddressChangeMatch } from '#lib/addresses/mapAddressChange.js'
import MapAddressConflict from '#lib/bits/patterns/forms/formFeatureAddress/MapAddressConflict.svelte'
import MapAddressSuggestion from '#lib/bits/patterns/forms/formFeatureAddress/MapAddressSuggestion.svelte'
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
import FeatureTypeIcon from '#lib/bits/custom/icon/FeatureTypeIcon.svelte'
import AddFeatureIcon from 'virtual:icons/proicons/add'
// CONFIG
import { NEW_REF, NEW_TITLE } from '#lib/constants.js'
// ENUMS
import { FirstClassResource } from '#lib/enums.js'
// BITS COMPONENTS
import FeatureVisualSkeleton from '#lib/bits/patterns/forms/formSkeleton/FeatureVisualSkeleton.svelte'
import LoadingSkeleton from '#lib/bits/custom/skeleton/LoadingSkeleton.svelte'
import HistorySkeleton from '#lib/bits/patterns/revisionHistory/HistorySkeleton.svelte'
import ImageWorkspaceSkeleton from '#lib/bits/patterns/images/ImageWorkspaceSkeleton.svelte'
// TYPES
import type { LocationSearchMarker } from '#lib/locations/searchPresentation.js'
import type { Point } from 'geojson'
import type { DraftLocationSearchProgress } from '#lib/bits/patterns/forms/featureLocation/draftLocationSearch.types.js'

import type { FacetType } from '#lib/context/facets.js'
import type { HeaderTransitionSnapshot } from '#lib/client/services/formHeader.types.js'
import type { Id, Locale } from '#lib/types.js'
import type { ImageCtxEnvelope } from '#lib/db/zod/schema/image.types.js'
import type {
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
// - development draft restoration and persistence
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
// - setProfileLocaleState
// - applyProfileTranslation
// - onTranslateTranslatableValues
// - onResetTranslatableValues
//
// GEOMETRY + RESOURCE STATE TOGGLES
// - editorAddress
// - updateAddressDraft
// - lookupFeatureAddress
// - selectAddressCandidate
// - acceptMapAddressChange
// - applyAcceptedMapAddressChange
// - confirmMapAddressChange
// - startLocationSearch
// - startManualLocation
// - selectDraftLocation
// - undoDraftLocationSelection
// - recoverDraftSearchHistory
// - handlePinDrop
// - cancelMapAddressMove
// - handleCoordinateChange
// - handleManualCoordinateChange
// - handleFeatureStateToggle
// - captureFeatureAction
// - onPublishToggle
// - onPreview
// - onDeleteToggle
//
// FORM ACTIONS
// - revalidateAfterProgrammaticChange
// - onSubmit
// - resetNewFeatureFlow
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
// Successful creation replaces the URL shallowly while keeping this editor mounted.
const featureRef = $derived(
  (page.shallow?.params?.feature ?? page.params.feature) as string,
)
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

/** Navigate within the mounted editor and retain a browser history entry.
 * @param facet Destination tab. @returns Nothing.
 */
function goToFacet(facet: FacetType): void {
  if (setupPending && !(setupStep === 3 && facet === 'location')) return
  if ((facet === 'images' || facet === 'updates') && isNewFeatureRef) return
  if (facet === 'fields' && (!hasSelectedLayer || !ensureDraftPin())) return
  if (
    facet === 'location' &&
    (needsLayerSelection ||
      setupQuestionsPending ||
      (isNewFeatureRef && !selectedFeatureType))
  )
    return
  if (facet === activeFacet) return
  // The current route ref also covers unsaved Features, which have no cache record.
  const href = `/admin/features/${encodeURIComponent(featureRef)}#${facet}`
  adminCtx.setFacet(facet, featureRef, FirstClassResource.feature)
  void goto(href, {
    shallow: true,
    state: page.state,
    reset: false,
    replace: false,
  })
}

const buildFacetNavAction = createFacetNavActionBuilder<FacetType>({
  resourceType: FirstClassResource.feature,
  getFacetOrder: () => featureFacetOrder,
  getActiveFacet: () => activeFacet as FacetType,
  navigateToFacet: goToFacet,
  isFacetDisabled: facet =>
    (facet === 'fields' &&
      (!hasSelectedLayer || (isNewFeatureRef && !draftLocationReady))) ||
    (facet === 'location' &&
      (needsLayerSelection ||
        setupPending ||
        (isNewFeatureRef && !selectedFeatureType))),
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
  const ref = featureRef
  // Creation hydrates the saved record before changing the URL, so keep its form intact.
  if (untrack(() => settledFeatureRef === ref && committedFeature?.data?.id === ref))
    return
  const resolvedFacetTabsSnapshot = untrack(() => facetTabs)
  return editorCtrl.syncRouteAndLoad({
    ref,
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
          !(
            nextRef === NEW_REF &&
            (currentFacet === 'images' || currentFacet === 'updates')
          ) &&
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
    .filter(
      facet =>
        !setupPending &&
        (!isNewFeatureRef || (facet.ref !== 'images' && facet.ref !== 'updates')),
    )
    .map(facet => ({
      ...facet,
      disabled:
        (facet.ref === 'fields' && !hasSelectedLayer) ||
        (facet.ref === 'location' &&
          (needsLayerSelection ||
            setupPending ||
            (isNewFeatureRef && !selectedFeatureType))) ||
        Boolean(facet.disabled),
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
let setupStep = $state(0)
$effect(() => {
  if (!isNewFeatureRef) setupStep = 0
})
const setupQuestionsPending = $derived(isNewFeatureRef && setupStep < 3)
const setupPending = $derived(isNewFeatureRef && setupStep < 4)
let namingChosen = $state(false)
let locationFocusRequest = $state(0)
const DRAFT_MAP_CENTER: [number, number] = [114.17, 22.3]
const DEFAULT_FEATURE_MAP_ZOOM = 19
let draftHasPin = $state(false)
let draftHasAddress = $state(false)
let editorViewportHeight = $state(1040)
// Share responsive sizing with the loading preview, including taller desktop windows.
const profileVisualHeight = $derived(
  Math.max(64, Math.min(720, editorViewportHeight * 0.55)),
)
let selectedFeatureType = $state<FeatureType | null>(null)
let selectedTargetContext = $state<TargetContext | null>(null)
let missingLocationAcknowledged = $state(false)
let showMissingLocationPrompt = $state(false)
const availableTargetContexts = $derived(
  selectedFeatureType?.targetContexts ??
    TARGET_CONTEXTS.filter(kind => selectedFeatureType?.locationKinds.includes(kind)),
)
const effectiveTargetContext = $derived.by((): TargetContext | null => {
  if (selectedTargetContext || isNewFeatureRef) return selectedTargetContext
  const retained = TargetContextSchema.safeParse(currentFeatureData.targetContext)
  return retained.success ? retained.data : null
})
const eligibleTargetKinds = $derived(
  effectiveTargetContext
    ? targetLocationKinds(effectiveTargetContext)
    : (selectedFeatureType?.targetContexts?.flatMap(targetLocationKinds) ??
        selectedFeatureType?.locationKinds),
)
/** Select physical intent independently of any broader matched record. @param context Intended target. @returns Nothing. */
function chooseTargetContext(context: TargetContext): void {
  selectedTargetContext = context
  updateFeatureData(data => ({ ...data, targetContext: context }))
}

/** Retain placement while changing editorial intent; incompatible associations need explicit reselection.
 * @param type Effective server-provided definition, or null while loading. @returns Nothing.
 */
function chooseFeatureType(type: FeatureType | null): void {
  if (isNewFeatureRef && !type && setupStep > 1) setupStep = 1
  selectedFeatureType = type
  if (
    !type ||
    !(type.targetContexts ?? TARGET_CONTEXTS).includes(selectedTargetContext!)
  )
    selectedTargetContext = null
  updateFeatureData(data => ({
    ...data,
    featureType: type?.id ?? undefined,
    kind: type?.kind,
    targetContext: selectedTargetContext,
    associationRelation: type?.relation ?? 'locatedAt',
  }))
  if (type) {
    draftFindMode = type.start
    if (!draftLocalKind && !draftPlaceSource)
      draftLocalNameMode =
        (type.nameRule?.base ??
          (type.relation === 'represents' ? 'location' : 'feature')) === 'location'
          ? 'inherit'
          : 'independent'
  }
}
let draftFindMode = $state<'search' | 'pin'>('search')
let pinHighlightRequest = $state(0)
// Inactive facets are deferred until visited, then retained so switching tabs preserves drafts.
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
  | {
      adoptAddressChange: (address: FeatureAddress) => void
      syncSelectedAddress: (address: FeatureAddress) => void
      resolveAssociation: (
        address: FeatureAddress,
        names: Record<string, string>,
      ) => Promise<void>
      backToResults: () => void
      addManualLocation: () => void
      getProgress: () => DraftLocationSearchProgress
      restoreProgress: (progress: DraftLocationSearchProgress | null) => void
    }
  | undefined = $state()
let draftSearchFilterPanel: Snippet | undefined = $state()
let draftSearchHasResults = $state(false)
let draftResolutionPending = $state(false)
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
  draftSelectionSaved = false
})

$effect(() => {
  if (isNewFeatureRef && isLocationFacet && !needsLayerSelection) namingChosen = true
})

/** Open draft Location discovery and request focus after the facet becomes visible.
 * @returns Nothing.
 */
function startLocationSearch(): void {
  if (isNewFeatureRef && !selectedTargetContext) {
    toast.info('Choose where this feature is located first.')
    goToFacet('core')
    return
  }
  goToFacet('location')
  locationFocusRequest++
}

/** Open manual address entry with a marker so geographic divisions can resolve.
 * @returns Nothing; an existing pin is preserved, otherwise the visible map centre supplies it.
 */
function startManualLocation(): void {
  draftAccessibility = undefined
  draftLocalKind = undefined
  // Wait for the map instead of fabricating a position before its camera is available.
  if (!draftHasPin && !dropDraftPin()) return
  draftPlaceSource = null
  draftSelectionBefore = null
  pinHighlightRequest += 1
  draftSearch?.addManualLocation()
  draftHasAddress = true
  draftLocationAccepted = !selectedTargetContext
}

let draftReplacementLocationId = $state<string | undefined>()
let draftAccessibility = $state<AccessibilityDraft | undefined>()
let draftLocationAccepted = $state(false)
let draftSelectionSaved = $state(false)
let draftAddressIdentity = $state<MapAddressChange['identity']>()
let draftLocalKind = $state<
  | 'address'
  | 'premises'
  | 'building'
  | 'building_part'
  | 'infrastructure'
  | 'built'
  | 'structure'
  | 'landform'
  | 'coastal_feature'
  | 'water_feature'
  | 'service_point'
  | 'street'
  | 'natural'
  | 'establishment'
  | undefined
>()
let draftCatalogueBuilding = $state(false)
let draftBuildingSource = $state<BuildingSource | undefined>()
let buildingAssociationRequestSequence = 0
let buildingAssociationRequest = $state<{
  requestId: number
  source: BuildingSource
  address: FeatureAddress
  names: Record<string, string>
} | null>(null)
let draftVisibilityOverride = $state<'shared' | 'exclusive' | undefined>()
let organisationVisibilityReady = $state(false)
let organisationVisibilityFailed = $state(false)
let organisationLocationVisibility = $state<'shared' | 'exclusive'>('shared')
const draftLocationVisibility = $derived(
  draftVisibilityOverride ?? organisationLocationVisibility,
)

// Resolve defaults without overwriting a deliberate draft choice or accepting stale parent responses.
$effect(() => {
  const id = selectedProject?.organisationId ?? organisationIdValue
  organisationLocationVisibility = 'shared'
  organisationVisibilityReady = false
  organisationVisibilityFailed = false
  if (!isNewFeatureRef || !id) {
    organisationVisibilityReady = true
    return
  }
  let current = true
  void getOrganisation({
    ref: id,
    refKey: 'id',
    meta: { ...adminCtx.view.resources.queryMeta, profile: 'detail' },
  })
    .then(response => {
      if (!current) return
      if (!response.data) {
        organisationVisibilityFailed = true
        return
      }
      organisationLocationVisibility =
        response.data.defaultLocationVisibility ?? 'shared'
      organisationVisibilityReady = true
    })
    .catch(() => {
      if (current) organisationVisibilityFailed = true
    })
  return () => {
    current = false
  }
})

let draftLocationNames = $state<Record<string, string>>({})
let draftLocalNameMode = $state<'independent' | 'inherit'>('inherit')
let pendingLocalLink = $state<DraftLocalLocationIntent | null>(null)
let draftPlaceSource = $state<{
  ssId: string
  resourceReleaseId: string
  nameMode?: 'independent' | 'inherit'
} | null>(null)
let pendingPlaceLink = $state<{
  replacementLocationId?: string
  replacementRevision?: string
  accessibility?: AccessibilityDraft
  featureId: string
  ssId: string
  resourceReleaseId: string
  nameMode?: 'independent' | 'inherit'
} | null>(null)
let placeLinkBusy = $state(false)
let placeLinkError = $state(false)

/** Build the local entity from the current reviewed names and address.
 * @returns Validated creation input with selected visibility; missing names or coordinates fail before Feature submission.
 */
function draftLocalInput(): ReturnType<typeof localIdentityFromAddress> {
  if (!draftLocalKind) throw new Error('No local identity selected')
  if (!draftVisibilityOverride && !organisationVisibilityReady)
    throw new Error(m.location_visibility_default_unavailable())
  return localIdentityFromAddress(
    draftLocalKind,
    // A building has one editable name: its reviewed address component.
    draftLocalKind === 'building'
      ? addressBuildingNames(editorAddress)
      : draftLocationNames,
    editorAddress,
    draftLocationVisibility,
  )
}

/** Complete an explicitly requested association after the Feature has an ID.
 * @param saved Persisted identity and concurrency token. @returns Completion.
 * @remarks Creation remains successful if import/link fails; retain a retryable intent
 * against the created ID so retry can never create a second Feature.
 */
async function finishDraftPlaceLink(saved: {
  id: string
  modifiedAt: string
}): Promise<void> {
  if (draftLocalKind || pendingLocalLink?.featureId === saved.id) {
    placeLinkBusy = true
    placeLinkError = false
    try {
      const intent =
        pendingLocalLink?.featureId === saved.id
          ? pendingLocalLink
          : {
              featureId: saved.id,
              projectId: projectIdValue,
              replacementLocationId: draftReplacementLocationId,
              accessibility: draftAccessibility,
              nameMode: draftLocalNameMode,
              input: draftAddressIdentity ? undefined : draftLocalInput(),
              buildingSource: draftBuildingSource,
              identity: draftAddressIdentity,
            }
      const retain = (value: DraftLocalLocationIntent): void => {
        pendingLocalLink = value
        sessionStorage.setItem(`feature-local-link:${saved.id}`, JSON.stringify(value))
      }
      retain(intent)
      await linkDraftLocalLocation(intent, saved.modifiedAt, retain)
      await saveDraftAccessibility(saved.id, intent.accessibility)
      draftAccessibility = undefined
      sessionStorage.removeItem(`feature-local-link:${saved.id}`)
      pendingLocalLink = null
      draftLocalKind = undefined
      draftReplacementLocationId = undefined
      draftAddressIdentity = undefined
    } catch (cause) {
      placeLinkError = true
      toast.error(
        cause instanceof Error && cause.message === 'ACCESSIBILITY_REVIEW_REQUIRED'
          ? m.accessibility_draft_review()
          : m.feature_search_link_failed(),
      )
    } finally {
      placeLinkBusy = false
    }
    return
  }
  const source =
    pendingPlaceLink?.featureId === saved.id ? pendingPlaceLink : draftPlaceSource
  if (!source) return
  pendingPlaceLink = {
    replacementLocationId:
      draftReplacementLocationId ?? pendingPlaceLink?.replacementLocationId,
    replacementRevision: pendingPlaceLink?.replacementRevision,
    accessibility:
      pendingPlaceLink?.featureId === saved.id
        ? pendingPlaceLink.accessibility
        : draftAccessibility,
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
      replacementLocationId: pendingPlaceLink.replacementLocationId,
      replacementRevision: pendingPlaceLink.replacementRevision,
      featureId: saved.id,
      modifiedAt: saved.modifiedAt,
      ssId: source.ssId,
      resourceReleaseId: source.resourceReleaseId,
      nameMode: source.nameMode,
    })
    await saveDraftAccessibility(saved.id, pendingPlaceLink.accessibility)
    draftAccessibility = undefined
    sessionStorage.removeItem(`feature-place-link:${saved.id}`)
    pendingPlaceLink = null
    draftPlaceSource = null
    draftReplacementLocationId = undefined
    await getFeatureLocation({ featureId: saved.id }).refresh()
  } catch (cause) {
    placeLinkError = true
    toast.error(
      cause instanceof Error && cause.message === 'ACCESSIBILITY_REVIEW_REQUIRED'
        ? m.accessibility_draft_review()
        : m.feature_search_link_failed(),
    )
  } finally {
    placeLinkBusy = false
    draftPlaceSource = null
  }
}

$effect(() => {
  if (isNewFeatureRef || typeof sessionStorage === 'undefined') return
  try {
    const localRaw = sessionStorage.getItem(`feature-local-link:${featureRef}`)
    if (localRaw) {
      const value = JSON.parse(localRaw)
      const input = LocalLocationInputSchema.safeParse(value.input)
      if (
        value.featureId === featureRef &&
        typeof value.projectId === 'string' &&
        (input.success || (value.input === undefined && value.identity)) &&
        (value.buildingSource === undefined ||
          BuildingSourceSchema.safeParse(value.buildingSource).success) &&
        (value.accessibility === undefined ||
          AccessibilityDraftSchema.safeParse(value.accessibility).success) &&
        (!value.identity ||
          (typeof value.identity.locationId === 'string' &&
            typeof value.identity.revisionId === 'string'))
      ) {
        pendingLocalLink = { ...value, input: input.success ? input.data : undefined }
        placeLinkError = true
      }
    }
    const raw = sessionStorage.getItem(`feature-place-link:${featureRef}`)
    if (!raw) return
    const intent = JSON.parse(raw)
    if (
      intent.featureId === featureRef &&
      typeof intent.ssId === 'string' &&
      typeof intent.resourceReleaseId === 'string' &&
      (intent.accessibility === undefined ||
        AccessibilityDraftSchema.safeParse(intent.accessibility).success)
    ) {
      pendingPlaceLink = intent
      placeLinkError = true
    }
  } catch {
    /* Invalid local retry state is not an association. */
  }
})

/** Preview the selected candidate without changing any Feature values.
 * @param result Source candidate.
 * @param preserveZoom Keep the current zoom when switching comparison pins.
 * @returns Nothing.
 */
function previewDraftLocation(
  result: { address: FeatureAddress },
  preserveZoom = false,
): void {
  if (result.address.coordinates)
    draftMapController?.flyTo({
      center: result.address.coordinates as [number, number],
      ...(preserveZoom ? {} : { zoom: 17 }),
      duration: prefersReducedMotion.current ? 0 : 900,
    })
}

/** Restore the search map to 35% of the visible editor, independent of previous review height.
 * @returns Nothing; scrollable form content does not enlarge the viewport budget.
 */
function restoreLocationSearchMap(): void {
  isVisualSectionCollapsed = false
  const top = Math.max(0, contentsElement?.getBoundingClientRect().top ?? 0)
  const availableHeight = Math.max(0, editorViewportHeight - top)
  featureVisualSection?.restoreAfterFit(Math.round(availableHeight * 0.35))
}

/** Use source names as an editable starting point without replacing authored titles.
 * @param result Explicitly selected search preview. @returns Nothing.
 * @remarks Place linking is deferred until successful creation supplies a Feature ID.
 */
function selectDraftLocation(result: {
  address: FeatureAddress
  names: Record<string, string>
  kind?:
    | 'establishment'
    | 'premises'
    | 'building'
    | 'building_part'
    | 'infrastructure'
    | 'built'
    | 'structure'
    | 'landform'
    | 'coastal_feature'
    | 'water_feature'
    | 'service_point'
    | 'street'
    | 'natural'
    | 'address'
  localKind?:
    | 'address'
    | 'premises'
    | 'building'
    | 'building_part'
    | 'infrastructure'
    | 'built'
    | 'structure'
    | 'landform'
    | 'coastal_feature'
    | 'water_feature'
    | 'service_point'
    | 'street'
    | 'natural'
    | 'establishment'
  nameMode?: 'independent' | 'inherit'
  source?: {
    ssId: string
    resourceReleaseId: string
    nameMode?: 'independent' | 'inherit'
  }
  buildingSource?: BuildingSource
  identity?: { locationId: string; revisionId: string }
  associationConfirmed?: boolean
}): void {
  featureVisualSection?.restoreAfterFit(320)
  draftAccessibility = undefined
  draftAddressIdentity = result.identity
  const previousSelection = draftSelectionBefore
  // Catalogue buildings supply address evidence, so persist a local building without a Places import.
  draftCatalogueBuilding =
    result.kind === 'building' &&
    !result.source &&
    Object.keys(addressBuildingNames(result.address)).length > 0
  draftBuildingSource = result.kind === 'building' ? result.buildingSource : undefined
  draftLocalKind =
    result.localKind ??
    (result.kind === 'address'
      ? 'address'
      : draftCatalogueBuilding
        ? 'building'
        : undefined)
  if (result.associationConfirmed) draftLocationNames = { ...result.names }
  else if (
    !draftSelectionBefore ||
    (draftLocalKind && !Object.values(draftLocationNames).some(value => value.trim()))
  ) {
    draftLocationNames =
      draftLocalKind === 'building' ? addressBuildingNames(result.address) : {}
  }
  draftLocalNameMode = isNewFeatureRef
    ? (selectedFeatureType?.nameRule?.base ??
        (selectedFeatureType?.relation === 'represents' ? 'location' : 'feature')) ===
      'location'
      ? 'inherit'
      : 'independent'
    : featurePresentationPolicy.locationBasedNames ||
        currentFeatureData.locationNameMode === 'inherit'
      ? 'inherit'
      : (result.nameMode ?? 'independent')
  draftPlaceSource =
    result.kind === 'establishment' && result.source
      ? { ...result.source, nameMode: draftLocalNameMode }
      : null
  // Type changes and relinking must retain edits and the original reset snapshot.
  if (draftSelectionBefore && draftLocationAccepted) {
    if (
      (draftBuildingSource || result.associationConfirmed) &&
      result.address.coordinates
    )
      handleCoordinateChange(result.address.coordinates)
    if (result.associationConfirmed) updateAddressDraft(result.address)
    return
  }
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
            draftLocalNameMode === 'inherit'
              ? Object.entries(result.names).find(
                  ([tag]) => canonicalContentTag(tag) === canonicalContentTag(locale),
                )?.[1] || ''
              : value.title || '',
        },
      ]),
    ) as typeof data.i18n,
  }))
  if (previousSelection) draftSelectionBefore = previousSelection
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
  draftVisibilityOverride = undefined
  draftLocationNames = {}
  draftCatalogueBuilding = false
  draftBuildingSource = undefined
  draftAddressIdentity = undefined
  draftLocalNameMode = 'independent'
  draftAccessibility = undefined
  draftLocalKind = undefined
  draftPlaceSource = null
  const before = draftSelectionBefore
  if (!before) return
  addressLookupRevision++
  isAddressLookupLoading = false
  addressLookupMessage = ''
  addressCandidates = []
  streetCandidates = []
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

/** Require deliberate map placement while allowing coordinate-only Features.
 * @returns Whether the user has supplied the required placement.
 */
function ensureDraftPin(): boolean {
  if (!isNewFeatureRef || draftLocationReady) return true
  goToFacet('location')
  toast.error(
    draftHasPin
      ? m.feature_search_identity_required()
      : m.feature_start_choose_position(),
  )
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
  const available = Boolean(
    currentFeatureId && isCurrentRefLoaded && !feature?.data?.isArchived,
  )
  headerCtrl.setTitleMenuItems(
    available
      ? [
          {
            label: 'Split',
            disabled: isDirty,
            onSelect: () => {
              identityKind = 'split'
              identityOpen = true
            },
          },
          {
            label: 'Merge',
            disabled: isDirty,
            onSelect: () => {
              identityKind = 'merge'
              identityOpen = true
            },
          },
        ]
      : [],
  )
  return () => headerCtrl.setTitleMenuItems([])
})

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
let setupProgressHeight = $state(0)
let visualSectionHeight = $state(520)
let featureVisualSection = $state<FormFeatureVisualSection>()
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
    hasIssues:
      visibleAllIssues.length > 0 ||
      draftResolutionPending ||
      mapAddressChangeBusy ||
      Boolean(pendingMapAddressChange),
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
      disableSave: setupPending,
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

// Refresh preview availability when the saved feature or the actor's scope changes.
$effect(() => {
  editorCtrl.wireHeaderHandlers({
    reset: onReset,
    submit: onSubmit,
    togglePublish: onPublishToggle,
    preview: canPreview ? onPreview : null,
    toggleDelete: onDeleteToggle,
  })
})

$effect(() => {
  if (!isCurrentRefSettled) return
  // The resource settles before configureForm hydrates its fields; wait for this form's identity.
  if (!isNewFeatureRef && currentFormValue.meta?.id !== featureRef) return
  // Keep direct links and parent removal behind the same prerequisite as facet navigation.
  if (
    !(activeFacet === 'fields' && !hasSelectedLayer) &&
    !(activeFacet === 'location' && needsLayerSelection)
  )
    return
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
let revisionWorkspaceVersion = $state(0)

let suppressFormLevelIssues = $state(false)
const initialEmptyFeatureFormSeed = toEmptyFeatureFormInput()
let emptyFeatureFormSeed = $state<FeatureFormInput>(initialEmptyFeatureFormSeed)
let featureFormSource = $state<FeatureFormInput>(initialEmptyFeatureFormSeed)

const configuredFeatureForm = configureForm(() => ({
  form: featureForm as never,
  onsubmit: (({ data }: { data: FeatureFormInput }) => {
    if (setupPending) {
      toast.info('Complete the layer, feature type and location target steps first.')
      return false
    }
    if (isNewFeatureRef && !selectedFeatureType) {
      toast.error('Choose a feature type before saving.')
      goToFacet('core')
      return false
    }
    if (
      isNewFeatureRef &&
      selectedFeatureType &&
      (draftLocalKind || draftPlaceSource)
    ) {
      const kind = draftLocalKind ?? 'establishment'
      if (!eligibleTargetKinds?.some(allowed => allowed === kind)) {
        toast.error(
          'Choose a location permitted for this feature type, or remove the association.',
        )
        goToFacet('location')
        return false
      }
    }
    if (
      isNewFeatureRef &&
      selectedFeatureType?.unresolvedMode !== 'silent' &&
      !draftLocationAccepted &&
      !missingLocationAcknowledged
    ) {
      showMissingLocationPrompt = true
      goToFacet('core')
      return false
    }
    if (
      draftResolutionPending ||
      mapAddressChangeBusy ||
      pendingMapAddressChange ||
      !ensureDraftPin()
    )
      return false
    if (draftLocalKind && !draftAddressIdentity) {
      try {
        draftLocalInput()
      } catch {
        toast.error(
          !draftVisibilityOverride && !organisationVisibilityReady
            ? m.location_visibility_default_unavailable()
            : m.feature_search_identity_required(),
        )
        adminCtx.setFacet('location', featureRef, FirstClassResource.feature)
        return false
      }
    }
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
    refreshResource: async ({ data, success, result }) => {
      // Every successful save invalidates older history drafts before refreshing can fail.
      if (success) {
        invalidateFormNavigationSnapshots(navigationDraftScope)
        pendingNavigationRestore = null
      }
      if (
        success &&
        result &&
        typeof result === 'object' &&
        'revisionApplied' in result
      ) {
        await refreshFeature()
        hasProgrammaticDirtyChanges = false
        revisionWorkspaceVersion++
        return
      }
      // Persistence ends discovery undo, even while linking or refreshing the saved record is pending.
      if (success) {
        savedLocationNameDraft = null
        draftSelectionSaved = true
        if (import.meta.env.DEV && isNewFeatureRef) devDraftStore.clear()
        draftSelectionBefore = null
      }
      if (
        success &&
        (draftPlaceSource || draftLocalKind) &&
        result &&
        typeof result === 'object' &&
        'data' in result
      ) {
        const saved = result.data as { id?: unknown; modifiedAt?: unknown }
        if (typeof saved?.id === 'string' && typeof saved.modifiedAt === 'string')
          await finishDraftPlaceLink({ id: saved.id, modifiedAt: saved.modifiedAt })
      }
      // Adopt the persisted ID without remounting the editor or its shared success toast.
      if (
        success &&
        data.meta?.mode === 'create' &&
        isNewFeatureRef &&
        result &&
        typeof result === 'object' &&
        'data' in result
      ) {
        const saved = result.data as { id?: unknown } | null
        if (typeof saved?.id === 'string' && saved.id) {
          // Settle the saved form first so adopting its ID cannot flash an empty editor.
          await refreshFeature(saved.id, { adoptCreated: true })
          if (!isNewFeatureRef) return
          const url = new URL((page.shallow?.url ?? page.url).href)
          url.pathname = `/admin/features/${encodeURIComponent(saved.id)}`
          await goto(url, {
            shallow: true,
            replace: true,
            reset: false,
            state: { ...page.state, draftLocationResult: undefined },
          })
          return
        }
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

  // Scoped feature indexes carry the owning hierarchy into the first setup step.
  nextSeed.data.organisationId = page.url.searchParams.get('organisationId') ?? ''
  nextSeed.data.projectId = page.url.searchParams.get('projectId') ?? ''
  nextSeed.data.layerId = page.url.searchParams.get('layerId') ?? ''
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
  automatic?: AutomaticTranslation,
): void {
  const key = contentFormKey(locale)
  updateFeatureData(
    data => ({
      ...data,
      i18n: {
        ...data.i18n,
        [key]: {
          ...data.i18n[key],
          [field]: text,
          [`${field}Gen`]: false,
          ...(automatic
            ? {
                translationProvenance: {
                  ...data.i18n[key]?.translationProvenance,
                  [field]: JSON.stringify({
                    ...automatic,
                    acceptedValue: text,
                    acceptedBy: 'pending',
                    acceptedAt: new Date().toISOString(),
                  }),
                },
              }
            : {}),
        },
      },
    }),
    { revalidate: true },
  )
}

// Development drafts belong to this account and creation form, never a saved Feature.
let devDraftReady = $state(false)
type FeatureDraftCheckpoint = {
  data: FeatureFormInput['data']
  profileLocales?: ProfileLocaleState
  facet: FacetType
  namingChosen: boolean
  hasPin: boolean
  hasAddress: boolean
  accessibility?: AccessibilityDraft
  addressIdentity?: MapAddressChange['identity']
  localKind?: typeof draftLocalKind
  catalogueBuilding: boolean
  buildingSource?: BuildingSource
  visibility?: typeof draftVisibilityOverride
  names: Record<string, string>
  nameMode: typeof draftLocalNameMode
  placeSource: typeof draftPlaceSource
  selectionBefore: typeof draftSelectionBefore
  resultHistoryId: string | null
  search: DraftLocationSearchProgress | null
  accepted?: boolean
  findMode?: typeof draftFindMode
  editing?: boolean
  dirty?: boolean
  savedNames?: typeof savedLocationNameDraft
}
const devDraftStore = $derived(
  createDevFormDraft<FeatureDraftCheckpoint>(
    `hype:dev:new-feature:v1:${adminCtx.view.user?.id ?? ''}`,
  ),
)

// History recovery is available in production; development refresh recovery stays separate.
const navigationDraftScope = $derived(
  JSON.stringify([adminCtx.view.user?.id ?? '', featureRef]),
)
let navigationRestoreRequested = false
let pendingNavigationRestore =
  $state.raw<FormNavigationSnapshot<FeatureDraftCheckpoint> | null>(null)
let pendingSearchRestore = $state.raw<{
  scope: string
  search: DraftLocationSearchProgress | null
} | null>(null)

/** Capture form values and non-field editor state without retaining reactive proxies.
 * @returns A serializable checkpoint for history or development refresh recovery.
 */
function captureFeatureCheckpoint(): FeatureDraftCheckpoint {
  const search =
    pendingSearchRestore?.scope === navigationDraftScope
      ? pendingSearchRestore.search
      : (draftSearch?.getProgress() ?? null)
  return JSON.parse(
    JSON.stringify({
      data: currentFeatureData,
      profileLocales: profileLocaleState,
      facet: activeFacet,
      namingChosen,
      hasPin: draftHasPin,
      hasAddress: draftHasAddress,
      accessibility: draftAccessibility,
      addressIdentity: draftAddressIdentity,
      localKind: draftLocalKind,
      catalogueBuilding: draftCatalogueBuilding,
      buildingSource: draftBuildingSource,
      visibility: draftVisibilityOverride,
      names: draftLocationNames,
      nameMode: draftLocalNameMode,
      placeSource: draftPlaceSource,
      selectionBefore: draftSelectionBefore,
      resultHistoryId: draftResultHistoryId,
      search,
      accepted: draftLocationAccepted,
      findMode: draftFindMode,
      editing: isEditing,
      dirty: isDirty,
      savedNames: savedLocationNameDraft,
    }),
  )
}

/** Apply a checkpoint after the form's initial resource load has settled.
 * @param saved Captured editor state. @param restoreHistoryMarker Whether development refresh needs a selection entry.
 * @returns Nothing; history traversal itself never pushes an additional entry.
 */
function restoreFeatureCheckpoint(
  saved: FeatureDraftCheckpoint,
  restoreHistoryMarker = false,
): void {
  formCtx.form.fields.set({ ...currentFormValue, data: saved.data })
  if (saved.profileLocales)
    setProfileLocaleState(
      restoreProfileLocales(profileDefaults, saved.data.i18n, saved.profileLocales),
    )
  namingChosen = saved.namingChosen
  draftHasPin = saved.hasPin
  draftHasAddress = saved.hasAddress
  draftAccessibility = saved.accessibility
  draftAddressIdentity = saved.addressIdentity
  draftLocalKind = saved.localKind
  draftCatalogueBuilding = saved.catalogueBuilding
  draftBuildingSource = saved.buildingSource
  draftVisibilityOverride = saved.visibility
  draftLocationNames = saved.names
  draftLocalNameMode = saved.nameMode
  draftPlaceSource = saved.placeSource
  draftSelectionBefore = saved.selectionBefore
  draftResultHistoryId = saved.resultHistoryId
  if (
    restoreHistoryMarker &&
    saved.resultHistoryId &&
    page.state.draftLocationResult !== saved.resultHistoryId
  ) {
    pushState(page.url.href, {
      ...page.state,
      draftLocationResult: saved.resultHistoryId,
    })
  }
  pendingSearchRestore = { scope: navigationDraftScope, search: saved.search }
  draftLocationAccepted = saved.accepted ?? Boolean(saved.selectionBefore)
  draftFindMode = saved.findMode ?? 'search'
  savedLocationNameDraft = saved.savedNames ?? null
  if (saved.editing !== undefined) headerCtrl.setEditing(saved.editing)
  hasProgrammaticDirtyChanges = saved.dirty ?? true
  const facet = (page.shallow?.url ?? page.url).hash.slice(1) || saved.facet
  if (featureFacetOrder.includes(facet as FacetType)) {
    adminCtx.setFacet(facet as FacetType, featureRef, FirstClassResource.feature)
  }
}

snapshot<FormNavigationSnapshot<FeatureDraftCheckpoint> | null>({
  id: 'admin-feature-form-v1',
  capture: () =>
    currentUser?.id && isCurrentRefSettled && !(isNewFeatureRef && draftSelectionSaved)
      ? captureFormNavigationSnapshot(navigationDraftScope, captureFeatureCheckpoint())
      : null,
  restore: saved => {
    navigationRestoreRequested = Boolean(
      saved && isCurrentFormNavigationSnapshot(navigationDraftScope, saved),
    )
    pendingNavigationRestore = navigationRestoreRequested ? saved : null
  },
  reset: () => {
    pendingNavigationRestore = null
    navigationRestoreRequested = false
  },
})

// Resource hydration and remote-form effects must finish before restoring history values.
$effect(() => {
  const saved = pendingNavigationRestore
  const scope = navigationDraftScope
  if (!saved || !isCurrentRefSettled) return
  let cancelled = false
  void tick().then(() => {
    if (cancelled || !isCurrentFormNavigationSnapshot(scope, saved)) return
    restoreFeatureCheckpoint(saved.value)
    pendingNavigationRestore = null
    devDraftReady = true
  })
  return () => {
    cancelled = true
  }
})

// The Location facet mounts lazily, so retain search progress until its component exists.
$effect(() => {
  const pending = pendingSearchRestore
  if (!pending || pending.scope !== navigationDraftScope || !draftSearch) return
  untrack(() => draftSearch?.restoreProgress(pending.search))
  pendingSearchRestore = null
})

// Restore after bootstrap resets have settled; never persist the initial empty render over a draft.
$effect(() => {
  const accountId = currentUser?.id
  const isNew = isNewFeatureRef
  const store = devDraftStore
  devDraftReady = false
  if (!import.meta.env.DEV || !isNew || !accountId) return
  let cancelled = false
  void tick().then(() => {
    if (cancelled || navigationRestoreRequested) return
    const saved = store.read()
    if (
      saved?.data &&
      saved.names &&
      (!saved.search || Array.isArray(saved.search.receivedRows))
    ) {
      restoreFeatureCheckpoint(saved, true)
    }
    devDraftReady = true
  })
  return () => {
    cancelled = true
  }
})

// Read nested field proxies synchronously so typing, selection and facet changes all checkpoint.
$effect(() => {
  if (!import.meta.env.DEV || !devDraftReady || !isNewFeatureRef || draftSelectionSaved)
    return
  const checkpoint = captureFeatureCheckpoint()
  const search = checkpoint.search
  if (
    profileLocaleDraft?.key === profileScope ||
    isDirty ||
    namingChosen ||
    draftHasPin ||
    search?.query ||
    search?.accepted
  ) {
    devDraftStore.write(checkpoint)
  } else devDraftStore.clear()
})

/** Discard the development checkpoint and return the creation flow to its first step.
 * @returns Nothing; no server records are changed.
 */
function startOverDevDraft(): void {
  onReset()
}

/********************
 *  SECTION : CORE STATE
 ************/
let selectedOrganisationById = $state<Record<string, ParentSectionOrganisationItem>>({})

let selectedProjectById = $state<Record<string, ParentSectionProjectItem>>({})
let selectedLayerById = $state<Record<string, ParentSectionLayerItem>>({})
let isReplacingParentProject = $state(false)
let isReplacingParentLayer = $state(false)
const organisationIdValue = $derived(String(currentFeatureData.organisationId ?? ''))
const projectIdValue = $derived(String(currentFeatureData.projectId ?? ''))
const layerIdValue = $derived(String(currentFeatureData.layerId ?? ''))
const hasSelectedLayer = $derived(layerIdValue.trim().length > 0)
// Location choices depend on the organisation and project resolved by layer selection.
const needsLayerSelection = $derived(
  isNewFeatureRef && (!hasSelectedLayer || !organisationIdValue || !projectIdValue),
)

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

// Project the unsaved parent selection without changing the shared resource cache.
$effect(() => {
  if (!isCurrentRefSettled) return
  if (
    !isNewFeatureRef &&
    organisationIdValue === feature?.data?.organisationId &&
    projectIdValue === feature?.data?.projectId &&
    layerIdValue === feature?.data?.layerId
  )
    return
  const view = adminCtx.view
  const preferences = view.getUserPreferences()
  const organisation = selectedOrganisation
  const project = selectedProject
  const layer = selectedLayer
  const hubId = view.cache.organisation.get(organisationIdValue)?.hubId
  const hub = hubId ? view.getResourceByIdSync(FirstClassResource.hub, hubId) : null
  const crumbs = []
  if (hub) {
    crumbs.push({
      name: getI18n(hub, 'nameShort', preferences) || getI18n(hub, 'name', preferences),
      href: `/admin/hubs/${hub.code}`,
    })
  }
  if (organisation) {
    crumbs.push({
      name:
        view.getContextualOrganisationName(organisation as never, false, false) ||
        organisation.code,
      href: `/admin/organisations/${organisation.code || organisation.id}`,
    })
  }
  if (project) {
    crumbs.push({
      name:
        view.getContextualProjectName(
          project as never,
          false,
          false,
          Boolean(organisation),
        ) || project.code,
      href: `/admin/projects/${project.code || project.id}`,
    })
  }
  if (layer) {
    crumbs.push({
      name: view.getContextualLayerName(layer as never, false, false) || layer.code,
      href: `/admin/layers/${layer.id}`,
    })
  }
  headerCtrl.draftCrumbs = crumbs
  return () => {
    headerCtrl.draftCrumbs = null
  }
})

// Fall back to the new-feature coordinates until the form geometry becomes valid.
const featureCoordinates = $derived(
  getCoordinates(
    ((currentFeatureData.geometry as Point)?.coordinates ??
      DEFAULT_NEW_FEATURE_COORDINATES) as [number, number],
  ),
)

const title = $derived(
  setupPending
    ? m.setup_new_feature()
    : currentFeatureData.i18n?.[localeKey]?.title ||
        feature?.data?.i18n?.[localeKey]?.title ||
        (isNewFeatureRef
          ? NEW_TITLE
          : headerCtrl.resolveEntityTitle(undefined, m.resource_loading())),
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
const locationFieldModes = $derived(
  currentFeatureData.locationFieldModes as
    | Partial<
        Record<
          'names' | 'phoneNumber' | 'brands' | 'location',
          'community' | 'internal'
        >
      >
    | undefined,
)
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
  const edits = currentFeatureData.locationNames as Record<string, string> | undefined
  if (edits && !isNewFeatureRef) return { ...names, ...edits }
  if (Object.values(names).some(name => name.trim())) return names
  // A described position can supply the linked title even without a named venue.
  return addressLocationNames(editorAddress)
})
// A marker is sufficient to continue; a Location association or description remains optional.
const draftLocationReady = $derived(draftHasPin)

const profileNameMode = $derived(
  isNewFeatureRef
    ? draftLocalNameMode
    : featurePresentationPolicy.locationBasedNames
      ? 'inherit'
      : (currentFeatureData.locationNameMode ??
        feature?.data?.authoring?.nameMode ??
        acceptedNameSource?.current?.nameMode ??
        'independent'),
)
// Resolve the displayed Title without feeding computed modifiers back into the authored base.
const profileNameRule = $derived(
  isNewFeatureRef
    ? (selectedFeatureType?.nameRule ??
        (selectedFeatureType?.relation === 'represents'
          ? { base: 'location' as const, conditions: [] }
          : null))
    : (feature?.data?.nameTemplate?.rule ?? null),
)
const profileNameOverrides = $derived(
  (currentFeatureData.nameOverrides ?? {}) as Record<string, string>,
)
const profileValues = $derived.by(
  (): Record<string, { title?: string; description?: string }> => {
    const rule = profileNameRule
    if (!rule) return currentFeatureData.i18n
    // Central expressions are resolved from accepted server evidence; keep unsaved edits out of that preview.
    if (rule.registry)
      return Object.fromEntries(
        Object.entries(currentFeatureData.i18n).map(([locale, row]) => [
          locale,
          {
            ...row,
            title:
              profileNameOverrides[canonicalContentTag(locale)] ??
              feature?.data?.i18n?.[locale]?.title ??
              row.title,
          },
        ]),
      )
    const properties = Object.fromEntries(
      (currentFeatureData.properties ?? []).map(row => [
        row.propertyId,
        rule.conditions.some(
          condition =>
            condition.propertyId === row.propertyId && condition.test === 'hasValue',
        )
          ? featureNameTextValue(
              typeof row.value === 'string' ? row.value : null,
              typeof row.property?.component === 'string'
                ? row.property.component
                : null,
            )
          : nameBooleanValue(row.value),
      ]),
    )
    return Object.fromEntries(
      Object.entries(currentFeatureData.i18n).map(([locale, row]) => [
        locale,
        {
          ...row,
          title: generateFeatureName({
            rule,
            locale,
            locationName: Object.entries(profileLocationNames).find(
              ([tag]) => canonicalContentTag(tag) === canonicalContentTag(locale),
            )?.[1],
            featureName: row.title,
            properties,
            override: profileNameOverrides[canonicalContentTag(locale)],
          }),
        },
      ]),
    )
  },
)
const profileNamesLocked = $derived(profileNameMode === 'inherit')
const profileTitlesLocked = $derived(
  profileNamesLocked && !Object.keys(profileNameOverrides).length,
)

/** Store an explicit final title without replacing the naming rule's source.
 * @param locale Edited content locale. @param title Override, or undefined to restore the rule.
 * @param generated Whether the title is machine generated. @returns Nothing.
 */
function changeRuleTitle(
  locale: string,
  title: string | undefined,
  generated: boolean,
): void {
  const key = contentFormKey(locale)
  const tag = canonicalContentTag(locale)
  updateFeatureData(data => {
    const nameOverrides = { ...((data.nameOverrides ?? {}) as Record<string, string>) }
    if (title === undefined) delete nameOverrides[tag]
    else nameOverrides[tag] = title
    return {
      ...data,
      nameOverrides,
      i18n: { ...data.i18n, [key]: { ...data.i18n[key], titleGen: generated } },
    }
  })
}
// Existing independent titles must not hide the explicit option to inherit the Location name.
const canOfferLocationName = $derived(
  !profileTitlesLocked && Object.values(profileLocationNames).some(name => name.trim()),
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
  if (profileNameRule) updateFeatureData(data => ({ ...data, nameOverrides: {} }))
  draftLocalNameMode = 'inherit'
  if (draftPlaceSource) draftPlaceSource = { ...draftPlaceSource, nameMode: 'inherit' }
  inheritLocationNames(profileLocationNames)
}
/** Keep the current title while returning naming ownership to this Feature.
 * @returns Nothing; the normal form save persists the explicit record choice.
 */
function useIndependentFeatureName(): void {
  if (profileNameRule) {
    const nameOverrides = Object.fromEntries(
      Object.entries(profileValues).map(([locale, row]) => [
        canonicalContentTag(locale),
        row.title ?? '',
      ]),
    )
    updateFeatureData(data => ({ ...data, nameOverrides }))
  }
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
  if (isNewFeatureRef && locked && editing) untrack(() => inheritLocationNames(names))
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
  } catch (cause) {
    mutation.settle(false)
    if (!isCurrentAction()) return
    toast.error(m.long_crazy_peacock_care(), {
      description: submissionErrorMessage(cause),
    })
  } finally {
    if (isCurrentAction()) setBusy(false)
  }
}

// The modal follows a successful publication and is scoped to that exact Feature.
$effect(() => {
  headerCtrl.setFormActions({ publishPrompt: null })
})

const canPreview = $derived.by(() => {
  const savedFeature = feature?.data
  if (!currentUser || !savedFeature) return false
  return (
    isCurrentRefSettled &&
    !isNewFeatureRef &&
    savedFeature.id === featureRef &&
    !savedFeature.isDraft &&
    !savedFeature.isPublished &&
    !savedFeature.isArchived &&
    canPreviewPublication(currentUser, currentUser.roles ?? [], {
      organisationId: savedFeature.organisationId,
      projectId: savedFeature.projectId,
      hubId:
        adminCtx.view.queries.rows.organisation?.find(
          item => item.id === savedFeature.organisationId,
        )?.hubId ?? adminCtx.view.hub?.id,
    })
  )
})

/**
 * Opens the saved feature in the shared, explicitly labelled map preview.
 * @returns Nothing; navigation creates a fresh map context.
 * @remarks Preview leaves publication state unchanged and excludes unsaved edits.
 */
function onPreview(): void {
  if (!canPreview || isEditing || !feature?.data?.id) return
  window.location.assign(
    publicationPreviewUrl({
      type: 'feature',
      id: feature.data.id,
      publishChildren: false,
    }),
  )
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

  // SvelteKit captures hidden controls before onsubmit; returned payloads do not alter transport.
  // Historical collection membership is routed from status after creation or a changed selection.
  const submissionLayerId =
    isNewFeatureRef || layerIdValue !== feature?.data?.layerId
      ? featureCreationSourceLayerId(layerIdValue, selectedLayer)
      : layerIdValue
  return formCtx.form.fields.data.layerId.as('hidden', submissionLayerId)
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
let streetCandidates = $state<NearbyStreet[]>([])
let addressCandidates = $state<FeatureAddress[]>([])
let mapAddressChangeBusy = $state(false)
let mapAddressChangeError = $state('')
let mapAddressChangeButton = $state<HTMLButtonElement>()
let pendingMapAddressChange = $state<{
  change: MapAddressChange
  signature: string
  origin: [number, number]
  ref: string
} | null>(null)
let mapPartsRequest = 0
let mapPartsSuggestion = $state<{
  ref: string
  point: string
  parts: MapMissingParts
  labels: string[]
  number: string | null
  streets: string[]
  conflictsDismissed?: boolean
  reviewRequired?: boolean
} | null>(null)
let mapMoveBefore = $state.raw<{
  ref: string
  geometry: typeof currentFeatureData.geometry
  addressMeta: typeof currentFeatureData.addressMeta
  hasPin: boolean
} | null>(null)
$effect(() => {
  featureRef
  isEditing
  mapPartsRequest++
  mapPartsSuggestion = null
  mapMoveBefore = null
  pendingMapAddressChange = null
  mapAddressChangeBusy = false
  mapAddressChangeError = ''
})
// Edits or navigation invalidate the decision together with the candidate marker.
$effect(() => {
  if (
    pendingMapAddressChange &&
    (pendingMapAddressChange.ref !== featureRef ||
      pendingMapAddressChange.signature !== JSON.stringify(currentFeatureData))
  )
    pendingMapAddressChange = null
})
const missingPartsSuggestion = $derived.by((): MapMissingParts | null => {
  if (
    !isEditing ||
    !isLocationFacet ||
    !mapPartsSuggestion ||
    mapPartsSuggestion.ref !== featureRef ||
    mapPartsSuggestion.point !== JSON.stringify(featureCoordinates)
  )
    return null
  const { parts } = mapPartsSuggestion
  const missing = missingMapParts(
    editorAddress,
    parts.block ? [parts.block.label] : [],
    parts.number ?? null,
  )
  return missing.block || missing.number ? missing : null
})
const mapConflicts = $derived.by(() =>
  mapPartsSuggestion &&
  !mapPartsSuggestion.conflictsDismissed &&
  isEditing &&
  isLocationFacet &&
  mapPartsSuggestion.ref === featureRef &&
  mapPartsSuggestion.point === JSON.stringify(featureCoordinates)
    ? mapAddressDisagreements(
        editorAddress,
        mapPartsSuggestion.labels,
        mapPartsSuggestion.number,
        mapPartsSuggestion.streets,
      )
    : [],
)
// Keep the current pin stationary until every notice or candidate-move decision is handled.
const hasMapAddressNotice = $derived(
  Boolean(missingPartsSuggestion || mapConflicts.length || pendingMapAddressChange),
)
/** Inspect map evidence after a drop; stale responses cannot follow the user to another pin.
 * @param point Dropped coordinate pair. @returns Completion of the optional suggestion lookup.
 */
async function suggestMapParts(point: number[]): Promise<void> {
  const request = ++mapPartsRequest
  const ref = featureRef
  const key = JSON.stringify(point)
  const controller = draftMapController
  try {
    const pin: [number, number] = [point[0], point[1]]
    const [labels, number, streets] = await Promise.allSettled([
      controller?.getBuildingNamesAt?.(pin) ?? [],
      controller?.getStreetNumberAt?.(pin) ?? null,
      controller?.getBuildingStreetsAt?.(pin) ?? [],
    ])
    if (
      request !== mapPartsRequest ||
      ref !== featureRef ||
      controller !== draftMapController ||
      key !== JSON.stringify(featureCoordinates) ||
      !isEditing ||
      !isLocationFacet
    )
      return
    // Independent evidence: an ambiguous number must not suppress a usable tower label.
    const names = labels.status === 'fulfilled' ? labels.value : []
    const mapNumber = number.status === 'fulfilled' ? number.value : null
    const mapStreets = streets.status === 'fulfilled' ? streets.value : []
    const parts = missingMapParts(editorAddress, names, mapNumber)
    mapPartsSuggestion = {
      ref,
      point: key,
      parts,
      labels: names,
      number: mapNumber,
      streets: mapStreets,
    }
    if (
      !parts.block &&
      !parts.number &&
      !mapAddressDisagreements(editorAddress, names, mapNumber, mapStreets).length
    )
      mapMoveBefore = null
  } catch {
    /* Missing/ambiguous map evidence leaves manual editing available. */
  }
}

let hoveredAddressCandidate = $state<FeatureAddress | null>(null)
let addressPreviewZoom: number | undefined
const rankedAddressCandidates = $derived(
  nearbyAddressCandidates(addressCandidates, featureCoordinates ?? []),
)
const mapAddressChangeMarkers = $derived(
  pendingMapAddressChange?.change.address.coordinates
    ? [
        {
          id: 'address-change',
          kind: 'address' as const,
          number: 0,
          coordinates: pendingMapAddressChange.change.address.coordinates,
          label: getAddressDisplay(
            pendingMapAddressChange.change.address,
            getLocaleKey(),
          ),
          highlighted: true,
          previewOnly: true,
        },
      ]
    : [],
)
const addressSearchMarkers = $derived(
  rankedAddressCandidates.flatMap(({ candidate }, index): LocationSearchMarker[] => {
    const coordinates = addressCandidatePoint(candidate)
    return coordinates
      ? [
          {
            id: `enrichment:${index}`,
            kind: 'address',
            number: index + 1,
            coordinates,
            label: getAddressDisplay(candidate, getLocaleKey()),
            previewOnly: true,
            compact: true,
            highlighted: candidate === hoveredAddressCandidate,
          },
        ]
      : []
  }),
)
/** Preview a result without moving the saved Location pin; restore that pin on leave.
 * @param candidate Hovered/focused result or null. @returns Nothing.
 */
function previewAddressCandidate(candidate: FeatureAddress | null): void {
  const controller = draftMapController
  if (!controller) return
  const point = candidate ? addressCandidatePoint(candidate) : featureCoordinates
  if (!point) return
  if (candidate && !hoveredAddressCandidate)
    addressPreviewZoom = controller.getCamera()?.zoom
  hoveredAddressCandidate = candidate
  controller.easeTo({
    center: [point[0], point[1]],
    zoom: candidate ? Math.max(addressPreviewZoom ?? 17, 18) : addressPreviewZoom,
    duration: prefersReducedMotion.current ? 0 : 350,
  })
  if (!candidate) addressPreviewZoom = undefined
}
// Dismissal or selection removes all enrichment markers and any active preview.
$effect(() => {
  if (!addressCandidates.length && hoveredAddressCandidate)
    previewAddressCandidate(null)
})

const editorAddress = $derived.by((): FeatureAddress => {
  if (currentFeatureData.addressMeta?.address)
    return {
      ...currentFeatureData.addressMeta.address,
    }
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
  streetCandidates = []
})

/** Updates the canonical address and its display-only projections in one draft mutation.
 * @param address Source envelope and per-feature corrections.
 * @returns Nothing; persistence uses the existing authorized Save/Cancel workflow.
 */
function updateAddressDraft(address: FeatureAddress): void {
  address = {
    ...address,
    locationDisplayMode:
      address.locationDisplayMode ?? editorAddress.locationDisplayMode,
  }
  // Reviewed Location identity survives Feature-owned address corrections; unreviewed map matches remain exact.
  if (
    draftAddressIdentity &&
    address.association?.mode !== 'linked' &&
    !exactAddressChangeMatch(editorAddress, address)
  )
    draftAddressIdentity = undefined
  addressLookupRevision += 1
  isAddressLookupLoading = false
  addressLookupMessage = ''
  addressCandidates = []
  streetCandidates = []
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
            [],
            undefined,
            featureCoordinates,
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
 * @param query Optional forward search; lookup alone never changes the selected pin.
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
  streetCandidates = []
  const isCurrent = (): boolean =>
    revision === addressLookupRevision &&
    ref === featureRef &&
    isEditing &&
    JSON.stringify(currentFeatureData) === draftSignature
  try {
    const pin: [number, number] = [featureCoordinates[0], featureCoordinates[1]]
    // Resolve map hints independently so a provider failure cannot hide usable streets.
    const hints = query?.trim()
      ? []
      : (draftMapController?.getNearbyStreetHints?.(pin) ?? [])
    const [addresses, streets] = await Promise.allSettled([
      geocodeAddressCandidates(
        query?.trim() ? { address: query.trim() } : { lng: pin[0], lat: pin[1] },
        { candidateCoordinates: true },
      ),
      hints.length
        ? loadAddressNames('streets').then(names => matchStreetHints(hints, names))
        : Promise.resolve([]),
    ])
    if (!isCurrent()) return
    addressCandidates =
      addresses.status === 'fulfilled'
        ? addresses.value.flatMap(result =>
            result.addressMeta.address ? [result.addressMeta.address] : [],
          )
        : []
    streetCandidates = streets.status === 'fulfilled' ? streets.value : []
    if (addresses.status === 'rejected' || streets.status === 'rejected')
      addressLookupMessage = m.feature_address_failed()
    else if (!addressCandidates.length && !streetCandidates.length)
      addressLookupMessage = m.feature_address_no_match()
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
  isAddressLookupLoading = true
  try {
    const address = recoverAddressNumber(await loadGeocodedAddressUnits(candidate))
    address.coordinates = addressCandidatePoint(address) ?? address.coordinates
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
    // Explicit selection uses the candidate's actual point for both the pin and numbered marker.
    if (address.coordinates) handleCoordinateChange(address.coordinates)
    updateAddressDraft(address)
    draftSearch?.syncSelectedAddress(address)
    previewDraftLocation({ address })
  } catch {
    if (revision === addressLookupRevision)
      addressLookupMessage = m.feature_address_failed()
  } finally {
    if (revision === addressLookupRevision) isAddressLookupLoading = false
  }
}

/** Resolve the displayed differences against complete addresses and existing scoped Locations.
 * @returns Completion without replacing a newer draft or accepting an unconfirmed marker move.
 */
async function acceptMapAddressChange(): Promise<void> {
  if (
    !isNewFeatureRef ||
    mapAddressChangeBusy ||
    mapPartsSuggestion?.reviewRequired ||
    !mapConflicts.length ||
    !featureCoordinates
  )
    return
  const request = ++mapPartsRequest
  const ref = featureRef
  const signature = JSON.stringify(currentFeatureData)
  const origin: [number, number] = [featureCoordinates[0], featureCoordinates[1]]
  const isCurrent = (): boolean =>
    request === mapPartsRequest &&
    ref === featureRef &&
    isEditing &&
    signature === JSON.stringify(currentFeatureData)
  mapAddressChangeBusy = true
  mapAddressChangeError = ''
  try {
    const change = await resolveMapAddressChange(
      {
        address: structuredClone($state.snapshot(editorAddress)),
        pin: origin,
        conflicts: mapConflicts,
        projectId: projectIdValue,
        visibility: draftLocationVisibility,
      },
      isCurrent,
    )
    if (!change || !isCurrent()) return
    const point = change.address.coordinates
    if (point && origin.some((value, index) => value !== point[index])) {
      pendingMapAddressChange = { change, signature, origin, ref }
      previewDraftLocation(change)
      void tick().then(() => mapAddressChangeButton?.focus())
    } else applyAcceptedMapAddressChange(change)
  } catch (cause) {
    if (isCurrent()) {
      const reviewRequired =
        cause instanceof Error &&
        (cause.message.includes('ADDRESS_MATCH_REVIEW_REQUIRED') ||
          ('status' in cause && cause.status === 409))
      // Keep this suggestion review-only once its identity lookup proves ambiguous.
      if (reviewRequired && mapPartsSuggestion)
        mapPartsSuggestion = { ...mapPartsSuggestion, reviewRequired: true }
      mapAddressChangeError = reviewRequired
        ? m.address_map_change_ambiguous()
        : m.feature_address_failed()
    }
  } finally {
    if (ref === featureRef && request === mapPartsRequest) mapAddressChangeBusy = false
  }
}

/** Apply an accepted correction through the existing draft and deferred association workflow.
 * @param change Exact existing identity or custom address, after any movement confirmation.
 * @returns Nothing; normal Save/Cancel controls persistence and retryable linking.
 */
function applyAcceptedMapAddressChange(change: MapAddressChange): void {
  pendingMapAddressChange = null
  mapMoveBefore = null
  const point = change.address.coordinates
  if (point && featureCoordinates?.some((value, index) => value !== point[index]))
    handleCoordinateChange(point)
  updateAddressDraft(change.address)
  draftLocalKind = 'address'
  draftLocalNameMode = 'independent'
  draftPlaceSource = null
  draftBuildingSource = undefined
  draftCatalogueBuilding = false
  draftAddressIdentity = change.identity
  draftAccessibility = undefined
  draftHasAddress = true
  draftLocationAccepted = true
  draftSearch?.adoptAddressChange(change.address)
  mapPartsRequest++
  mapPartsSuggestion = null
  mapAddressChangeBusy = false
  mapAddressChangeError = ''
  // Inspect the new point through the same drop flow, so further differences need acceptance again.
  if (point) void tick().then(() => suggestMapParts(point))
}

/** Confirm only the marker destination and draft version currently displayed by the move prompt.
 * @returns Nothing; Cancel and stale drafts retain the previous address and association.
 */
function confirmMapAddressChange(): void {
  const pending = pendingMapAddressChange
  if (
    !pending ||
    pending.ref !== featureRef ||
    pending.signature !== JSON.stringify(currentFeatureData)
  )
    return
  applyAcceptedMapAddressChange(pending.change)
}

/********************
 *  MAP MUTATION
 ************/

/** Move the pin without changing the user-controlled map camera.
 * @param nextCoordinates Dropped marker longitude/latitude.
 * @returns Nothing; address suggestions follow the reactive marker update.
 */
function handlePinDrop(nextCoordinates: number[]): void {
  // Snapshot Location-owned fields only; cancelling must not undo Profile or other form edits.
  mapMoveBefore = {
    ref: featureRef,
    geometry: structuredClone($state.snapshot(currentFeatureData.geometry)),
    addressMeta: structuredClone($state.snapshot(currentFeatureData.addressMeta)),
    hasPin: draftHasPin,
  }
  handleCoordinateChange(nextCoordinates, true)
  draftSearch?.syncSelectedAddress({
    ...editorAddress,
    coordinates: [nextCoordinates[0], nextCoordinates[1]],
  })
  // Let the marker update before looking up address suggestions; retain the viewport.
  void tick().then(() => suggestMapParts(nextCoordinates))
}

/** Cancel the current pin move, invalidating lookups before restoring its address and marker.
 * @returns Nothing; unrelated form fields and edits remain untouched.
 */
function cancelMapAddressMove(): void {
  const before = mapMoveBefore
  mapMoveBefore = null
  mapPartsRequest++
  mapPartsSuggestion = pendingMapAddressChange = null
  mapAddressChangeBusy = false
  mapAddressChangeError = ''
  addressLookupRevision++
  isAddressLookupLoading = false
  addressLookupMessage = ''
  addressCandidates = []
  streetCandidates = []
  if (!before) return
  if (before.ref !== featureRef) return
  updateFeatureData(
    data => ({ ...data, geometry: before.geometry, addressMeta: before.addressMeta }),
    { revalidate: true },
  )
  draftHasPin = before.hasPin
  if (before.addressMeta?.address)
    draftSearch?.syncSelectedAddress(before.addressMeta.address)
}

/** Moves the draft marker and invalidates any address tied to the previous point.
 * @param nextCoordinates Selected longitude/latitude.
 * @param preserveMove Retain the pre-drop snapshot until its move decision is handled.
 * @returns Nothing; the address is retained for review until a new lookup.
 */
function handleCoordinateChange(nextCoordinates: number[], preserveMove = false): void {
  if (!preserveMove) mapMoveBefore = null
  mapPartsRequest++
  mapPartsSuggestion = null
  if (isNewFeatureRef) draftHasPin = true
  addressLookupRevision += 1
  isAddressLookupLoading = false
  addressLookupMessage = ''
  addressCandidates = []
  streetCandidates = []
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

/** Apply a manually edited coordinate pair without moving the map camera.
 * @param nextCoordinates Validated longitude/latitude from the coordinate editor.
 * @returns Nothing; the marker and selected address receive the new coordinates.
 */
function handleManualCoordinateChange(nextCoordinates: number[]): void {
  handleCoordinateChange(nextCoordinates)
  draftSearch?.syncSelectedAddress({
    ...editorAddress,
    coordinates: [nextCoordinates[0], nextCoordinates[1]],
  })
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

// Fit draft and saved Profiles on arrival, including adoption of a newly created ID.
$effect(() => {
  const ready = !setupPending && isCurrentRefSettled && isCoreFacet
  const ref = featureRef
  const visual = featureVisualSection
  const host = contentsElement
  if (!ready || !visual || !host) return
  isVisualSectionCollapsed = false
  let disposed = false
  let frame = 0
  let observer: ResizeObserver | undefined
  /** Reserve the natural Profile and footer before giving spare space to the visual.
   * @returns Nothing; direct dragging remains available after the automatic fit.
   */
  const fit = (): void => {
    if (disposed || ref !== featureRef) return
    const surface = host.querySelector<HTMLElement>(
      '[data-facet-id="core"] [data-form-surface]',
    )
    const section = host.querySelector<HTMLElement>('.bits-feature-editor__visual')
    if (!surface || !section) return
    const surfaceRect = surface.getBoundingClientRect()
    const sectionRect = section.getBoundingClientRect()
    const gap = surfaceRect.top - sectionRect.bottom
    const margin = Number.parseFloat(getComputedStyle(surface).marginBottom) || 0
    // The footer reserves a 48px control row and a 32px gutter, matching Main.Facet.
    const available =
      window.innerHeight - sectionRect.top - gap - surfaceRect.height - margin - 80
    visual.restoreAfterFit(Math.max(64, available))
  }
  const schedule = (): void => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(fit)
  }
  void tick().then(() => {
    if (disposed) return
    const surface = host.querySelector<HTMLElement>(
      '[data-facet-id="core"] [data-form-surface]',
    )
    if (surface) {
      observer = new ResizeObserver(schedule)
      observer.observe(surface)
    }
    window.addEventListener('resize', schedule)
    schedule()
  })
  return () => {
    disposed = true
    cancelAnimationFrame(frame)
    observer?.disconnect()
    window.removeEventListener('resize', schedule)
  }
})

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
              [locale]: { ...property.i18n?.[locale], value: nextValue, valueGen },
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

let layerPropertiesRevision = 0

/**
 * Refreshes layer-backed feature properties for the current layer selection.
 *
 * @param layerId Selected layer id, if any.
 * @returns A promise that resolves after property state is synchronized.
 * @remarks Reset, route changes and newer selections invalidate pending property responses.
 */
async function syncLayerBackedProperties(
  layerId: string | null | undefined,
): Promise<void> {
  const revision = ++layerPropertiesRevision
  const requestedRef = featureRef
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
    // A response for the discarded draft must not mark the reset form dirty again.
    if (
      revision !== layerPropertiesRevision ||
      requestedRef !== featureRef ||
      currentFeatureData.layerId !== resolvedLayerId
    )
      return
    const layer = (result?.data ?? null) as Layer | null
    syncSelectedLayer(toParentLayerItem(layer as never))
    updateFeatureData(data => ({
      ...data,
      properties: toLayerBackedFeatureProperties(layer, data.properties),
    }))
  } catch {
    if (
      revision !== layerPropertiesRevision ||
      requestedRef !== featureRef ||
      currentFeatureData.layerId !== resolvedLayerId
    )
      return
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
  if (setupPending) return
  suppressFormLevelIssues = false
  if (
    draftResolutionPending ||
    mapAddressChangeBusy ||
    pendingMapAddressChange ||
    !isCurrentRefLoaded ||
    !ensureDraftPin()
  )
    return
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

/** Clear creation-only choices and invalidate Location discovery before resetting fields.
 * @returns Nothing; explicit Back to results remains the discovery undo action.
 */
function resetNewFeatureFlow(): void {
  setupStep = 0
  mapMoveBefore = null
  draftSearch?.restoreProgress(null)
  namingChosen = false
  locationFocusRequest = 0
  draftHasPin = draftHasAddress = draftLocationAccepted = false
  draftSelectionSaved = false
  draftFindMode = 'search'
  draftAccessibility = draftLocalKind = draftVisibilityOverride = undefined
  draftCatalogueBuilding = false
  draftBuildingSource = undefined
  draftAddressIdentity = undefined
  draftLocationNames = {}
  draftLocalNameMode = 'inherit'
  draftPlaceSource = draftSelectionBefore = draftResultHistoryId = null
  draftSearchHasResults = false
  locationSearchMarkers = []
  mapPartsRequest++
  mapPartsSuggestion = null
  // Remove the discarded selection's history marker without traversing browser history.
  if (page.state.draftLocationResult) {
    replaceState(page.url.href, { ...page.state, draftLocationResult: undefined })
  }
}

/** Reset all NEW creation state; saved Features restore their committed form values.
 * @returns Nothing; NEW returns to Profile and discards its development checkpoint.
 * @remarks Discovery undo retains query/results only through its explicit Back action.
 */
function onReset(): void {
  invalidateFormNavigationSnapshots(navigationDraftScope)
  pendingNavigationRestore = null
  pendingSearchRestore = null
  profileEpoch++
  // Cancel resets content, not the user's locale order or multilingual presentation.
  setProfileLocaleState(profileLocaleState)
  savedLocationNameDraft = null
  mapMoveBefore = null
  layerPropertiesRevision++
  if (isNewFeatureRef) resetNewFeatureFlow()
  draftAddressIdentity = undefined
  pendingMapAddressChange = null
  mapPartsRequest++
  mapPartsSuggestion = null
  mapAddressChangeBusy = false
  mapAddressChangeError = ''
  addressLookupRevision += 1
  isAddressLookupLoading = false
  addressLookupMessage = ''
  addressCandidates = []
  streetCandidates = []
  suppressFormLevelIssues = true
  const emptyResetValue = toEmptyFeatureFormInput()
  const resetValue =
    !isNewFeatureRef && committedFeature?.data
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
  if (isNewFeatureRef) {
    devDraftStore.clear()
    goToFacet('core')
  }
  // Reset can replace shallow history entries; invalidate their intermediate captures too.
  invalidateFormNavigationSnapshots(navigationDraftScope)
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

/** Load the requested Feature independently of its parent cards and inactive facets.
 * @param ref Feature reference captured at the start of navigation.
 * @param options Allow a newly created record to settle before replacing its draft URL.
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
  isIntangible?: boolean
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
      ...(params.isIntangible !== undefined
        ? { isIntangible: params.isIntangible }
        : {}),
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

  // Project staff need no organisation read grant to choose layers in their project.
  return filterCreatableParentProjects({
    projects: result.data ?? [],
    user: {
      id: currentAuthorizationUser?.id,
      isAnonymous: currentAuthorizationUser?.isAnonymous,
      superAdmin: currentAuthorizationUser?.superAdmin,
    },
    userRoles: currentAuthorizationUser?.roles ?? [],
    getOrganisationHubId: async id =>
      (await adminCtx.view.getOrganisationById(id))?.hubId ?? null,
  })
}

/** Load setup destinations through the existing Feature creation authorization filter.
 * @param query Layer search text. @param scope Optional organisation or project drill-down.
 * @returns Accessible parent labels and matching layers, ordered by Feature contribution activity.
 */
async function loadFeatureSetup(
  query: string,
  scope: FeatureSetupScope,
): Promise<FeatureSetupResults> {
  const records = await getCreatableProjectRecords({
    organisationIds: scope.organisationId ? [scope.organisationId] : [],
  })
  const projects = records
    .map(toParentProjectItem)
    .filter((item): item is ParentSectionProjectItem => item !== null)
  const scoped = projects.filter(
    item => !scope.projectId || item.id === scope.projectId,
  )
  if (!scoped.length) return { organisations: [], projects, layers: [] }
  const organisationIds = [...new Set(scoped.map(item => item.organisationId))]
  const [organisationResult, layerResult] = await Promise.all([
    getOrganisationsWhichHaveLayers({
      q: '',
      prisms: createFeatureParentSearchPrisms(),
      conditions: { id: organisationIds, isArchived: false, isPublished: null },
      meta: { ...adminCtx.view.resources.queryMeta, profile: 'admin' as const },
    }),
    getLayers({
      sorting: { sortBy: 'contributionActivity', sortOrder: 'desc' },
      q: query,
      prisms: createFeatureParentSearchPrisms({
        projectIds: scoped.map(item => item.id),
      }),
      conditions: { isArchived: false, isPublished: null },
      meta: { ...adminCtx.view.resources.queryMeta, profile: 'admin' as const },
    }),
  ])
  const organisations = (organisationResult.data ?? [])
    .map(item => toParentOrganisationItem(item as never))
    .filter((item): item is ParentSectionOrganisationItem => item !== null)
  const historicalProjects = new Set(
    scoped.filter(item => item.flags?.showHistoricalLayers).map(item => item.id),
  )
  const layers = (layerResult.data ?? [])
    .filter(
      item => !item.historicalSourceLayerId || historicalProjects.has(item.projectId),
    )
    .map(item => toParentLayerItem(item as never))
    .filter((item): item is ParentSectionLayerItem => item !== null)
  return { organisations, projects, layers }
}

/********************
 *  VISUAL SECTION CLEANUP
 ************/

// Entering the Location editor reserves room for address fields; manual resizing remains available.
$effect(() => {
  const section = featureVisualSection
  if (isLocationFacet && section) untrack(() => section.restoreAfterFit(320))
})
// Scrolling leaves the visual height unchanged. Association content may request more room; explicit controls can restore the map.
$effect(() => () => clearVisualSectionReopenState())

/** Refresh saved Feature projections after a Location review.
 * @returns Completion after the Feature and editor projections refresh.
 */
async function refreshLocationSource(): Promise<void> {
  await getFeature({
    ref: featureRef,
    refKey: 'id',
    meta: { ...adminCtx.view.resources.queryMeta, profile: 'admin' },
  }).refresh()
  await refreshFeature()
}
</script>

{#if currentFeatureId && feature?.data?.layerId}
  <FeatureIdentityDialog
    bind:open={identityOpen}
    kind={identityKind}
    featureId={currentFeatureId}
    layerId={feature.data.layerId}
    sourceGeometry={feature.data.geometry}
    onApplied={async ids => {
      // Identity commands mutate accepted content outside this form's ordinary save flow.
      await getFeature({
        ref: currentFeatureId,
        refKey: 'id',
        meta: { ...adminCtx.view.resources.queryMeta, profile: 'admin' },
      }).refresh()
      await refreshFeature()
      if (ids[0] !== currentFeatureId)
        await goto(`/admin/features/${encodeURIComponent(ids[0])}`)
    }}
  />
{/if}

{#snippet mapMissingPartsControls()}
  <div class="flex flex-col items-center gap-2">
    {#if pendingMapAddressChange?.change.address.coordinates}
      <LocationMoveConfirmation
        kind="address"
        distance={locationDistance(
          pendingMapAddressChange.origin,
          pendingMapAddressChange.change.address.coordinates,
        )}
        bind:confirmButton={mapAddressChangeButton}
        onConfirm={confirmMapAddressChange}
        onCancel={cancelMapAddressMove}
      />
    {:else if mapConflicts.length}
      <MapAddressConflict
        conflicts={mapConflicts}
        busy={mapAddressChangeBusy}
        error={mapAddressChangeError}
        reviewRequired={mapPartsSuggestion?.reviewRequired}
        onCancel={cancelMapAddressMove}
        onAccept={isNewFeatureRef ? () => void acceptMapAddressChange() : undefined}
        onReview={() => {
          if (mapPartsSuggestion) mapPartsSuggestion.conflictsDismissed = true
          mapAddressChangeError = ''
          void lookupFeatureAddress()
        }}
      />
    {/if}
    {#if missingPartsSuggestion && !pendingMapAddressChange}
      <MapAddressSuggestion
        parts={missingPartsSuggestion}
        onApply={() => {
          if (!missingPartsSuggestion) return
          const next = applyMapMissingParts(editorAddress, missingPartsSuggestion)
          mapMoveBefore = null
          mapPartsSuggestion = null
          mapPartsRequest++
          updateAddressDraft(next)
        }}
        onDismiss={() => {
          mapPartsRequest++
          mapPartsSuggestion = null
          mapMoveBefore = null
        }}
      />
    {/if}
  </div>
{/snippet}

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
      ...translationPromptAttributes(
        profileOrganisation?.settings,
        committedFeature?.data?.modifiedAt,
      ),
      style: `--feature-preview-height:${visualSectionHeight}px;--feature-draft-offset:${setupPending ? setupProgressHeight : 0}px`,
    }}
    isReady={isNewFeatureRef || Boolean(currentFeatureId)}
    class={`${FEATURE_EDITOR_FORM_CLASS} relative h-full min-h-0 ${setupPending ? 'flex flex-col overflow-hidden' : ''}`}
  >
    {#snippet fallback()}
      <div
        class="bits-theme bg-panel flex h-full min-h-0 w-full flex-col overflow-hidden"
        role="status"
        aria-busy="true"
        aria-label={m.resource_loading()}
      >
        <FeatureVisualSkeleton
          expandedHeight={isLocationFacet ? 320 : profileVisualHeight}
          showImage={!isLocationFacet}
          showControls={!isLocationFacet}
        />
        <FormSurface class={`${FEATURE_EDITOR_CONTENT_PAD_CLASS} pt-7! pb-12`}>
          <FeatureProfileEditor
            loading
            showToolbar
            localeState={profileLocaleState}
            onLocaleStateChange={() => {}}
            values={{}}
            contextKey={profileScope}
            allowDescriptions={featurePresentationPolicy.allowDescriptions}
            translate={async () => ({ status: 'translated', text: '' })}
            onTranslated={() => {}}
          >
            {#snippet children(field)}
              <div
                class={field === 'description' ? 'min-h-32 w-full' : 'min-h-10 w-full'}
              ></div>
            {/snippet}
          </FeatureProfileEditor>
        </FormSurface>
      </div>
    {/snippet}
    <HiddenInputs inputs={programmaticFeatureInputEntries} />
    {#if !setupQuestionsPending &&
      showsVisualSection &&
      isLocationFacet &&
      draftSearchFilterPanel}
      <!-- Use the map and setup progress area together for the category browser. -->
      <div
        class="absolute inset-x-0 top-0 z-30 flex h-[calc(var(--feature-preview-height)+var(--feature-draft-offset))] items-end justify-center overflow-hidden bg-black/15"
        data-location-filter-panel
      >
        {@render draftSearchFilterPanel()}
      </div>
    {/if}
    {#if setupPending}
      <FeatureSetup
        bind:step={setupStep}
        initialLayerId={page.url.searchParams.get('layerId') ?? undefined}
        initialScope={{
          organisationId: page.url.searchParams.get('organisationId') ?? undefined,
          projectId: page.url.searchParams.get('projectId') ?? undefined,
        }}
        onHeightChange={height => (setupProgressHeight = height)}
        layer={selectedLayer}
        sourceLayerId={layerIdValue
          ? featureCreationSourceLayerId(layerIdValue, selectedLayer)
          : undefined}
        type={selectedFeatureType}
        context={selectedTargetContext}
        contexts={availableTargetContexts}
        load={loadFeatureSetup}
        onLayer={onReplaceParentLayer}
        onType={chooseFeatureType}
        onContext={chooseTargetContext}
        onSearch={() => {
          draftFindMode = 'search'
          startLocationSearch()
        }}
      />
    {/if}
    {#if !setupQuestionsPending}
      {#if showsVisualSection}
        <FormFeatureVisualSection
          bind:this={featureVisualSection}
          expandedHeight={isLocationFacet ? 320 : profileVisualHeight}
          minimumHeight={isLocationFacet ? 320 : 64}
          showImage={!isLocationFacet}
          showControls={!isLocationFacet}
          onHeightChange={height => (visualSectionHeight = height)}
          {hasPresentedCanonicalImageSizing}
          {isCanonicalImagePending}
          imageAspectRatio={resolvedCanonicalImageAspectRatio}
          isCollapsed={isVisualSectionCollapsed &&
            !(isLocationFacet && draftResolutionPending)}
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
            <Main.VisualSectionMap
              isCollapsed={isVisualSectionCollapsed &&
                !(isLocationFacet && draftResolutionPending)}
            >
              <div class="relative h-full w-full">
                {#if import.meta.env.DEV && isNewFeatureRef}
                  <div
                    class="text-muted-foreground pointer-events-none absolute inset-x-3 top-4 z-20 flex items-start justify-between gap-2 text-xs"
                    data-dev-form-draft
                  >
                    <span
                      class="bg-panel/85 min-w-0 rounded-full px-3 py-1.5 backdrop-blur-sm"
                      >Development draft · resumes after refresh</span
                    >
                    <button
                      type="button"
                      class="bg-panel/85 hover:bg-muted hover:text-foreground focus-visible:ring-ring pointer-events-auto shrink-0 rounded-full px-3 py-1.5 backdrop-blur-sm focus-visible:ring-2 focus-visible:outline-none"
                      onclick={startOverDevDraft}
                    >
                      Start over
                    </button>
                  </div>
                {/if}
                <FormMapSection
                  pinControls={hasMapAddressNotice
                    ? mapMissingPartsControls
                    : undefined}
                  draggingLocked={hasMapAddressNotice}
                  {pinHighlightRequest}
                  onMapReady={controller => (draftMapController = controller)}
                  locationCandidates={isLocationFacet
                    ? pendingMapAddressChange
                      ? mapAddressChangeMarkers
                      : addressCandidates.length
                        ? addressSearchMarkers
                        : locationSearchMarkers
                    : []}
                  onLocationCandidateSelect={id => {
                    if (pendingMapAddressChange) {
                      mapAddressChangeButton?.focus()
                      return
                    }
                    if (addressCandidates.length) {
                      const row =
                        rankedAddressCandidates[Number(id.replace('enrichment:', ''))]
                      if (row && !isAddressLookupLoading)
                        void selectAddressCandidate(row.candidate)
                    } else selectLocationMarker(id)
                  }}
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
                {#if isLocationFacet && sharedLocationMapControls}
                  <div
                    class="pointer-events-none absolute inset-3 z-10 flex items-start justify-end [&>*]:pointer-events-auto"
                    data-location-map-controls
                  >
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
              isCollapsed={isVisualSectionCollapsed &&
                !(isLocationFacet && draftResolutionPending)}
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
          {#if !isNewFeatureRef && currentFeatureData.featureType}
            <p class="mb-8 text-sm">
              Feature type: <strong>{currentFeatureData.featureType}</strong>
            </p>
          {/if}
          {#if isNewFeatureRef && layerIdValue}
            {#key layerIdValue}
              {#if selectedFeatureType}
                {#if showMissingLocationPrompt}
                  <section role="status" class="mb-8 grid gap-3 rounded-lg border p-4">
                    <p>
                      No location is associated yet. Create a local location now, or
                      continue and improve it later.
                    </p>
                    <div class="flex flex-wrap gap-3">
                      <button
                        type="button"
                        class="rounded border px-3 py-2"
                        onclick={() => {
                          showMissingLocationPrompt = false
                          startLocationSearch()
                        }}
                      >
                        Find or create a location
                      </button>
                      <button
                        type="button"
                        class="rounded border px-3 py-2"
                        onclick={() => {
                          missingLocationAcknowledged = true
                          showMissingLocationPrompt = false
                        }}
                      >
                        Continue without a location
                      </button>
                    </div>
                  </section>
                {/if}
              {/if}
            {/key}
          {/if}

          {#if needsLayerSelection || !showNameFields}
            <SectionHeaderPrimitive.Issues issues={formLevelIssues} />
          {/if}
          <!-- Overlap outgoing and incoming prompts so the layer choice crossfades without shifting the form. -->
          <div class="grid">
            {#if needsLayerSelection}
              <div
                class="col-start-1 row-start-1 flex min-h-44 flex-col items-center justify-center gap-4 py-8"
                transition:fade={{ duration: prefersReducedMotion.current ? 0 : 180 }}
              >
                <p class="text-center text-lg font-semibold">
                  {m.feature_start_select_layer()}
                </p>
                <p class="text-muted-foreground text-center">
                  {m.feature_start_select_layer_description()}
                </p>
              </div>
            {:else if !showNameFields && (!isNewFeatureRef || selectedFeatureType)}
              <div
                class="col-start-1 row-start-1 flex min-h-44 flex-col items-center justify-center gap-4 py-8"
                inert={needsLayerSelection || showNameFields}
                transition:fade={{ duration: prefersReducedMotion.current ? 0 : 180 }}
              >
                <div class="flex flex-wrap justify-center gap-4">
                  <Button
                    type="button"
                    disabled={isNewFeatureRef && !selectedFeatureType}
                    text={m.feature_start_name()}
                    color="secondary"
                    style="outline"
                    size="md"
                    iconComponent={AddFeatureIcon}
                    onClick={() => (namingChosen = true)}
                  />
                  <Button
                    type="button"
                    disabled={isNewFeatureRef && !selectedFeatureType}
                    text={selectedFeatureType?.start === 'pin'
                      ? 'Place on the map'
                      : m.feature_start_find_place()}
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
            {:else if showNameFields}
              <div
                class="col-start-1 row-start-1 min-w-0"
                in:slide={{ duration: prefersReducedMotion.current ? 0 : 280 }}
              >
                {#if !isNewFeatureRef && currentFeatureId && !isEditing}
                  <Button
                    text={m.display_templates_title()}
                    style="link"
                    href={`/admin/templates?feature=${encodeURIComponent(currentFeatureId)}`}
                  />
                {/if}
                <FeatureProfileEditor
                  localeState={profileLocaleState}
                  onLocaleStateChange={setProfileLocaleState}
                  values={profileValues}
                  contextKey={`${profileScope}:${profileEpoch}:${profileNameMode}:${isEditing}`}
                  {isEditing}
                  loading={!isCurrentRefSettled}
                  retainContent={Boolean(currentFeatureId)}
                  recordKey={currentFeatureId ?? ''}
                  allowDescriptions={featurePresentationPolicy.allowDescriptions}
                  inherited={profileTitlesLocked}
                  policyRequired={featurePresentationPolicy.locationBasedNames &&
                    !profileNameRule}
                  offerName={canOfferLocationName}
                  locationNames={profileLocationNames}
                  onUseName={useLocationName}
                  onIndependentName={useIndependentFeatureName}
                  onEditLocation={() => goToFacet('location')}
                  translate={(source, target, text) =>
                    translateContentField({ source, target, text })}
                  onReveal={() => goToFacet('core')}
                  onAutomatic={(field, locale, automatic) => {
                    const key = contentFormKey(locale)
                    updateFeatureData(data => ({
                      ...data,
                      i18n: {
                        ...data.i18n,
                        [key]: {
                          ...data.i18n[key],
                          autoTranslated: {
                            ...data.i18n[key]?.autoTranslated,
                            [field]: JSON.stringify(automatic),
                          },
                        },
                      },
                    }))
                  }}
                  onTranslated={(field, locale, text, automatic) => {
                    if (field === 'title' && profileNameRule)
                      changeRuleTitle(locale, text, false)
                    else applyProfileTranslation(field, locale, text, automatic)
                  }}
                >
                  {#snippet titleSource(locale)}
                    <FeatureTitleSource
                      rule={profileNameRule}
                      scopeId={layerIdValue}
                      {locale}
                      fromLocation={profileNameRule?.base === 'location' ||
                        (!profileNameRule &&
                          Object.values(profileLocationNames).some(name =>
                            name.trim(),
                          ))}
                      custom={profileNameRule
                        ? profileNameOverrides[canonicalContentTag(locale)] !==
                          undefined
                        : !profileNamesLocked}
                      editable={isEditing}
                      required={featurePresentationPolicy.locationBasedNames &&
                        !profileNameRule}
                      onCustomize={() => {
                        if (profileNameRule)
                          changeRuleTitle(
                            locale,
                            profileValues[contentFormKey(locale)]?.title ?? '',
                            false,
                          )
                        else useIndependentFeatureName()
                      }}
                      onRestore={() => {
                        if (profileNameRule) changeRuleTitle(locale, undefined, false)
                        else useLocationName()
                      }}
                      onLocation={() => goToFacet('location')}
                    />
                  {/snippet}
                  {#snippet toolbarMessage()}
                    <div class="flex min-w-0 items-center gap-3">
                      {#if !isNewFeatureRef && currentFeatureData.featureType}
                        <span
                          class="text-muted-foreground inline-flex min-h-8 items-center gap-2 text-xs"
                          data-feature-type
                        >
                          <FeatureTypeIcon class="size-5" aria-hidden="true" />
                          <span>{currentFeatureData.featureType}</span>
                        </span>
                      {/if}
                      <SectionHeaderPrimitive.Issues issues={formLevelIssues} />
                    </div>
                  {/snippet}
                  {#snippet children(field, locale, onEditStart, prefix)}
                    {@const key = contentFormKey(locale)}
                    {@const language = getContentLocaleRecord(locale, getLocaleKey())}
                    {@const config = featureDescriptorFieldConfigs.find(
                      config => config.key === field,
                    )}
                    {#if config && field === 'title' && profileNameRule}
                      <FeatureRuleTitleField
                        value={profileValues[key]?.title ?? ''}
                        override={profileNameOverrides[canonicalContentTag(locale)]}
                        generated={currentFeatureData.i18n[key]?.titleGen === true ||
                          currentFeatureData.i18n[key]?.titleGen === 'true'}
                        baseName={currentFeatureData.i18n[key]?.title ?? ''}
                        fields={formCtx.form.fields.data.i18n[key]}
                        label={`${config.label} · ${language.name}`}
                        {prefix}
                        editable={isEditing &&
                          profileNameOverrides[canonicalContentTag(locale)] !==
                            undefined}
                        required={isRequiredInPreflight(['data', 'i18n', key, 'title'])}
                        onChange={(title, generated) =>
                          changeRuleTitle(locale, title, generated)}
                        {onEditStart}
                      />
                    {:else if config}
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
                    {/if}
                  {/snippet}
                </FeatureProfileEditor>
              </div>
            {/if}
          </div>

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
        {#if nonTranslatableItems.length === 0 &&
          translatableSpecifierItems.length === 0}
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
            <!-- Feature navigation retires field-local async work even when property IDs match. -->
            {#key currentFeatureId}
              <FormFeatureFields
                {localeKey}
                locales={profileLocaleState.selectedLocales}
                onReveal={() => goToFacet('fields')}
                onTranslation={(propertyId, locale, automatic, acceptedValue) => {
                  updateFeatureData(data => ({
                    ...data,
                    properties: (data.properties ?? []).map(property =>
                      property.propertyId !== propertyId
                        ? property
                        : {
                            ...property,
                            i18n: {
                              ...property.i18n,
                              [locale]: {
                                ...property.i18n?.[locale],
                                autoTranslated: {
                                  ...property.i18n?.[locale]?.autoTranslated,
                                  value: automatic,
                                },
                                ...(acceptedValue === undefined
                                  ? {}
                                  : {
                                      value: acceptedValue,
                                      valueGen: false,
                                      translationProvenance: {
                                        ...property.i18n?.[locale]
                                          ?.translationProvenance,
                                        value: {
                                          ...automatic,
                                          acceptedValue,
                                          acceptedBy: 'pending',
                                          acceptedAt: new Date().toISOString(),
                                        },
                                      },
                                    }),
                              },
                            },
                          },
                    ),
                  }))
                }}
                {nonTranslatableItems}
                {translatableSpecifierItems}
                {isEditing}
                onTranslate={onTranslateTranslatableValues}
                onResetLocale={onResetTranslatableValues}
                onToggleGenAI={togglePropertyI18nValueGen}
                onValueChange={updatePropertyI18nValue}
              />
            {/key}
          </FormSurface>
        {/if}
      </Main.Facet>

      <Main.Facet
        isVisible={isLocationFacet}
        transition="fade"
        fillHeight={true}
        contentClass="h-full overflow-hidden"
        class={getFeatureEditorFacetClass({
          isVisible: isLocationFacet,
          showsVisualSection,
          isVisualSectionCollapsed,
        })}
        navMode="overlay"
        previousAction={setupPending || (isNewFeatureRef && draftSelectionBefore)
          ? null
          : buildFacetNavAction('location', 'previous')}
        nextAction={setupPending ? null : buildFacetNavAction('location', 'next')}
        centerAction={isNewFeatureRef &&
        !draftResolutionPending &&
        !draftLocationAccepted &&
        draftSearchHasResults
          ? {
              id: 'draft-manual-entry',
              disabled: !draftHasPin && !draftMapController,
              centerInContent: false,
              text: m.feature_search_manual_location(),
              onClick: startManualLocation,
            }
          : null}
        attrs={{ 'data-facet-id': 'location' }}
      >
        {#if mountLocationFacet}
          <FormSurface class="mb-0! flex h-full min-h-0 flex-col overflow-hidden">
            {#key featureRef}
              {#snippet locationEditor(
                locationControl?: Snippet<[Snippet?]>,
                locationContent?: Snippet,
                hideDetails = false,
                showLookup = true,
                lookupOverride?: (query?: string) => void,
                locationActions?: Snippet,
                locationMapControls?: Snippet,
                allow3dAddress = true,
                accessibilityLocationId?: string,
                locationKind?: string,
                locationSyncControl?: Snippet<[boolean?]>,
                onMatchLocation?: () => void,
              )}
                {#snippet identityFields(translations: boolean)}
                  {#if draftLocalKind !== 'address'}
                    <DraftLocationNameFields
                      localeState={profileLocaleState}
                      onBlur={() => {
                        void draftSearch?.resolveAssociation(
                          editorAddress,
                          draftLocationNames,
                        )
                      }}
                      names={draftLocationNames}
                      kind={draftLocalKind ?? 'establishment'}
                      {translations}
                      {isEditing}
                      recordKey={draftResultHistoryId}
                      onChange={names => {
                        draftLocationNames = names
                        hasProgrammaticDirtyChanges = true
                      }}
                    />
                  {/if}
                {/snippet}
                {#snippet savedIdentityFields(translations: boolean)}
                  {#if !isNewFeatureRef && acceptedNameSource?.current && isEditing}
                    <div
                      class="col-span-6 mb-4 grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3"
                    >
                      {#each [
                        ['names', m.location_review_names()],
                        ['phoneNumber', m.location_field_phone()],
                        ['brands', m.location_brand_title()],
                        ['location', m.feature_address_title()],
                      ] as const as [field, label]}
                        <label class="flex items-center justify-between gap-2 text-xs">
                          <span>{label}</span>
                          <select
                            class="bg-background text-foreground border-input rounded-md border px-2 py-1 text-xs"
                            aria-label={m.location_field_edit_mode({ field: label })}
                            value={locationFieldModes?.[field] ??
                              acceptedNameSource.current.fieldEditModes?.[field] ??
                              (acceptedNameSource.current.state === 'manual'
                                ? 'internal'
                                : 'community')}
                            onchange={event => {
                              const mode = event.currentTarget.value as
                                | 'community'
                                | 'internal'
                              updateFeatureData(data => ({
                                ...data,
                                locationFieldModes: {
                                  ...acceptedNameSource?.current?.fieldEditModes,
                                  ...locationFieldModes,
                                  [field]: mode,
                                },
                              }))
                              hasProgrammaticDirtyChanges = true
                            }}
                          >
                            <option value="internal">
                              {m.location_visibility_exclusive()}
                            </option>
                            <option
                              value="community"
                              disabled={acceptedNameSource.current.state === 'manual'}
                            >
                              {m.location_visibility_shared()}
                            </option>
                          </select>
                        </label>
                      {/each}
                    </div>
                  {/if}
                  {#if acceptedNameSource?.current?.kind !== 'building' ||
                    !Object.keys(addressBuildingNames(editorAddress)).length}
                    <!-- Linked names use per-field community contributions and Organisation overrides. -->
                    <DraftLocationNameFields
                      localeState={profileLocaleState}
                      names={profileLocationNames}
                      kind={acceptedNameSource?.current?.kind ?? 'unknown'}
                      {translations}
                      {isEditing}
                      recordKey={currentFeatureId}
                      onChange={names => {
                        const changed = Object.fromEntries(
                          Object.entries(names).filter(
                            ([locale, value]) => value !== profileLocationNames[locale],
                          ),
                        )
                        updateFeatureData(data => ({
                          ...data,
                          locationNames: {
                            ...(data.locationNames as
                              | Record<string, string>
                              | undefined),
                            ...changed,
                          },
                        }))
                        hasProgrammaticDirtyChanges = true
                      }}
                    />
                  {/if}
                {/snippet}
                {#snippet identityControls()}
                  {@render locationSyncControl?.(!isEditing || placeLinkBusy)}
                  {#if isNewFeatureRef}
                    {#if !draftVisibilityOverride && organisationVisibilityFailed}
                      <span role="alert" class="text-muted-foreground max-w-64 text-xs"
                        >{m.location_visibility_default_unavailable()}</span
                      >
                    {/if}
                    <LocationVisibilitySelect
                      value={draftLocationVisibility}
                      showInfo={!locationSyncControl}
                      disabled={!isEditing ||
                        placeLinkBusy ||
                        (!organisationVisibilityReady && !organisationVisibilityFailed)}
                      onChange={value => {
                        draftVisibilityOverride = value
                        hasProgrammaticDirtyChanges = true
                      }}
                    />
                  {/if}
                {/snippet}
                {#snippet identityInfo()}
                  <LocationControlsInfo />
                {/snippet}
                <FormFeatureAddress
                  {onMatchLocation}
                  localeState={profileLocaleState}
                  onLocaleStateChange={setProfileLocaleState}
                  bind:translations={
                    () => multilingualChoice ?? multilingualDefaults.addresses,
                    expanded => adminCtx.featureMultilingual.set(multilingualAccount, expanded)
                  }
                  onBuildingNameBlur={isNewFeatureRef && draftLocalKind === 'building'
                    ? () => {
                        draftLocationNames = addressBuildingNames(editorAddress)
                        void draftSearch?.resolveAssociation(
                          editorAddress,
                          draftLocationNames,
                        )
                      }
                    : undefined}
                  activeBuildingSource={draftReplacementLocationId
                    ? draftBuildingSource
                    : (draftBuildingSource ??
                      acceptedNameSource?.current?.buildingSource)}
                  activeLocationNames={profileLocationNames}
                  isLocationReplacementDraft={Boolean(draftReplacementLocationId)}
                  onMakeBuildingActive={currentFeatureId && !isNewFeatureRef
                    ? selection => {
                        buildingAssociationRequest = {
                          ...selection,
                          requestId: ++buildingAssociationRequestSequence,
                        }
                      }
                    : undefined}
                  onSuggestStreetNumber={async () =>
                    featureCoordinates
                      ? ((await draftMapController?.getStreetNumberAt?.([
                          featureCoordinates[0],
                          featureCoordinates[1],
                        ])) ?? null)
                      : null}
                  toolbarControls={!draftResolutionPending &&
                  (!isNewFeatureRef || draftLocationAccepted) &&
                  (locationSyncControl || draftLocalKind)
                    ? identityControls
                    : undefined}
                  toolbarInfo={!draftResolutionPending &&
                  (!isNewFeatureRef || draftLocationAccepted) &&
                  locationSyncControl
                    ? identityInfo
                    : undefined}
                  identityFields={draftLocalKind === 'establishment'
                    ? identityFields
                    : !isNewFeatureRef && acceptedNameSource?.current
                      ? savedIdentityFields
                      : undefined}
                  locationKind={locationKind ?? draftLocalKind}
                  {accessibilityLocationId}
                  accessibilityDraft={draftAccessibility}
                  accessibilityDraftKey={draftResultHistoryId ?? undefined}
                  onAccessibilityDraftChange={draftPlaceSource || draftLocalKind
                    ? value => {
                        draftAccessibility = value
                        if (value && Object.keys(value).length)
                          hasProgrammaticDirtyChanges = true
                      }
                    : undefined}
                  fixedMap={true}
                  coordinatesInLocationControl={isNewFeatureRef &&
                    (!draftLocationAccepted || draftResolutionPending)}
                  displayAddressInToolbar={!draftResolutionPending &&
                    (isNewFeatureRef
                      ? draftLocationAccepted && draftHasAddress
                      : !hideDetails && Boolean(locationControl))}
                  showMap={false}
                  onMapControlsChange={controls =>
                    (sharedLocationMapControls = controls)}
                  {locationActions}
                  {locationMapControls}
                  {locationControl}
                  centerLocationControl={draftResolutionPending}
                  {locationContent}
                  hideDetails={hideDetails ||
                    draftResolutionPending ||
                    (isNewFeatureRef && !draftLocationAccepted)}
                  showAddressDetails={!isNewFeatureRef ||
                    draftHasAddress ||
                    Boolean(draftLocalKind)}
                  showDivisions={!isNewFeatureRef || draftHasPin}
                  hasLocation={!isNewFeatureRef || draftHasPin}
                  showCoordinates={!draftResolutionPending &&
                    (!isNewFeatureRef ||
                      (draftHasPin &&
                        (draftFindMode === 'pin' || draftLocationAccepted)))}
                  {showLookup}
                  show3dAddressOptions={allow3dAddress &&
                    show3dAddressOptions(selectedProject?.flags)}
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
                  {streetCandidates}
                  onSelectStreet={street =>
                    updateAddressDraft(
                      setAddressName(editorAddress, 'streetName', street),
                    )}
                  candidates={addressCandidates}
                  onSelectCandidate={selectAddressCandidate}
                  onPreviewCandidate={previewAddressCandidate}
                  onCancelLookup={() => {
                    if (mapMoveBefore) {
                      cancelMapAddressMove()
                      return
                    }
                    // Invalidate pending lookups so dismissed choices cannot reappear.
                    addressLookupRevision += 1
                    isAddressLookupLoading = false
                    addressLookupMessage = ''
                    addressCandidates = []
                    streetCandidates = []
                  }}
                  onCoordinateChange={handleManualCoordinateChange}
                  onLookup={lookupOverride ?? lookupFeatureAddress}
                  onChange={updateAddressDraft}
                />
              {/snippet}
              {#if placeLinkError &&
                (pendingPlaceLink?.featureId === currentFeatureId ||
                  pendingLocalLink?.featureId === currentFeatureId)}
                <div
                  role="alert"
                  class="border-border flex shrink-0 flex-wrap items-center gap-3 border-b px-6 py-3 text-sm"
                >
                  <span
                    >{pendingPlaceLink?.accessibility || pendingLocalLink?.accessibility
                      ? m.accessibility_draft_pending()
                      : m.feature_search_link_pending_saved()}</span
                  >
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
                      draftAccessibility = undefined
                      if (pendingLocalLink)
                        sessionStorage.removeItem(
                          `feature-local-link:${pendingLocalLink.featureId}`,
                        )
                      pendingLocalLink = null
                      draftLocalKind = undefined
                      placeLinkError = false
                    }}
                  >
                    {pendingPlaceLink?.accessibility || pendingLocalLink?.accessibility
                      ? m.accessibility_draft_discard()
                      : m.feature_search_keep_address()}
                  </button>
                </div>
              {/if}
              {#if currentFeatureId && feature?.data?.modifiedAt}
                <FeatureLocationSection
                  allowedLocationKinds={eligibleTargetKinds}
                  preferredKind={effectiveTargetContext ?? undefined}
                  pendingLocation={draftLocalKind || draftPlaceSource
                    ? {
                        names:
                          draftLocalKind === 'building'
                            ? addressBuildingNames(editorAddress)
                            : draftLocationNames,
                        kind: draftLocalKind ?? 'establishment',
                      }
                    : undefined}
                  onStartEditing={() => headerCtrl.setEditing(true)}
                  onCancelEditing={() => {
                    onReset()
                    headerCtrl.setEditing(false)
                  }}
                  organisationId={selectedProject?.organisationId}
                  {buildingAssociationRequest}
                  onBuildingAssociationRequestConsumed={requestId => {
                    if (buildingAssociationRequest?.requestId === requestId)
                      buildingAssociationRequest = null
                  }}
                  onAssociationPending={pending => (draftResolutionPending = pending)}
                  onAssociationSpaceNeeded={overflow =>
                    featureVisualSection?.makeRoom(overflow)}
                  onSelectionStart={() => featureVisualSection?.rememberHeight()}
                  onReturnToResults={restoreLocationSearchMap}
                  onAssociationSelected={(result, previousLocationId) => {
                    featureVisualSection?.restoreAfterFit(320)
                    draftReplacementLocationId = previousLocationId
                    // Catalogue selections may carry identity evidence without an explicit local kind.
                    draftLocalKind = result.source
                      ? undefined
                      : (result.localKind ??
                        (result.kind !== 'establishment' ? result.kind : undefined))
                    draftLocationNames = { ...result.names }
                    draftAddressIdentity = result.identity
                    draftBuildingSource = result.buildingSource
                    draftLocalNameMode =
                      featurePresentationPolicy.locationBasedNames ||
                      (currentFeatureData.locationNameMode ??
                        acceptedNameSource?.current?.nameMode) === 'inherit'
                        ? 'inherit'
                        : 'independent'
                    draftPlaceSource = result.source
                      ? { ...result.source, nameMode: draftLocalNameMode }
                      : null
                    updateAddressDraft(result.address)
                    if (result.address.coordinates)
                      handleCoordinateChange(result.address.coordinates)
                    hasProgrammaticDirtyChanges = true
                  }}
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
                  onSourceUpdate={refreshLocationSource}
                >
                  {#snippet children(
                    locationControl,
                    locationContent,
                    hideDetails,
                    showLookup,
                    lookupOverride,
                    locationActions,
                    locationMapControls,
                    allow3dAddress,
                    accessibilityLocationId,
                    locationKind,
                    locationSyncControl,
                    onMatchLocation,
                  )}
                    {@render locationEditor(
                      locationControl,
                      locationContent,
                      hideDetails,
                      showLookup,
                      lookupOverride,
                      locationActions,
                      locationMapControls,
                      allow3dAddress,
                      accessibilityLocationId,
                      locationKind,
                      locationSyncControl,
                      onMatchLocation,
                    )}
                  {/snippet}
                </FeatureLocationSection>
              {:else if isNewFeatureRef}
                <DraftFeatureLocationSearch
                  projectId={projectIdValue}
                  allowedLocationKinds={eligibleTargetKinds}
                  suggestionKinds={selectedTargetContext
                    ? targetSuggestionKinds(selectedTargetContext)
                    : undefined}
                  preferredKind={selectedTargetContext ?? undefined}
                  initialMode="search"
                  bind:this={draftSearch}
                  onFilterPanelChange={panel => (draftSearchFilterPanel = panel)}
                  onResultsChange={hasResults => (draftSearchHasResults = hasResults)}
                  onResolutionPendingChange={pending =>
                    (draftResolutionPending = pending)}
                  onAssociationSpaceNeeded={overflow =>
                    featureVisualSection?.makeRoom(overflow)}
                  onSelectionStart={() => featureVisualSection?.rememberHeight()}
                  onReturnToResults={restoreLocationSearchMap}
                  onResultsEnd={() => {
                    const button = document.getElementById('draft-manual-entry')
                    if (!button) return false
                    button.focus()
                    return document.activeElement === button
                  }}
                  active={isLocationFacet &&
                    !needsLayerSelection &&
                    Boolean(selectedFeatureType && selectedTargetContext)}
                  canReturnToResults={isNewFeatureRef && !draftSelectionSaved}
                  focusRequest={locationFocusRequest}
                  onSelect={selectDraftLocation}
                  currentAddress={editorAddress}
                  currentNameMode={profileNameMode}
                  locationName={draftLocationNames[ADDRESS_LOCALES[getLocaleKey()]] ??
                    ''}
                  onPreview={previewDraftLocation}
                  onUnlink={() => {
                    draftAccessibility = undefined
                    draftPlaceSource = null
                    draftLocalKind = undefined
                    draftBuildingSource = undefined
                    draftAddressIdentity = undefined
                    // Turning sync off retains the reviewed address, Location kind and name.
                    if (editorAddress.association)
                      updateAddressDraft({
                        ...editorAddress,
                        association: {
                          ...editorAddress.association,
                          mode: 'manual',
                          lookup: 'not-checked',
                          targetId: undefined,
                        },
                      })
                  }}
                  onAcceptedChange={accepted => {
                    draftLocationAccepted = accepted
                    if (accepted && setupStep === 3) {
                      setupStep = 4
                      goToFacet('core')
                    }
                  }}
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
                  {#snippet children(
                    searchControl,
                    searchResults,
                    mapControls,
                    syncControl,
                  )}
                    {@render locationEditor(
                      searchControl,
                      searchResults,
                      false,
                      draftLocationAccepted,
                      undefined,
                      undefined,
                      mapControls,
                      true,
                      undefined,
                      undefined,
                      syncControl,
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
        class="right-0! left-0!"
        attrs={{ 'data-facet-id': 'updates' }}
      >
        {#if currentFeatureId &&
          !isNewFeatureRef &&
          (isUpdatesFacet || visitedUpdatesRef === featureRef)}
          {#key currentFeatureId}
            <Deferred
              load={() =>
                import('#lib/bits/patterns/revisionHistory/FeatureHistory.svelte')}
            >
              {#snippet pending()}
                <HistorySkeleton />
              {/snippet}
              {#snippet children(module)}
                <module.default
                  featureId={currentFeatureId}
                  refreshVersion={revisionWorkspaceVersion}
                />
              {/snippet}
            </Deferred>
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
            <Deferred
              load={() => import('#lib/bits/patterns/images/FeatureImageEditor.svelte')}
            >
              {#snippet pending()}
                <ImageWorkspaceSkeleton gallery />
              {/snippet}
              {#snippet children(gallery)}
                <gallery.default featureId={currentFeatureId ?? undefined}>
                  {#snippet textControls(imageId, hasText)}
                    {#if currentFeatureId}
                      {#key currentFeatureId}
                        <Deferred
                          load={() =>
                            import(
                              '#lib/bits/patterns/revisionHistory/FeatureGalleryImageTextEditor.svelte'
                            )}
                        >
                          {#snippet pending()}
                            <LoadingSkeleton text="Image text" class="text-sm" />
                          {/snippet}
                          {#snippet children(module)}
                            <module.default
                              featureId={currentFeatureId}
                              {imageId}
                              {hasText}
                              {isDirty}
                              onSaved={() => {
                                revisionWorkspaceVersion++
                                toast.success('Image text saved.')
                              }}
                            />
                          {/snippet}
                        </Deferred>
                      {/key}
                    {/if}
                  {/snippet}
                </gallery.default>
              {/snippet}
            </Deferred>
          </ImageProvider>
        {/if}
      </Main.Facet>
      {#if currentFeatureData.locationNameMode}
        <input
          {...formCtx.form.fields.data.locationNameMode.as(
            'hidden',
            currentFeatureData.locationNameMode,
          )}
        >
      {/if}
    {/if}
  </Main.Form>
</Main.Root>

{#if feature?.data?.isPublished &&
  imagePublicationPrompt?.featureId === feature.data.id &&
  imagePublicationPrompt?.routeRef === featureRef}
  <PublishUnclassifiedImagesDialog
    scopeType="feature"
    scopeId={feature.data.id}
    onDone={() => {
      imagePublicationPrompt = null
      void refreshRemoteQuery(
        getFeature({
          ref: featureRef,
          refKey: 'code',
          meta: { isAdminRequest: true, profile: 'admin' },
        }),
      )
    }}
  />
{/if}
