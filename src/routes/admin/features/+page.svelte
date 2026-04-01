<script lang="ts">
// APP
import { page } from '$app/state'
// SVELTE
import { onMount, untrack } from 'svelte'
import { debounce } from '@sillvva/utils'
// ADAPTERS
import { createAdminIndexCardModel } from '$lib/adapters/cards/createAdminIndexCardModel'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
import { getHeaderCtrl } from '$lib/context/header.svelte'
// REMOTE
import { getFeatures } from '$lib/api/server/feature.remote'
// SERVICES
import { getCachedFeatureRowModel } from '$lib/client/services/featureRow'
import {
  createPropertyFilterSection,
  createSortable,
  createSortables,
  createToggleFilter,
  createTranslationFilter,
} from '$lib/client/services/filters'
// BITS PATTERNS
import {
  CompletionFooter,
  FeatureRow,
  IndexCard,
  ResourceControlBar,
  ResourceIndex,
} from '$lib/bits'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// I18N
import { getLocaleKey, m } from '$lib/i18n'
// ICONS
import FeatureIcon from 'virtual:icons/lucide/map-pin'
import StatusIcon from 'virtual:icons/lucide/circle-dot-dashed'
import BookOpenIcon from 'virtual:icons/lucide/book-open'
import LanguagesIcon from 'virtual:icons/lucide/languages'
import ImageIcon from 'virtual:icons/lucide/image'
import TagsIcon from 'virtual:icons/lucide/tags'
import PenLineIcon from 'virtual:icons/lucide/pen-line'
import CopyrightIcon from 'virtual:icons/lucide/copyright'
// TYPES
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'
import type { Feature } from '$lib/db/zod/schema/feature.types'
import type {
  FeatureRowModel,
  FeatureTextSearchWorkerRequest,
  FeatureTextSearchWorkerResponse,
  KeyMap,
  ResourceControlBarConfig,
  Resource,
  LocaleKey,
} from '$lib/types'

const featureIndexCardKeyMap: KeyMap = {
  id: 'id',
  title: 'i18n.title',
  subtitle: 'i18n.addressProperties.neighbourhood',
  description: 'i18n.displayAddress',
  image: 'image',
  badges: [],
}

const filters = {
  resource: FirstClassResource.feature,
  sections: [
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
} satisfies ResourceControlBarConfig

const sortables = createSortables([
  createSortable('modifiedAt', m.sort__updated()),
  createSortable('createdAt', m.sort__age()),
  createSortable('title', m.feature__title()),
  createSortable('description', m.filters__content()),
  createSortable('displayAddress', m.feature__address()),
])

// CONTEXT
const adminCtx = getAdminCtx()
const headerCtrl = getHeaderCtrl()
adminCtx.setFacet(false, false, FirstClassResource.feature)
const isSearchFocused = $derived(
  adminCtx.appCtx.state.ui.isSearchFocused[FirstClassResource.feature],
)
const featureLayoutMode = $derived(
  adminCtx.appCtx.state.ui.layoutMode[FirstClassResource.feature],
)
const activeSearchResultCap = $derived(featureLayoutMode === 'card' ? 12 : 20)

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
let remoteSortSignature = $state('')
let debouncedRemoteQuery = $state('')
let optimisticEntities = $state.raw<Feature[]>([])
let entities = $state.raw<Feature[]>([])
let footerEntities = $state.raw<Feature[]>([])
const textQuery = $derived(adminCtx.appCtx.state.filters.feature.text ?? '')
const normalizedTextQuery = $derived(textQuery.trim())
const sortSignature = $derived.by(() => {
  const sorting = adminCtx.appCtx.state.viewSorting.feature
  return `${sorting.sortBy}:${sorting.sortOrder}`
})
const displayEntities = $derived(
  isSearchFocused && normalizedTextQuery !== ''
    ? entities.slice(0, activeSearchResultCap)
    : entities,
)

let selectedImage = $state<ImageCtxEnvelope | null>(null)
let selectedFeature = $state<Feature | null>(null)
let selectedFeatureIndex = $state<number>(-1)

const localeKey = $derived(getLocaleKey())
const activeTranslationLocales = $derived.by(() => {
  const locales: LocaleKey[] = []
  const translationLocales =
    adminCtx.appCtx.state.viewFilters.feature.translationLocales

  for (const [locale, isActive] of Object.entries(translationLocales)) {
    if (isActive) locales.push(locale as LocaleKey)
  }

  return locales
})
const isSuperAdmin = $derived(
  Boolean(
    adminCtx.appCtx.user &&
      'superAdmin' in adminCtx.appCtx.user &&
      adminCtx.appCtx.user.superAdmin,
  ),
)
const baseEntities = $derived(
  adminCtx.applyFeatureViewFilters(
    adminCtx.appCtx.getFilteredResource<Feature>(FirstClassResource.feature, {
      text: false,
      state: true,
    }),
  ) as Feature[],
)
const baseEntitiesById = $derived.by(
  () => new Map(baseEntities.map(feature => [feature.id, feature])),
)
const rowModelsById = $derived.by(() => {
  const userPreferences = adminCtx.appCtx.getUserPreferences()
  const entries = displayEntities.map(
    feature =>
      [
        feature.id,
        getCachedFeatureRowModel({
          appCtx: adminCtx.appCtx,
          feature,
          localeKey,
          activeTranslationLocales,
          isSuperAdmin,
          userPreferences,
        }),
      ] as const,
  )

  return new Map<string, FeatureRowModel>(entries)
})

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

function getFeatureTitle(feature: Feature): string {
  const textObject = feature.i18n?.[localeKey] ?? feature.i18n?.en
  return textObject?.title?.trim() || feature.id
}

function getFeatureDescription(feature: Feature): string {
  const textObject = feature.i18n?.[localeKey] ?? feature.i18n?.en
  return textObject?.displayAddress?.trim() || textObject?.description?.trim() || ''
}

function toFallbackFeatureRowModel(feature: Feature): FeatureRowModel {
  return {
    id: feature.id,
    title: getFeatureTitle(feature),
    description: getFeatureDescription(feature),
    imageAlt:
      (feature.image as { altText?: string } | null)?.altText ?? 'Feature image',
    isPublished: feature.isPublished,
    isPendingReview: feature.isPendingReview,
    stats: {
      status: {},
      content: {},
      translation: {},
      image: {},
      category: {},
      freeform: {},
    },
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

onMount(() => {
  const worker = new Worker(
    new URL('../../../lib/workers/featureTextSearchWorker.ts', import.meta.url),
    {
      type: 'module',
    },
  )

  worker.onmessage = handleFeatureTextSearchWorkerMessage
  featureTextSearchWorker = worker

  return () => {
    worker.terminate()
    featureTextSearchWorker = null
  }
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
      adminCtx.appCtx.textFilter(
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

  if (nextQuery === '') {
    latestRemoteRequestId = untrack(() => latestRemoteRequestId) + 1
    remoteQuery = ''
    remoteMatchedEntities = null
    remoteHasMore = null
    remoteSortSignature = ''
    return
  }

  if (
    remoteMatchedEntities != null &&
    remoteQuery !== '' &&
    nextQuery.startsWith(remoteQuery) &&
    remoteHasMore === false &&
    remoteSortSignature === sortSignature
  ) {
    return
  }

  const nextRequestId = untrack(() => latestRemoteRequestId) + 1

  latestRemoteRequestId = nextRequestId

  void getFeatures({
    conditions: adminCtx.appCtx.isSuperAdmin()
      ? { isArchived: null, isPublished: null }
      : { isArchived: false, isPublished: null },
    prisms: adminCtx.appCtx.state.prisms,
    sorting: adminCtx.appCtx.state.viewSorting.feature,
    q: nextQuery,
    meta: { isAdminRequest: true, profile: 'card' },
  })
    .then(result => {
      if (latestRemoteRequestId !== nextRequestId) return

      remoteQuery = nextQuery
      remoteSortSignature = sortSignature
      remoteMatchedEntities = toUniqueFeatures(result.data as Feature[])
      remoteHasMore = result.hasMore ?? result.totalCount > result.data.length
    })
    .catch(() => {
      if (latestRemoteRequestId !== nextRequestId) return
      remoteQuery = ''
      remoteMatchedEntities = null
      remoteHasMore = null
      remoteSortSignature = ''
    })
})

$effect(() => {
  if (normalizedTextQuery === '') {
    entities = baseEntities
    return
  }

  if (
    remoteMatchedEntities != null &&
    remoteQuery !== '' &&
    normalizedTextQuery.startsWith(remoteQuery) &&
    remoteHasMore === false &&
    remoteSortSignature === sortSignature
  ) {
    entities = adminCtx.applyFeatureViewFilters(
      remoteMatchedEntities.filter(feature =>
        adminCtx.appCtx.textFilter(
          FirstClassResource.feature,
          feature,
          normalizedTextQuery,
        ),
      ) as Resource[],
    ) as Feature[]
    return
  }

  if (
    remoteQuery === normalizedTextQuery &&
    remoteMatchedEntities != null &&
    remoteSortSignature === sortSignature
  ) {
    entities = adminCtx.applyFeatureViewFilters(
      remoteMatchedEntities as Resource[],
    ) as Feature[]
    return
  }

  entities = optimisticEntities
})

$effect(() => {
  if (isSearchFocused && normalizedTextQuery !== '') return
  footerEntities = entities
})

$effect(() => {
  headerCtrl.setHeaderForIndex(m.omni__title_features(), FeatureIcon)
  headerCtrl.setControlBar(
    ResourceControlBar,
    {
      resource: FirstClassResource.feature,
      count: entities.length,
      filters,
      sortables,
    },
    {
      isVisible:
        adminCtx.appCtx.state.ui.isControlBarVisible[FirstClassResource.feature],
    },
  )
  headerCtrl.setFooter(CompletionFooter, { entities: footerEntities })
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

<ResourceIndex
  resource={FirstClassResource.feature}
  entities={displayEntities}
  bind:listContainer
>
  {#snippet card(entity: Feature)}
    <IndexCard
      {...createAdminIndexCardModel({
        adminCtx,
        entity,
        keyMap: featureIndexCardKeyMap,
        search: page.url.search,
      })}
    />
  {/snippet}
  {#snippet row(entity, index)}
    {@const rowModel = rowModelsById.get(entity.id)}
    <FeatureRow
      {entity}
      model={rowModel ?? toFallbackFeatureRowModel(entity)}
      {index}
      {adminCtx}
      onImageClick={openModal}
      isSelected={selectedFeatureIndex === index && selectedImage !== null}
    />
  {/snippet}
</ResourceIndex>
