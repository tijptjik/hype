<script lang="ts">
// APP
import { page } from '$app/state'
// SVELTE
import { onDestroy, untrack } from 'svelte'
import { debounce } from '@sillvva/utils'
import { toast } from 'svelte-sonner'
// ADAPTERS
import { createAdminIndexCardModel } from '#lib/adapters/cards/createAdminIndexCardModel.js'
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
import { getRootCTX } from '#lib/context/root.svelte.js'
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
// REMOTE
import { updateFeatureBulkState } from '#lib/api/feature.remote.js'
import { getFeatureIndexPage } from '#lib/api/featureIndex.remote.js'
import { featureOriginLabels } from '#lib/fieldResearch/model.js'
import type { FeatureIndexQuery } from '#lib/features/indexQuery.js'
import { refreshRemoteQuery, readFreshRemoteQuery } from '#lib/remote/index.js'
// SERVICES
import { collectBulkSelection } from '#lib/client/services/bulkSelection.js'
import { matchesFeaturePrisms } from '#lib/client/services/featureQuery.js'
import { runBulkCommands } from '#lib/client/services/bulkCommands.js'
import { patchBulkFeatureRows } from '#lib/client/services/bulkFeatureRows.js'
import { getCachedFeatureRowModel } from '#lib/client/services/featureRow.js'
import {
  createPropertyFilterSection,
  createSortable,
  createSortables,
  createToggleFilter,
  createSelectFilter,
  createTranslationFilter,
} from '#lib/client/services/filters.js'
// BITS PATTERNS
import CompletionFooter from '#lib/bits/patterns/resource/completionFooter/CompletionFooter.svelte'
import FeatureRow from '#lib/bits/patterns/resource/rows/FeatureRow/FeatureRow.svelte'
import IndexCard from '#lib/bits/patterns/cards/indexCard/IndexCard.svelte'
import ResourceControlBar from '#lib/bits/patterns/resource/resourceControlBar/ResourceControlBar.svelte'
import ResourceIndex from '#lib/bits/patterns/resource/resourceIndex/ResourceIndex.svelte'
// ENUMS
import { FirstClassResource } from '#lib/enums.js'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// ICONS
import FeatureIcon from 'virtual:icons/proicons/location'
import StatusIcon from 'virtual:icons/proicons/target'
import BookOpenIcon from 'virtual:icons/proicons/book-open'
import LanguagesIcon from 'virtual:icons/tabler/language'
import ImageIcon from 'virtual:icons/proicons/photo'
import TagsIcon from 'virtual:icons/proicons/tag-multiple'
import PenLineIcon from 'virtual:icons/proicons/compose'
import CopyrightIcon from 'virtual:icons/proicons/copyright'
// TYPES
import type { ImageCtxEnvelope } from '#lib/db/zod/schema/image.types.js'
import type { Feature } from '#lib/db/zod/schema/feature.types.js'
import type {
  FeatureTextSearchWorkerRequest,
  FeatureTextSearchWorkerResponse,
} from '#lib/client/services/featureTextSearch.types.js'
import type {
  FeatureBulkStateResult,
  ResourceIndexRowSelectionState,
  ResourceBulkEditProgress,
} from '#lib/client/services/bulkEdit.types.js'
import type { KeyMap } from '#lib/client/services/resourceCards.types.js'
import type { ResourceControlBarConfig } from '#lib/client/services/resourceFilters.types.js'
import type { Resource, LocaleKey } from '#lib/types.js'
// TYPES
import type { ResourceBulkEditOption } from '#lib/client/services/bulkEdit.types.js'

let {
  showTotalCount = false,
  onCreate,
  locationScope,
  brandId,
  readOnly = false,
}: {
  showTotalCount?: boolean
  onCreate?: () => void
  locationScope?: FeatureIndexQuery['location']
  brandId?: string
  readOnly?: boolean
} = $props()

type FeatureBulkStateField =
  | 'isPublished'
  | 'isArchived'
  | 'isIntangible'
  | 'isVisitable'

type FeatureBulkEditOption = ResourceBulkEditOption & {
  field: FeatureBulkStateField
  state: boolean
  pastTense: string
}

const BULK_FEATURE_UPDATE_CHUNK_SIZE = 100

const featureIndexCardKeyMap: KeyMap = {
  id: 'id',
  title: 'i18n.title',
  subtitle: 'i18n.addressProperties.neighbourhood',
  description: 'i18n.displayAddress',
  image: 'image',
  badges: [],
}

// CONTEXT
const adminCtx = getAdminCtx()

let researchSessionOptions = $state<{ value: string; label: string }[]>([])
const filters = $derived({
  resource: FirstClassResource.feature,
  sections: [
    {
      key: 'origin',
      title: 'Origin',
      icon: FeatureIcon,
      filters: [
        createSelectFilter('origin', {
          label: 'Origin',
          placeholder: 'Any origin',
          allowDeselect: true,
          options: [
            ...Object.entries(featureOriginLabels).map(([value, label]) => ({
              value,
              label,
            })),
            { value: 'unknown', label: 'Unknown' },
          ],
        }),
        ...(adminCtx.view.filters.viewFilters.feature.origin === 'field_research'
          ? [
              createSelectFilter('originId', {
                label: 'Session',
                placeholder: 'Any session',
                allowDeselect: true,
                options: researchSessionOptions,
              }),
            ]
          : []),
      ],
    },
    {
      key: 'status',
      title: m.filters__status(),
      icon: StatusIcon,
      filters: [
        createToggleFilter('isPendingReview', {
          label: m.plain_broad_shell_dart(),
          invertBoolean: true,
          falseLabel: m.filters__not(),
          trueLabel: m.filters__is(),
        }),
        createToggleFilter('isPublished', {
          label: m.published(),
          falseLabel: m.filters__not(),
          trueLabel: m.filters__is(),
        }),
        createToggleFilter('isVisitable', {
          label: m.dry_aware_squirrel_cheer(),
          falseLabel: m.filters__not(),
          trueLabel: m.filters__is(),
        }),
        createToggleFilter('isIntangible', {
          label: m.teary_fit_maggot_heart(),
          falseLabel: m.filters__not(),
          trueLabel: m.filters__is(),
        }),
        createToggleFilter('isArchived', {
          label: m.bad_swift_cheetah_surge(),
          falseLabel: m.filters__not(),
          trueLabel: m.filters__is(),
          superAdminOnly: true,
        }),
      ],
    },
    {
      key: 'authorship',
      title: m.filters__content(),
      icon: BookOpenIcon,
      filters: [
        createToggleFilter('hasLocation', {
          label: 'Location association',
          falseLabel: 'Missing',
          trueLabel: 'Linked',
          transformOffset: 8,
        }),
        createToggleFilter('hasTitle', {
          label: m.feature__title(),
          falseLabel: m.filters__no(),
          trueLabel: m.filters__has(),
          transformOffset: 8,
        }),
        createToggleFilter('hasDescription', {
          label: m.feature__description(),
          falseLabel: m.filters__no(),
          trueLabel: m.filters__has(),
          transformOffset: 8,
        }),
        createToggleFilter('hasDisplayAddress', {
          label: m.feature__address(),
          falseLabel: m.filters__no(),
          trueLabel: m.filters__has(),
          transformOffset: 8,
        }),
      ],
    },
    {
      key: 'translation',
      title: m.filters__translation(),
      icon: LanguagesIcon,
      filters: [
        createTranslationFilter('isTitleTranslated', {
          label: m.feature__title(),
        }),
        createTranslationFilter('isDescriptionTranslated', {
          label: m.feature__description(),
        }),
        createTranslationFilter('isAddressTranslated', {
          label: m.feature__address(),
        }),
        createTranslationFilter('isSpecifierTranslated', {
          label: m.spicy_ideal_butterfly_revive(),
          superAdminOnly: true,
        }),
      ],
    },
    {
      key: 'image',
      title: m.filters__image(),
      icon: ImageIcon,
      filters: [
        createToggleFilter('hasImage', {
          label: m.feature__images(),
          falseLabel: m.filters__no(),
          trueLabel: m.awful_ok_polecat_rise(),
          transformOffset: 8,
        }),
        createToggleFilter('isOneImagePublished', {
          label: m.published(),
          falseLabel: m.royal_civil_goldfish_fetch(),
          trueLabel: m.awful_ok_polecat_rise(),
          transformOffset: 8,
        }),
        createToggleFilter('isAllImagePublished', {
          label: m.published(),
          falseLabel: m.filters__not_all(),
          trueLabel: m.filters__all(),
          transformOffset: 8,
        }),
      ],
    },
    {
      key: 'license',
      title: m.field_license(),
      icon: CopyrightIcon,
      filters: [
        createToggleFilter('isAllRightsReserved', {
          label: 'Ⓒ',
          tooltip: 'All rights reserved for all content',
          falseLabel: m.filters__no(),
          trueLabel: m.filters__is(),
        }),
        createToggleFilter('isPublicDomain', {
          label: '🄏',
          tooltip: 'Public domain commitment for all content',
          falseLabel: m.filters__no(),
          trueLabel: m.filters__is(),
        }),
        createToggleFilter('hasLicenseBy', {
          label: 'BY',
          tooltip: 'Attribution required for all content',
          falseLabel: m.filters__no(),
          trueLabel: m.filters__is(),
        }),
        createToggleFilter('hasLicenseSa', {
          label: 'SA',
          tooltip: 'Share alike for all content',
          falseLabel: m.filters__no(),
          trueLabel: m.filters__is(),
        }),
        createToggleFilter('hasLicenseNc', {
          label: 'NC',
          tooltip: 'Non-commercial for all content',
          falseLabel: m.filters__no(),
          trueLabel: m.filters__is(),
        }),
        createToggleFilter('hasLicenseNd', {
          label: 'ND',
          tooltip: 'No derivatives for all content',
          falseLabel: m.filters__no(),
          trueLabel: m.filters__is(),
        }),
      ],
    },
    createPropertyFilterSection({
      key: 'classifier',
      title: m.sunny_day_lemur_conquer_short(),
      icon: TagsIcon,
      type: 'property',
      propertyType: 'classifier',
    }),
    createPropertyFilterSection({
      key: 'specifier',
      title: m.admin__forms_common_specifiers_short(),
      icon: PenLineIcon,
      type: 'property',
      propertyType: 'specifier',
      falseLabel: m.filters__no(),
      trueLabel: m.filters__has(),
      transformOffset: -10,
    }),
  ],
} satisfies ResourceControlBarConfig)

const sortables = createSortables([
  createSortable('modifiedAt', m.sort__updated()),
  createSortable('createdAt', m.sort__age()),
  createSortable('title', m.feature__title()),
  createSortable('description', m.filters__content()),
  createSortable('displayAddress', m.feature__address()),
])

// CONTEXT

// Session filters only apply to field research; clear retained selections on origin changes.
$effect(() => {
  const featureFilters = adminCtx.view.filters.viewFilters.feature
  if (featureFilters.origin !== 'field_research' && featureFilters.originId) {
    adminCtx.view.filters.viewFilters.feature = { ...featureFilters, originId: null }
  }
})
const root = getRootCTX()
const headerCtrl = getHeaderCtrl()
adminCtx.setFacet(false, false, FirstClassResource.feature)
const isSearchFocused = $derived(headerCtrl.isSearchFocused)
const featureLayoutMode = $derived(
  adminCtx.listUi.state.layoutMode[FirstClassResource.feature],
)
const activeSearchResultCap = $derived(featureLayoutMode === 'card' ? 12 : 20)

// Initial rows and count now share one authoritative, bounded request.
let indexInitialised = $state(false)

// STATE
let listContainer: HTMLElement | null = $state(null)
let featureTextSearchWorker = $state.raw<Worker | null>(null)
let workerIndexVersion = $state(0)
let latestWorkerRequestId = $state(0)
let workerFilteredIds = $state.raw<string[] | null>(null)
let latestRemoteRequestId = $state(0)
let remoteQuery = $state('')
let remoteMatchedEntities = $state.raw<Feature[] | null>(null)
let remoteHasMore = $state<boolean | null>(null)
let remoteNextOffset = $state(0)
let remoteLoadingMore = $state(false)
let remotePending = $state(false)
let remotePageError = $state<unknown>(null)
let searchRetry = $state(0)
let remoteSortSignature = $state('')
let remoteOwnerSignature = $state('')
let debouncedRemoteQuery = $state('')
let optimisticEntities = $state.raw<Feature[]>([])
let entities = $state.raw<Feature[]>([])
let footerEntities = $state.raw<Feature[]>([])
const textQuery = $derived(adminCtx.view.filters.values.feature.text ?? '')
const normalizedTextQuery = $derived(textQuery.trim())
const ownerSignature = $derived(
  JSON.stringify([
    locationScope,
    brandId,
    adminCtx.view.resources.scopeKey,
    adminCtx.view.cacheCtx.generation,
  ]),
)
const sortSignature = $derived.by(() => {
  const sorting = adminCtx.view.filters.sorting.feature
  return `${sorting.sortBy}:${sorting.sortOrder}`
})
const searchSignature = $derived(
  JSON.stringify([
    sortSignature,
    adminCtx.view.featuresQueryKey(),
    locationScope,
    brandId,
    adminCtx.view.resources.scopeKey,
    adminCtx.view.cacheCtx.generation,
    getLocaleKey(),
    adminCtx.view.filters.viewFilters.feature,
  ]),
)

const displayEntities = $derived(
  isSearchFocused && normalizedTextQuery !== ''
    ? entities.slice(0, activeSearchResultCap)
    : entities,
)

let selectedImage = $state<ImageCtxEnvelope | null>(null)
let selectedFeature = $state<Feature | null>(null)
let selectedFeatureIndex = $state<number>(-1)
let isBulkEditActive = $state(false)
let selectedBulkActionValue = $state('publish')
let bulkSelectedFeatureIds = $state.raw<Set<string>>(new Set())
let bulkAllMatchingIds = $state.raw<string[] | null>(null)
let isSelectingAll = $state(false)
let bulkSelectionRevision = 0
const bulkSelectionScope = $derived(
  JSON.stringify([
    searchSignature,
    normalizedTextQuery,
    adminCtx.view.filters.viewFilters.feature,
  ]),
)
let activeBulkSelectionScope = $state('')
let matchingCount = $state<number | null>(null)
let matchingCountLoading = $state(true)
let matchingCountRevision = $state(0)
onDestroy(() => {
  bulkSelectionRevision++
  featureTextSearchWorker?.terminate()
})
let bulkRowResultsById = $state.raw<Map<string, ResourceIndexRowSelectionState>>(
  new Map(),
)
let bulkErrorMessagesById = $state.raw<Map<string, string>>(new Map())
let bulkProgress = $state<ResourceBulkEditProgress | null>(null)

const localeKey = $derived(getLocaleKey())
const activeTranslationLocales = $derived.by(() => {
  const locales: LocaleKey[] = []
  const translationLocales =
    adminCtx.view.filters.viewFilters.feature.translationLocales

  for (const [locale, isActive] of Object.entries(translationLocales)) {
    if (isActive) locales.push(locale as LocaleKey)
  }

  return locales
})
const isSuperAdmin = $derived(
  Boolean(
    adminCtx.view.user &&
      'superAdmin' in adminCtx.view.user &&
      adminCtx.view.user.superAdmin,
  ),
)
const bulkFeatureEditOptions = $derived.by(() => {
  const options: FeatureBulkEditOption[] = [
    {
      value: 'publish',
      label: 'Publish',
      field: 'isPublished',
      state: true,
      pastTense: 'published',
    },
    {
      value: 'unpublish',
      label: 'Unpublish',
      field: 'isPublished',
      state: false,
      pastTense: 'unpublished',
    },
    {
      value: 'set-tangible',
      label: 'Set tangible',
      field: 'isIntangible',
      state: false,
      pastTense: 'set tangible',
    },
    {
      value: 'set-intangible',
      label: 'Set intangible',
      field: 'isIntangible',
      state: true,
      pastTense: 'set intangible',
    },
    {
      value: 'set-accessible',
      label: 'Set accessible',
      field: 'isVisitable',
      state: true,
      pastTense: 'set accessible',
    },
    {
      value: 'set-inaccessible',
      label: 'Set inaccessible',
      field: 'isVisitable',
      state: false,
      pastTense: 'set inaccessible',
    },
  ]

  if (isSuperAdmin) {
    options.splice(
      2,
      0,
      {
        value: 'archive',
        label: 'Archive',
        field: 'isArchived',
        state: true,
        pastTense: 'archived',
      },
      {
        value: 'unarchive',
        label: 'Unarchive',
        field: 'isArchived',
        state: false,
        pastTense: 'unarchived',
      },
    )
  }

  return options
})
const selectedBulkAction = $derived(
  bulkFeatureEditOptions.find(option => option.value === selectedBulkActionValue) ??
    bulkFeatureEditOptions[0],
)
const selectedBulkFeatureIds = $derived.by(() => {
  if (!isBulkEditActive || featureLayoutMode === 'card') return []
  return [...bulkSelectedFeatureIds]
})
const isBulkApplyDisabled = $derived(
  !isBulkEditActive ||
    !selectedBulkAction ||
    selectedBulkFeatureIds.length === 0 ||
    isSelectingAll ||
    activeBulkSelectionScope !== bulkSelectionScope ||
    Boolean(bulkProgress?.isApplying),
)
const baseEntities = $derived(
  adminCtx.view.filters.applyFeatureViewFilters(
    adminCtx.view.filters.getFilteredResource<Feature>(FirstClassResource.feature, {
      text: false,
      state: true,
    }),
  ) as Feature[],
)
const baseEntitiesById = $derived.by(
  () => new Map(baseEntities.map(feature => [feature.id, feature])),
)

const remoteMatchesCurrentQuery = $derived(
  remoteMatchedEntities !== null &&
    remoteSortSignature === searchSignature &&
    remoteQuery === normalizedTextQuery,
)
const searchIsReady = $derived(remoteMatchesCurrentQuery || Boolean(remotePageError))
const indexHasMore = $derived(remoteMatchesCurrentQuery && remoteHasMore === true)
// Search focus deliberately caps visible matches; do not page beyond that hidden boundary.
const indexCanLoadMore = $derived(
  indexHasMore &&
    (!isSearchFocused ||
      !normalizedTextQuery ||
      entities.length < activeSearchResultCap),
)
const indexComplete = $derived(
  indexInitialised &&
    searchIsReady &&
    !indexHasMore &&
    !remotePending &&
    !remoteLoadingMore &&
    !remotePageError &&
    !adminCtx.featurePageError,
)

/** Append a bounded search or collection page without disturbing mounted result rows.
 * @returns Completion; changed search/sort/scope identities discard late pages.
 */
async function loadMoreFeatureResults(): Promise<void> {
  if (
    !remoteHasMore ||
    remoteLoadingMore ||
    remotePending ||
    !remoteMatchesCurrentQuery
  )
    return
  const requestId = latestRemoteRequestId
  const query = normalizedTextQuery
  const signature = searchSignature
  remoteLoadingMore = true
  remotePageError = null
  try {
    const result = await refreshRemoteQuery(
      getFeatureIndexPage({
        location: locationScope,
        brandId,
        conditions: adminCtx.view.isSuperAdmin()
          ? { isArchived: null, isPublished: null }
          : { isArchived: false, isPublished: null },
        prisms: adminCtx.view.scope.prisms,
        sorting: adminCtx.view.filters.sorting.feature as FeatureIndexQuery['sorting'],
        filters: adminCtx.view.filters.viewFilters.feature,
        q: query,
        pagination: { limit: 50, offset: remoteNextOffset },
        includeCount: false,
        summaryOnly: true,
        meta: { ...adminCtx.view.resources.queryMeta, profile: 'admin' },
      }),
    )
    if (
      requestId !== latestRemoteRequestId ||
      query !== normalizedTextQuery ||
      signature !== searchSignature
    )
      return
    const hasMore = result.hasMore ?? false
    const nextOffset = result.nextOffset ?? remoteNextOffset + result.data.length
    // Preserve the current matches and cursor if the search continuation cannot advance.
    if (hasMore && (result.data.length === 0 || nextOffset <= remoteNextOffset))
      throw new Error('Feature search pagination did not advance')
    remoteMatchedEntities = toUniqueFeatures([
      ...(remoteMatchedEntities ?? []),
      ...(result.data as Feature[]),
    ])
    remoteHasMore = hasMore
    remoteNextOffset = nextOffset
  } catch (error) {
    if (
      requestId === latestRemoteRequestId &&
      query === normalizedTextQuery &&
      signature === searchSignature
    )
      remotePageError = error
  } finally {
    if (requestId === latestRemoteRequestId) remoteLoadingMore = false
  }
}

function buildFeatureSearchIndex(feature: Feature) {
  const textObject = feature.i18n?.[localeKey] ?? feature.i18n?.en
  return {
    id: feature.id,
    title: textObject?.title ?? '',
    description: textObject?.description ?? '',
    displayAddress: textObject?.displayAddress ?? '',
    contributor: feature.contributor?.name ?? '',
  }
}

function handleFeatureTextSearchWorkerMessage(
  event: MessageEvent<FeatureTextSearchWorkerResponse>,
): void {
  const message = event.data

  if (message.type !== 'result') return
  if (message.indexVersion !== workerIndexVersion) return
  if (message.requestId !== latestWorkerRequestId) return

  workerFilteredIds = message.ids
}

function toUniqueFeatures(features: Feature[]): Feature[] {
  const seen = new Set<string>()
  const result: Feature[] = []

  for (const feature of features) {
    if (seen.has(feature.id)) continue
    seen.add(feature.id)
    result.push(feature)
  }

  return result
}

function setBulkMode(nextActive: boolean): void {
  isBulkEditActive = nextActive
  bulkSelectionRevision++
  isSelectingAll = false
  bulkAllMatchingIds = null
  activeBulkSelectionScope = bulkSelectionScope
  bulkSelectedFeatureIds = new Set(
    nextActive ? displayEntities.map(feature => feature.id) : [],
  )
  bulkRowResultsById = new Map()
  bulkErrorMessagesById = new Map()
  bulkProgress = null
}

function toggleBulkMode(): void {
  setBulkMode(!isBulkEditActive)
}

function setSelectedBulkAction(value: string): void {
  bulkSelectionRevision++
  selectedBulkActionValue = value
  bulkRowResultsById = new Map()
  bulkErrorMessagesById = new Map()
  bulkProgress = null
}

function getFeatureBulkRowSelectionState(
  feature: Feature,
): ResourceIndexRowSelectionState | null {
  if (!isBulkEditActive || featureLayoutMode === 'card') return null

  const resultState = bulkRowResultsById.get(feature.id)
  if (resultState) return resultState

  return bulkSelectedFeatureIds.has(feature.id) ? 'selected' : null
}

/** Toggle one row without implicitly selecting later pages. @param feature Row to toggle. @returns Nothing. */
function toggleFeatureBulkSelection(feature: Feature): void {
  if (
    !isBulkEditActive ||
    featureLayoutMode === 'card' ||
    isSelectingAll ||
    bulkProgress?.isApplying
  )
    return
  const selected = new Set(bulkSelectedFeatureIds)
  if (selected.has(feature.id)) selected.delete(feature.id)
  else selected.add(feature.id)
  bulkSelectedFeatureIds = selected
  bulkRowResultsById = new Map()
  bulkErrorMessagesById = new Map()
  bulkProgress = null
}

/** Invert the complete selected universe, including unloaded matches after Select all. @returns Nothing. */
function invertFeatureBulkSelection(): void {
  if (
    !isBulkEditActive ||
    featureLayoutMode === 'card' ||
    isSelectingAll ||
    bulkProgress?.isApplying
  )
    return
  const ids = bulkAllMatchingIds ?? displayEntities.map(feature => feature.id)
  bulkSelectedFeatureIds = new Set(ids.filter(id => !bulkSelectedFeatureIds.has(id)))
  bulkRowResultsById = new Map()
  bulkErrorMessagesById = new Map()
  bulkProgress = null
}

/** Resolve all authorized matches before publishing a complete selection. @returns Completion of selection only; no records are changed. */
async function selectAllFeatureMatches(): Promise<void> {
  if (!isBulkEditActive || isSelectingAll || bulkProgress?.isApplying) return
  const revision = ++bulkSelectionRevision
  const scope = bulkSelectionScope
  const query = normalizedTextQuery
  const prisms = structuredClone($state.snapshot(adminCtx.view.scope.prisms))
  const sorting = {
    ...adminCtx.view.filters.sorting.feature,
  } as FeatureIndexQuery['sorting']
  const meta = { ...adminCtx.view.resources.queryMeta, profile: 'admin' as const }
  const conditions = adminCtx.view.isSuperAdmin()
    ? { isArchived: null, isPublished: null }
    : { isArchived: false, isPublished: null }
  const isCurrent = (): boolean =>
    isBulkEditActive &&
    revision === bulkSelectionRevision &&
    scope === bulkSelectionScope
  isSelectingAll = true
  try {
    const ids = await collectBulkSelection<{ id: string }>(
      async offset =>
        await refreshRemoteQuery(
          getFeatureIndexPage({
            location: locationScope,
            brandId,
            conditions,
            prisms,
            sorting,
            filters: adminCtx.view.filters.viewFilters.feature,
            idsOnly: true,
            includeCount: false,
            summaryOnly: true,
            q: query,
            pagination: { limit: 100, offset },
            meta,
          }),
        ),
      rows => rows,
      isCurrent,
    )
    if (ids && isCurrent()) {
      bulkAllMatchingIds = ids
      bulkSelectedFeatureIds = new Set(ids)
      bulkRowResultsById = new Map()
      bulkErrorMessagesById = new Map()
      bulkProgress = null
    }
  } catch {
    if (isCurrent()) toast.error('Could not select all matches. Please retry.')
  } finally {
    if (revision === bulkSelectionRevision) isSelectingAll = false
  }
}

function toFeatureBulkChunks(ids: string[]): string[][] {
  const chunks: string[][] = []

  for (let index = 0; index < ids.length; index += BULK_FEATURE_UPDATE_CHUNK_SIZE) {
    chunks.push(ids.slice(index, index + BULK_FEATURE_UPDATE_CHUNK_SIZE))
  }

  return chunks
}

function recordBulkResult(result: FeatureBulkStateResult): void {
  const nextResults = new Map(bulkRowResultsById)
  const nextErrors = new Map(bulkErrorMessagesById)

  nextResults.set(result.id, result.ok ? 'success' : 'error')
  if (result.ok) {
    nextErrors.delete(result.id)
  } else {
    nextErrors.set(result.id, result.error)
  }

  bulkRowResultsById = nextResults
  bulkErrorMessagesById = nextErrors
  bulkProgress = {
    completed: (bulkProgress?.completed ?? 0) + 1,
    total: bulkProgress?.total ?? selectedBulkFeatureIds.length,
    errors: (bulkProgress?.errors ?? 0) + (result.ok ? 0 : 1),
    isApplying: true,
  }
}

function toBulkRemoteFailureResult(id: string, err: unknown): FeatureBulkStateResult {
  const message = err instanceof Error ? err.message : 'FEATURE_UPDATE_FAILED'
  return {
    id,
    ok: false,
    error: message,
  }
}

/**
 * Publishes confirmed state and revision values into both rendered collections.
 * @param results Completed bulk command outcomes.
 * @returns Nothing.
 */
function patchSuccessfulBulkUpdates(results: FeatureBulkStateResult[]): void {
  if (!results.some(result => result.ok)) return
  matchingCountRevision++
  adminCtx.view.setSortedResourceState(
    FirstClassResource.feature,
    patchBulkFeatureRows(adminCtx.view.queries.rows.feature, results),
  )
  if (remoteMatchedEntities)
    remoteMatchedEntities = patchBulkFeatureRows(remoteMatchedEntities, results)
}

function showBulkErrorToasts(errorMessages: string[]): void {
  const groupedErrors = new Map<string, number>()

  for (const message of errorMessages) {
    groupedErrors.set(message, (groupedErrors.get(message) ?? 0) + 1)
  }

  for (const [message, count] of groupedErrors) {
    toast.error(`${count} feature${count === 1 ? '' : 's'} failed to update`, {
      description: message,
    })
  }
}

async function applyFeatureBulkEdit(): Promise<void> {
  const action = selectedBulkAction
  if (!action || isBulkApplyDisabled) return

  const ids = [...selectedBulkFeatureIds]
  const revision = bulkSelectionRevision
  const scope = bulkSelectionScope
  const roleScope = adminCtx.view.getRoleScopeQueryKey()
  const selection = bulkSelectedFeatureIds
  const actionValue = selectedBulkActionValue
  const isCurrent = (): boolean =>
    isBulkEditActive &&
    revision === bulkSelectionRevision &&
    scope === bulkSelectionScope &&
    roleScope === adminCtx.view.getRoleScopeQueryKey() &&
    selection === bulkSelectedFeatureIds &&
    actionValue === selectedBulkActionValue
  bulkRowResultsById = new Map()
  bulkErrorMessagesById = new Map()
  bulkProgress = {
    completed: 0,
    total: ids.length,
    errors: 0,
    isApplying: true,
  }

  const accountRevision = root.account.revision
  const ownsAccount = (): boolean => root.account.revision === accountRevision
  await root.backgroundJobs
    .run(
      `Features ${action.pastTense}`,
      ids.length,
      async advance => {
        const results = await runBulkCommands(
          toFeatureBulkChunks(ids),
          async chunk => {
            try {
              return await updateFeatureBulkState(
                chunk.map(id => ({
                  id,
                  field: action.field,
                  value: action.state,
                  meta: { isAdminRequest: true },
                })),
              )
            } catch (err) {
              return chunk.map(id => toBulkRemoteFailureResult(id, err))
            }
          },
          chunkResults => {
            advance(
              chunkResults.length,
              chunkResults.filter(result => !result.ok).length,
            )
            if (isCurrent()) for (const result of chunkResults) recordBulkResult(result)
          },
          ownsAccount,
        )
        if (!results || !ownsAccount()) return false

        const errors = results.filter(result => !result.ok)
        if (isCurrent()) patchSuccessfulBulkUpdates(results)
        if (isCurrent())
          bulkProgress = {
            completed: results.length,
            total: ids.length,
            errors: errors.length,
            isApplying: false,
          }

        try {
          await root.cacheCtx.reconcile('feature')
        } catch {
          if (ownsAccount())
            toast.warning(
              'Changes saved, but some views could not refresh. Please refresh the page.',
            )
        }
        if (!ownsAccount()) return false
        if (errors.length === 0) {
          if (isCurrent()) setBulkMode(false)
          return true
        }

        showBulkErrorToasts(errors.map(errorResult => errorResult.error))
        return true
      },
      `${ids.length} features have been ${action.pastTense}`,
    )
    .catch(() => {
      // The retained job replaces its progress toast with the failure notice.
    })
}

// Session choices use the research index's project-management scope only while that filter is active.
$effect(() => {
  const scope = adminCtx.view.resources.scopeKey
  researchSessionOptions = []
  if (adminCtx.view.filters.viewFilters.feature.origin !== 'field_research') return
  let current = true
  void (async () => {
    const { getResearchSessions } = await import('#lib/api/fieldResearch.remote.js')
    const options: { value: string; label: string }[] = []
    let before: string | undefined
    while (current && scope === adminCtx.view.resources.scopeKey) {
      const sessions = await readFreshRemoteQuery(getResearchSessions({ before }))
      if (!current) return
      options.push(
        ...sessions.map(session => ({ value: session.id, label: session.name })),
      )
      if (sessions.length < 50) break
      before = sessions[sessions.length - 1].id
    }
    if (current && scope === adminCtx.view.resources.scopeKey)
      researchSessionOptions = options
  })().catch(() => {})
  return () => {
    current = false
  }
})

// Build the local text index on the first search, then reuse it until this view unmounts.
$effect(() => {
  if (!normalizedTextQuery || featureTextSearchWorker) return
  const worker = new Worker(
    new URL('../../../../workers/featureTextSearchWorker.ts', import.meta.url),
    { type: 'module' },
  )
  worker.onmessage = handleFeatureTextSearchWorkerMessage
  featureTextSearchWorker = worker
})

const scheduleRemoteQuery = debounce((nextQuery: string) => {
  debouncedRemoteQuery = nextQuery
}, 350)

function runScheduledRemoteQuery(nextQuery: string): void {
  if (typeof scheduleRemoteQuery === 'function') {
    ;(scheduleRemoteQuery as (value: string) => void)(nextQuery)
    return
  }

  const debounced = scheduleRemoteQuery as { call?: (value: string) => void }
  debounced.call?.(nextQuery)
}

$effect(() => {
  if (isBulkEditActive && activeBulkSelectionScope !== bulkSelectionScope) {
    untrack(() => setBulkMode(false))
  }
})

$effect(() => {
  if (featureLayoutMode === 'card' && isBulkEditActive) {
    setBulkMode(false)
  }
})

$effect(() => {
  if (
    !bulkFeatureEditOptions.some(option => option.value === selectedBulkActionValue)
  ) {
    selectedBulkActionValue = bulkFeatureEditOptions[0]?.value ?? ''
  }
})

$effect(() => {
  if (!featureTextSearchWorker) return

  const items = baseEntities.map(buildFeatureSearchIndex)
  const nextIndexVersion = untrack(() => workerIndexVersion) + 1

  workerIndexVersion = nextIndexVersion
  workerFilteredIds = null
  featureTextSearchWorker.postMessage({
    type: 'set-index',
    indexVersion: nextIndexVersion,
    items,
  } satisfies FeatureTextSearchWorkerRequest)
})

$effect(() => {
  if (normalizedTextQuery === '') {
    optimisticEntities = baseEntities
    return
  }

  if (!featureTextSearchWorker) {
    optimisticEntities = baseEntities.filter(feature =>
      adminCtx.view.filters.textFilter(
        FirstClassResource.feature,
        feature,
        normalizedTextQuery,
      ),
    )
    return
  }

  if (workerFilteredIds == null) return

  optimisticEntities = workerFilteredIds
    .map(id => baseEntitiesById.get(id))
    .filter((feature): feature is Feature => Boolean(feature))
})

$effect(() => {
  if (!featureTextSearchWorker) return
  if (workerIndexVersion === 0) return

  const nextRequestId = untrack(() => latestWorkerRequestId) + 1

  latestWorkerRequestId = nextRequestId
  featureTextSearchWorker.postMessage({
    type: 'filter',
    indexVersion: workerIndexVersion,
    requestId: nextRequestId,
    query: textQuery,
  } satisfies FeatureTextSearchWorkerRequest)
})

$effect(() => {
  const nextQuery = normalizedTextQuery

  runScheduledRemoteQuery(nextQuery)
})

$effect(() => {
  const nextQuery = debouncedRemoteQuery.trim()
  const signature = searchSignature
  const owner = ownerSignature
  matchingCountRevision
  searchRetry

  // Only query intent triggers reads; publishing a page must not fetch it again.
  untrack(() => {
    const nextRequestId = ++latestRemoteRequestId
    remoteLoadingMore = false
    remotePending = true
    remotePageError = null
    matchingCount = null
    adminCtx.rememberFeatureIndexCount(null)
    matchingCountLoading = true
    const input: FeatureIndexQuery = {
      location: locationScope,
      brandId,
      conditions: adminCtx.view.isSuperAdmin()
        ? { isArchived: null, isPublished: null }
        : { isArchived: false, isPublished: null },
      prisms: adminCtx.view.scope.prisms,
      sorting: adminCtx.view.filters.sorting.feature as FeatureIndexQuery['sorting'],
      filters: adminCtx.view.filters.viewFilters.feature,
      q: nextQuery,
      pagination: { limit: 50, offset: 0 },
      includeCount: false,
      summaryOnly: true,
      meta: { ...adminCtx.view.resources.queryMeta, profile: 'admin' },
    }
    // Counts settle independently; a slow count must not hold the visible page.
    void readFreshRemoteQuery(
      getFeatureIndexPage({ ...input, includeCount: true, countOnly: true }),
      searchRetry > 0 || matchingCountRevision > 0,
    )
      .then(result => {
        if (
          latestRemoteRequestId === nextRequestId &&
          signature === searchSignature &&
          nextQuery === normalizedTextQuery
        ) {
          matchingCount = result.totalCount
          adminCtx.rememberFeatureIndexCount(result.totalCount)
        }
      })
      .catch(() => {
        /* Rows remain usable when an optional total fails. */
      })
      .finally(() => {
        if (latestRemoteRequestId === nextRequestId) matchingCountLoading = false
      })
    // Retained rows remain an immediate local preview until this exact query settles.
    void readFreshRemoteQuery(
      getFeatureIndexPage(input),
      searchRetry > 0 || matchingCountRevision > 0,
    )
      .then(result => {
        if (
          latestRemoteRequestId !== nextRequestId ||
          signature !== searchSignature ||
          nextQuery !== normalizedTextQuery
        )
          return
        remoteQuery = nextQuery
        remoteSortSignature = signature
        remoteOwnerSignature = owner
        remoteMatchedEntities = toUniqueFeatures(result.data as Feature[])
        remoteHasMore = result.hasMore
        remoteNextOffset = result.nextOffset ?? result.data.length
      })
      .catch(error => {
        if (latestRemoteRequestId !== nextRequestId || signature !== searchSignature)
          return
        remotePageError = error
        remoteHasMore = false
      })
      .finally(() => {
        if (latestRemoteRequestId === nextRequestId) {
          remotePending = false
          indexInitialised = true
        }
      })
  })
  return () => {
    latestRemoteRequestId++
  }
})

$effect(() => {
  if (remoteMatchesCurrentQuery) {
    // Server predicates are authoritative; local cache completeness cannot remove matches.
    entities = remoteMatchedEntities ?? []
    return
  }
  // A changed account or location cannot preview rows retained by the previous owner.
  // Provenance is server-owned and absent from optimistic cache rows; await its filtered page.
  if (
    adminCtx.view.filters.viewFilters.feature.origin ||
    adminCtx.view.filters.viewFilters.feature.originId
  ) {
    entities = []
    return
  }
  const retained =
    remoteOwnerSignature === ownerSignature
      ? (remoteMatchedEntities ?? (locationScope || brandId ? [] : optimisticEntities))
      : []
  // Keep matching rows mounted while the server resolves the new prism selection.
  const prismMatches = retained.filter(feature =>
    matchesFeaturePrisms(feature, adminCtx.view.scope.prisms, {
      layerProjectId: id =>
        adminCtx.view.queries.rows.layer.find(layer => layer.id === id)?.projectId,
      projectOrganisationId: id =>
        adminCtx.view.queries.rows.project.find(project => project.id === id)
          ?.organisationId,
    }),
  )
  entities = adminCtx.view.filters.applyFeatureViewFilters(
    normalizedTextQuery
      ? prismMatches.filter(feature =>
          adminCtx.view.filters.textFilter(
            FirstClassResource.feature,
            feature,
            normalizedTextQuery,
          ),
        )
      : prismMatches,
  ) as Feature[]
})

// A page filtered to zero rows is not an empty result while later pages remain.
$effect(() => {
  if (
    indexInitialised &&
    entities.length === 0 &&
    indexHasMore &&
    !remoteLoadingMore &&
    !adminCtx.featureLoadingMore &&
    !remotePageError &&
    !adminCtx.featurePageError
  ) {
    untrack(() => {
      void loadMoreFeatureResults()
    })
  }
})

$effect(() => {
  // Share the final filtered/search order with detail navigation across route unmounts.
  adminCtx.rememberFeatureIndex(entities, indexComplete)
})

$effect(() => {
  if (isSearchFocused && normalizedTextQuery !== '') return
  footerEntities = entities
})

$effect(() => {
  headerCtrl.setHeaderForIndex(
    showTotalCount && remoteMatchesCurrentQuery && matchingCount !== null
      ? `${m.omni__title_features()} · ${matchingCount}`
      : m.omni__title_features(),
    FeatureIcon,
  )
  headerCtrl.setControlBar(
    ResourceControlBar,
    {
      resource: FirstClassResource.feature,
      onCreate,
      count: matchingCount,
      countLoading:
        matchingCountLoading || (!remoteMatchesCurrentQuery && !remotePageError),
      filters,
      sortables,
      bulkEdit:
        readOnly || featureLayoutMode === 'card'
          ? undefined
          : {
              isActive: isBulkEditActive,
              selectedCount: selectedBulkFeatureIds.length,
              options: bulkFeatureEditOptions,
              selectedOptionValue: selectedBulkActionValue,
              progress: bulkProgress,
              applyDisabled: isBulkApplyDisabled,
              isSelectingAll,
              onSelectAll: selectAllFeatureMatches,
              onToggleMode: toggleBulkMode,
              onInvertSelection: invertFeatureBulkSelection,
              onOptionChange: setSelectedBulkAction,
              onApply: applyFeatureBulkEdit,
            },
    },
    {
      isVisible: adminCtx.listUi.state.isControlBarVisible[FirstClassResource.feature],
    },
  )
  // Completion statistics describe the full matching list only after traversal finishes.
  headerCtrl.setFooter(indexComplete ? CompletionFooter : null, {
    entities: footerEntities,
  })
})
// Derived states for navigation capability
let canNavigatePrevious = $derived(() => {
  if (selectedFeatureIndex <= 0) return false
  // Check if there's any feature with an image before the current index
  for (let i = selectedFeatureIndex - 1; i >= 0; i--) {
    if (entities[i]?.image) return true
  }
  return false
})

let canNavigateNext = $derived(() => {
  if (selectedFeatureIndex < 0) return false
  // Check if there's any feature with an image after the current index
  for (let i = selectedFeatureIndex + 1; i < entities.length; i++) {
    if (entities[i]?.image) return true
  }
  return false
})

function openModal(image: ImageCtxEnvelope, feature: Feature) {
  selectedImage = image
  selectedFeature = feature
  selectedFeatureIndex = entities.findIndex(f => f.id === feature.id)
}

function closeModal() {
  // Store the index before clearing state
  const indexToFocus = selectedFeatureIndex
  selectedImage = null
  selectedFeature = null
  selectedFeatureIndex = -1
  // Restore focus to the last active row
  if (indexToFocus >= 0) {
    setTimeout(() => updateRowFocus(indexToFocus), 25)
  }
}

function navigateToNextFeature() {
  if (selectedFeatureIndex < 0) return
  // Find the next feature with an image
  for (let i = selectedFeatureIndex + 1; i < entities.length; i++) {
    const nextFeature = entities[i]
    if (nextFeature?.image) {
      selectedFeature = nextFeature
      selectedImage = nextFeature.image as ImageCtxEnvelope
      selectedFeatureIndex = i
      updateRowFocus(i)
      return
    }
  }
}

function navigateToPreviousFeature() {
  if (selectedFeatureIndex <= 0) return

  // Find the previous feature with an image
  for (let i = selectedFeatureIndex - 1; i >= 0; i--) {
    const prevFeature = entities[i]
    if (prevFeature?.image) {
      selectedFeature = prevFeature
      selectedImage = prevFeature.image as ImageCtxEnvelope
      selectedFeatureIndex = i
      updateRowFocus(i)
      return
    }
  }
}

interface VirtualListViewportElement extends Element {
  scrollToIndex?: (index: number, alignToTop?: boolean, smoothScroll?: boolean) => void
}

function updateRowFocus(index: number) {
  // Use the virtual list's scrollToIndex method
  const virtualList = listContainer?.querySelector(
    'svelte-virtual-list-viewport',
  ) as VirtualListViewportElement | null

  if (virtualList?.scrollToIndex) {
    // Scroll to the index using the virtual list's built-in method
    virtualList.scrollToIndex(index, true, false)

    // Focus the row after scrolling
    setTimeout(() => {
      const rowSelector = `[data-entity-index="${index}"][role="button"]`
      const targetRow = listContainer?.querySelector(rowSelector) as HTMLElement
      if (targetRow) {
        targetRow.focus()
      }
    }, 50)
  } else {
    // Fallback: focus immediately if row is already visible
    setTimeout(() => {
      const rowSelector = `[data-entity-index="${index}"][role="button"]`
      const targetRow = listContainer?.querySelector(rowSelector) as HTMLElement
      if (targetRow) {
        targetRow.focus()
      }
    }, 0)
  }
}
</script>

<!-- A failed initial request is not a successful search with zero matches. -->
{#if displayEntities.length > 0 || !(remotePageError || adminCtx.featurePageError)}
  <ResourceIndex
    resource={FirstClassResource.feature}
    entities={displayEntities}
    isInitialised={indexInitialised &&
      (displayEntities.length > 0 ||
        (searchIsReady && !indexHasMore) ||
        Boolean(remotePageError || adminCtx.featurePageError))}
    hasMore={indexCanLoadMore && !remotePageError && !adminCtx.featurePageError}
    isLoadingMore={remotePending || remoteLoadingMore || adminCtx.featureLoadingMore}
    onNearEnd={() => void loadMoreFeatureResults()}
    bind:listContainer
    getRowSelectionState={getFeatureBulkRowSelectionState}
    onRowSelectionToggle={isBulkEditActive && featureLayoutMode !== 'card'
      ? toggleFeatureBulkSelection
      : undefined}
  >
    {#snippet card(entity: Feature)}
      <IndexCard
        {...createAdminIndexCardModel({
          adminCtx,
          resourceType: FirstClassResource.feature,
          entity,
          keyMap: featureIndexCardKeyMap,
          search: page.url.search,
        })}
      />
    {/snippet}
    {#snippet row(entity, index, selectionState, isSelectionModeActive)}
      <!-- Calculate only mounted rows, after the virtual list's scrolling placeholder settles. -->
      {@const rowModel = getCachedFeatureRowModel({
        appCtx: adminCtx.view,
        feature: entity,
        localeKey,
        activeTranslationLocales,
        isSuperAdmin,
        userPreferences: adminCtx.view.getUserPreferences(),
      })}
      <FeatureRow
        {entity}
        model={rowModel}
        {index}
        {adminCtx}
        onImageClick={openModal}
        isSelected={selectedFeatureIndex === index && selectedImage !== null}
        {selectionState}
        isFocusable={!isSelectionModeActive}
      />
    {/snippet}
  </ResourceIndex>
{/if}
{#if remotePageError || adminCtx.featurePageError}
  <div role="alert" class="flex items-center justify-center gap-3 p-4 text-sm">
    <span>{m.bootstrap__error()}</span>
    <button
      type="button"
      class="hover:bg-muted rounded-lg px-3 py-2 font-semibold"
      onclick={() => {
        if (!remoteMatchesCurrentQuery || remotePageError) searchRetry++
        else void loadMoreFeatureResults()
      }}
    >
      {m.bootstrap__retry()}
    </button>
  </div>
{/if}
