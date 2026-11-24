<script lang="ts">
import CatalogueFilterBar from '#lib/bits/patterns/resource/catalogueQuality/CatalogueFilterBar.svelte'
import {
  qualityFiltersFromUrl,
  type LogoQualityKey,
} from '#lib/locations/catalogueQuality.js'
// TRANSLATION REVIEW
import { MultilingualReview } from '#lib/forms/multilingualReview.svelte.js'
import MultilingualReviewPanel from '#lib/bits/patterns/forms/translationReview/MultilingualReviewPanel.svelte'
import TranslationSuggestion from '#lib/bits/patterns/forms/translationReview/TranslationSuggestion.svelte'
let reviewForm = $state<HTMLFormElement>()

// SVELTE
import { page } from '$app/state'
import type { Snapshot } from './$types'
import { onDestroy, untrack } from 'svelte'
import { toast } from 'svelte-sonner'
import { prefersReducedMotion } from 'svelte/motion'
import { fade, slide } from 'svelte/transition'
import { goto } from '$app/navigation'
// ICONS
import LayoutGrid from 'virtual:icons/lucide/layout-grid'
import GridSmall from 'virtual:icons/lucide/grid-3x3'
import CatalogueGrid from '#lib/bits/patterns/resource/catalogueGrid/CatalogueGrid.svelte'
import Building from 'virtual:icons/lucide/building-2'
import FeatureIcon from 'virtual:icons/proicons/location'
import Tags from 'virtual:icons/lucide/tags'
import ListTree from 'virtual:icons/lucide/list-tree'
import Languages from 'virtual:icons/lucide/languages'
import BrandLocations from '#lib/bits/patterns/resource/brandLocations/BrandLocations.svelte'
import LocationsIcon from 'virtual:icons/lucide/map-pinned'
import ScopedFeatureIndex from '#lib/bits/patterns/resource/adminFeatureIndex/ScopedFeatureIndex.svelte'
import RetryIcon from 'virtual:icons/lucide/rotate-cw'
import ImageIcon from 'virtual:icons/lucide/image'
import PhotoIcon from 'virtual:icons/proicons/photo'
import Dropzone from '#lib/bits/patterns/images/components/Dropzone.svelte'
import DeleteIcon from 'virtual:icons/proicons/delete'
import RestoreIcon from 'virtual:icons/lucide/archive-restore'
import FilterIcon from 'virtual:icons/proicons/filter'
import FilterOffIcon from 'virtual:icons/lucide/funnel-x'
import SyncIcon from 'virtual:icons/lucide/refresh-cw'
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
// API
import {
  archiveIdentityCatalogue,
  getGroupBrands,
  getSubgroups,
  importIdentityCatalogue,
  publishIdentityCatalogueLocations,
  findIdentityCatalogue,
  listIdentityCatalogue,
  listIdentityCatalogueOrigins,
  getIdentityCatalogue,
  publishIdentityCatalogue,
  uploadIdentityCatalogueLogo,
} from '#lib/api/identityCatalogue.remote.js'
// COMPONENTS
import CatalogueProfileSkeleton from '#lib/bits/patterns/forms/identityCatalogue/CatalogueProfileSkeleton.svelte'
import WikidataBrandPicker from '#lib/bits/patterns/forms/identityCatalogue/WikidataBrandPicker.svelte'
import type { WikidataBrand } from '#lib/api/services/wikidataBrands.js'
import { Button } from '#lib/bits/core/index.js'
import * as Main from '#lib/bits/custom/main/index.js'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import { SectionHeader, TextInput } from '#lib/bits/custom/form/index.js'
import ResourceIcon from '#lib/bits/custom/resourceIcon/ResourceIcon.svelte'
import SearchSelect from '#lib/bits/core/searchSelect/SearchSelect.svelte'
import FormI18nInlineRow from '#lib/bits/patterns/forms/formI18nSection/components/FormI18nInlineRow.svelte'
import LocaleToolbar from '#lib/bits/custom/localeControls/LocaleToolbar.svelte'
import {
  displayedLocales,
  shortLocaleLabel,
} from '#lib/bits/custom/localeControls/localeControls.js'
import { contentLocaleOptions } from '#lib/bits/patterns/forms/contentLocaleDefaults/contentLocaleOptions.js'
import { placeTaxonomy, type PlaceTaxonomyNode } from '#lib/locations/placeTaxonomy.js'
import { placeCategoryLabel } from '#lib/locations/placeSearchFilters.js'
import { getLocaleKey, m } from '#lib/i18n.js'
import CatalogueArtworkEditor from '#lib/bits/patterns/forms/identityCatalogue/CatalogueArtworkEditor.svelte'
import { getThemeModel } from '#lib/themes/theme.svelte.js'
import { THEMES } from '#lib/themes/themes.js'
import { canonicalContentTag } from '#lib/i18n/contentRecords.js'
// DOMAIN
import {
  catalogueDisplayName,
  catalogueDisplayLogo,
  catalogueLogoBackground,
  catalogueLogoFallbacks,
} from '#lib/locations/cataloguePresentation.js'
import {
  IdentityCatalogueContentSchema,
  type IdentityCatalogueRecord,
  type IdentityCatalogueContent,
} from '#lib/locations/identityCatalogue.js'

const admin = getAdminCtx(),
  header = getHeaderCtrl(),
  theme = getThemeModel()
const artworkMode = $derived(
  THEMES.find(entry => entry.id === theme.selected)?.mode ?? 'dark',
)
admin.setResourceType(false)
let importStatus = $state('')
let kind = $state<'brand' | 'group'>('brand')
let search = $state('')
let catalogueLayout = $state<'compact' | 'card'>('card')
// Restore the chosen card size when returning from a catalogue detail page.
export const snapshot: Snapshot<'compact' | 'card'> = {
  capture: () => catalogueLayout,
  restore: value => {
    catalogueLayout = value
  },
}
let groupSearch = $state('')
let groups = $state<IdentityCatalogueRecord[]>([])
let newGroup = $state<{ id: string; i18n: IdentityCatalogueContent['i18n'] } | null>(
  null,
)
let previousGroupId: string | null = null
let groupLookupFailed = $state(false)
let groupLookupRetry = $state(0)
let detailFailed = $state(false)
let detailRetry = $state(0)
let indexFailed = $state(false)
let indexRetry = $state(0)
let nextCursor = $state<{ name: string; id: string } | null>(null)
let loadingMore = $state(false)
let moreFailed = $state(false)
let sentinel = $state<HTMLDivElement>()
let indexGeneration = 0

/** Load the next page without mixing results from changed filters.
 * @returns Resolves after the page is appended or its error is displayed.
 */
async function loadMore(): Promise<void> {
  if (!nextCursor || loading || loadingMore) return
  const generation = indexGeneration
  const retry = moreFailed
  loadingMore = true
  moreFailed = false
  try {
    const request = listIdentityCatalogue({
      kind,
      search,
      after: nextCursor,
      isArchived: admin.view.isSuperAdmin() ? isArchived : false,
      independent: kind === 'brand' ? independent : null,
      quality: qualityFilters,
      origin: catalogueOrigin || undefined,
    })
    if (retry) await request.refresh()
    const value = await request
    if (generation !== indexGeneration) return
    records = [
      ...records,
      ...value.records.filter(row => !records.some(old => old.id === row.id)),
    ]
    nextCursor = value.nextCursor
  } catch {
    if (generation === indexGeneration) moreFailed = true
  } finally {
    if (generation === indexGeneration) loadingMore = false
  }
}
$effect(() => {
  if (!sentinel || !nextCursor || loading || loadingMore || moreFailed) return
  const observer = new IntersectionObserver(
    entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect()
        void loadMore()
      }
    },
    { rootMargin: '300px' },
  )
  observer.observe(sentinel)
  return () => observer.disconnect()
})
let isArchived = $state<boolean | null>(false)
let independent = $state<boolean | null>(null)
let filtersVisible = $state(false)
const catalogueOrigin = $derived(page.url.searchParams.get('catalogue-origin') ?? '')
let catalogueOrigins = $state<string[]>([])
$effect(() => {
  let cancelled = false
  void listIdentityCatalogueOrigins(kind)
    .then(values => {
      if (!cancelled) catalogueOrigins = values
    })
    .catch(() => {
      if (!cancelled) catalogueOrigins = []
    })
  return () => {
    cancelled = true
  }
})
/** Keep catalogue provenance filtering in the shareable index URL.
 * @param origin Source namespace or empty for all sources. @returns Nothing.
 */
function setCatalogueOrigin(origin: string): void {
  const url = new URL(page.url.href)
  if (origin) url.searchParams.set('catalogue-origin', origin)
  else url.searchParams.delete('catalogue-origin')
  void goto(url, { replace: true, reset: false })
}
const qualityFilters = $derived(qualityFiltersFromUrl(page.url.searchParams))
/** Update one quality filter while preserving the other URL context.
 * @param key Quality dimension. @param value Yes, no or either. @returns Nothing.
 */
function setQualityFilter(key: LogoQualityKey, value: boolean | null): void {
  const url = new URL(page.url.href)
  if (value === null) url.searchParams.delete(`logo-${key}`)
  else url.searchParams.set(`logo-${key}`, value ? 'yes' : 'no')
  void goto(url, { replace: true, reset: false })
}
/** Clear quality filters without losing organisation or unrelated query parameters.
 * @returns Nothing.
 */
function resetQualityFilters(): void {
  const url = new URL(page.url.href)
  url.searchParams.delete('catalogue-origin')
  for (const key of Object.keys(qualityFilters)) url.searchParams.delete(`logo-${key}`)
  void goto(url, { replace: true, reset: false })
}
let groupNamesBeforeEdit: Record<string, string> = {}
let namesBeforeEdit: Record<string, string> = {}
$effect(() => {
  const query = groupSearch
  const excludeDescendantsOf =
    kind === 'group'
      ? (selected?.id ?? page.url.searchParams.get('id') ?? undefined)
      : undefined
  let cancelled = false
  const linkedId = content?.groupId
  const inlineId = newGroup?.id
  groupLookupFailed = false
  const retry = groupLookupRetry
  const choices = isEditing
    ? findIdentityCatalogue({ kind: 'group', search: query, excludeDescendantsOf })
    : null
  const linked =
    linkedId && linkedId !== inlineId ? getIdentityCatalogue({ id: linkedId }) : null
  // Only editors need autocomplete; reading a profile resolves its selected group directly.
  void Promise.all([
    choices
      ? retry
        ? choices.refresh().then(() => choices)
        : choices
      : Promise.resolve([]),
    linked
      ? retry
        ? linked.refresh().then(() => linked)
        : linked
      : Promise.resolve(null),
  ])
    .then(([rows, linked]) => {
      if (!cancelled)
        groups =
          linked && !linked.isArchived && !rows.some(group => group.id === linked.id)
            ? [...rows, linked]
            : rows
    })
    .catch(() => {
      if (!cancelled) groupLookupFailed = true
    })

  return () => {
    cancelled = true
  }
})
// Resolve each parent independently of the bounded group picker, retaining nearest-first order.
let parentGroups = $state<IdentityCatalogueRecord[]>([])
let parentGroupsFailed = $state(false)
$effect(() => {
  const directId = content?.groupId
  refresh
  let cancelled = false
  parentGroups = []
  parentGroupsFailed = false
  if (directId && directId !== newGroup?.id) {
    void (async () => {
      const seen = new Set([directId])
      let current = await getIdentityCatalogue({ id: directId })
      const parents: IdentityCatalogueRecord[] = []
      while (current?.groupId && !current.isArchived && !seen.has(current.groupId)) {
        seen.add(current.groupId)
        current = await getIdentityCatalogue({ id: current.groupId })
        if (cancelled) return
        if (current?.kind !== 'group' || current.isArchived) break
        parents.push(current)
      }
      if (!cancelled) parentGroups = parents
    })().catch(() => {
      if (!cancelled) parentGroupsFailed = true
    })
  }
  return () => {
    cancelled = true
  }
})
/** Flatten the existing classification tree for the shared category picker.
 * @param nodes Taxonomy subtree. @returns Exact taxonomy keys.
 */
function categoryKeys(nodes: PlaceTaxonomyNode[]): string[] {
  return nodes.flatMap(node => [node.name, ...categoryKeys(node.children ?? [])])
}
const categoryOptions = categoryKeys(placeTaxonomy)
let records = $state<IdentityCatalogueRecord[]>([])
let selected = $state<IdentityCatalogueRecord | null>(null)
let groupBrands = $state<IdentityCatalogueRecord[]>([])
let groupBrandsLoading = $state(false)
let groupBrandsFailed = $state(false)
$effect(() => {
  const id = selected?.kind === 'group' ? selected.id : content?.groupId
  const currentBrandId = selected?.kind === 'brand' ? selected.id : null
  refresh
  let cancelled = false
  groupBrands = []
  groupBrandsFailed = false
  groupBrandsLoading = Boolean(id)
  if (id)
    void getGroupBrands({ groupId: id, includeAncestors: Boolean(currentBrandId) })
      .then(rows => {
        if (!cancelled) groupBrands = rows.filter(row => row.id !== currentBrandId)
      })
      .catch(() => {
        if (!cancelled) groupBrandsFailed = true
      })
      .finally(() => {
        if (!cancelled) groupBrandsLoading = false
      })
  return () => {
    cancelled = true
  }
})
let subgroups = $state<IdentityCatalogueRecord[]>([])
let subgroupsLoading = $state(false)
let subgroupsFailed = $state(false)
$effect(() => {
  const id = selected?.kind === 'group' ? selected.id : null
  refresh
  let cancelled = false
  subgroups = []
  subgroupsFailed = false
  subgroupsLoading = Boolean(id)
  if (id)
    void getSubgroups({ groupId: id })
      .then(rows => {
        if (!cancelled) subgroups = rows
      })
      .catch(() => {
        if (!cancelled) subgroupsFailed = true
      })
      .finally(() => {
        if (!cancelled) subgroupsLoading = false
      })
  return () => {
    cancelled = true
  }
})
let content = $state<IdentityCatalogueContent | null>(null)
let busy = $state(false),
  failed = $state(false),
  saved = $state(false),
  refresh = $state(0)
const organisationId = $derived(page.url.searchParams.get('organisation') ?? undefined)
let baseline = $state('')
let wikidataId = $state<string | undefined>()
let saveFailure = $state('')
let loading = $state(true)
let loadingDetail = $state(false)
const routeCode = $derived(page.params.code)
const routeKind = $derived(page.params.kind)
const detail = $derived(
  Boolean(routeCode) ||
    page.url.searchParams.has('id') ||
    page.url.searchParams.has('new'),
)
const featuresActive = $derived(
  selected?.kind === 'brand' && page.url.searchParams.get('facet') === 'features',
)
const locationsActive = $derived(
  selected?.kind === 'brand' && page.url.searchParams.get('facet') === 'locations',
)
let multilingual = $state(false)
let selectedLocales = $state<string[]>(['en', 'zh-Hant', 'zh-Hans'])
let visibleLocales = $state<string[]>(['en', 'zh-Hant', 'zh-Hans'])
const localeOptions = $derived(contentLocaleOptions(getLocaleKey()))
const shownLocales = $derived(
  displayedLocales({ selectedLocales, visibleLocales }, multilingual),
)
let logoInput: HTMLInputElement | undefined = $state()
let logoFailed = $state(false)
let logoSourceIndex = $state(0)
const profileLogoSources = $derived(
  [
    content && selected
      ? catalogueDisplayLogo({ ...selected, ...content }, theme.selected, artworkMode)
      : null,
    ...(selected ? catalogueLogoFallbacks(selected) : []),
  ].filter((source): source is string => Boolean(source)),
)
const profileLogo = $derived(profileLogoSources[logoSourceIndex])
let logoRetry = $state(0)
$effect(() => {
  content?.logo
  content?.artwork
  theme.selected
  selected?.id
  logoSourceIndex = 0
  logoFailed = false
  logoRetry = 0
})
const dirty = $derived(
  content !== null &&
    (JSON.stringify(content) !== baseline || wikidataId !== selected?.wikidataId),
)
const canEdit = $derived(admin.view.isSuperAdmin() || Boolean(organisationId))
const isEditing = $derived(header.state.isEditing && canEdit)
$effect(() => {
  for (const locale of selectedLocales) {
    if (content && !content.i18n[locale]) content.i18n[locale] = { name: '' }
    if (newGroup && !newGroup.i18n[locale]) newGroup.i18n[locale] = { name: '' }
  }
})
const translationReview = new MultilingualReview(
  () => [
    ...selectedLocales.map(locale => ({
      key: `${selected?.id ?? kind}:name:${locale}`,
      field: 'name',
      locale,
      value: content?.i18n[locale]?.name ?? '',
      set: (text: string) => {
        if (content) content.i18n[locale] = { name: text }
      },
    })),
    ...(newGroup
      ? selectedLocales.map(locale => ({
          key: `${newGroup!.id}:group:${locale}`,
          field: 'group',
          locale,
          value: newGroup?.i18n[locale]?.name ?? '',
          set: (text: string) => {
            if (newGroup) newGroup.i18n[locale] = { name: text }
          },
        }))
      : []),
  ],
  () => isEditing && !busy,
  () => {
    multilingual = true
    visibleLocales = [...selectedLocales]
  },
)
const valid = $derived(
  content !== null &&
    IdentityCatalogueContentSchema.safeParse(content).success &&
    (!newGroup ||
      IdentityCatalogueContentSchema.shape.i18n.safeParse(newGroup.i18n).success),
)
$effect(() => {
  const title = selected
    ? catalogueDisplayName(selected)
    : content
      ? `New ${kind}`
      : 'Entity Catalog'
  const activeKind = kind
  const showFilters = filtersVisible
  const cards = catalogueLayout === 'card'
  const isDetail = detail
  const isLocations = locationsActive
  const isFeatures = featuresActive
  // Catalogue views own their filters; never retain a feature index control bar.
  if (!isFeatures) header.clearControlBar()
  const hasFeatures = selected?.kind === 'brand'
  const archiveMenu =
    selected && admin.view.isSuperAdmin()
      ? [
          {
            label: selected.isArchived ? m.catalogue_restore() : m.forms__delete(),
            icon: selected.isArchived ? RestoreIcon : DeleteIcon,
            disabled: busy || (isEditing && dirty),
            class: 'bits-pattern-header__title-menu-item--danger',
            iconClass: selected.isArchived
              ? undefined
              : 'bits-pattern-header__title-menu-item-icon',
            onSelect: () => void toggleArchive(),
          },
        ]
      : []
  const indexMenu = admin.view.isSuperAdmin()
    ? [
        {
          label: 'Sync Curated Locations to Brand Catalog',
          icon: SyncIcon,
          class:
            'bg-transparent! hover:bg-foreground/5! data-[highlighted]:bg-foreground/5!',
          disabled: busy || loading,
          onSelect: () => void importBrands(),
        },
      ]
    : []
  const controls = {
    content: isFeatures || isLocations ? null : localeControl,
    locationsAction: hasFeatures
      ? {
          text: 'Locations',
          icon: LocationsIcon,
          style: isLocations ? ('soft' as const) : ('outline' as const),
          disabled: isEditing || busy,
          onClick: () => {
            const url = new URL(page.url.href)
            url.searchParams.set('facet', 'locations')
            void goto(url.pathname + url.search)
          },
        }
      : null,
    featuresAction: hasFeatures
      ? {
          text: 'Features',
          icon: FeatureIcon,
          style: isFeatures ? ('soft' as const) : ('outline' as const),
          disabled: isEditing || busy,
          onClick: () => {
            const url = new URL(page.url.href)
            url.searchParams.set('facet', 'features')
            void goto(url.pathname + url.search)
          },
        }
      : null,
    dirty,
    isSubmitting: busy,
    disableSave: !valid || !canEdit,
    canEdit: Boolean(content) && canEdit && !selected?.isArchived,
    canPublish: false,
    showPublishAction: false,
    showDeleteAction: false,
    submit: () => reviewForm?.requestSubmit(),
    reset: reset,
  }
  untrack(() => {
    if (isDetail) {
      if (!isFeatures && !isLocations) header.setSearch(null)
      header.setHeaderForEntity(title, Tags, new Map(), {
        showFacets: hasFeatures,
        ...(isLocations ? { showLayoutToggle: false, showViewActions: true } : {}),
      })
      if (hasFeatures)
        header.setFacets(
          [
            { ref: 'core', label: 'Profile', icon: null },
            { ref: 'features', label: 'Features', icon: FeatureIcon, hideLabel: true },
          ],
          {
            active: isFeatures ? 'features' : isLocations ? 'locations' : 'core',
            onFacetChange: facet => {
              const url = new URL(page.url.href)
              if (facet === 'features') url.searchParams.set('facet', 'features')
              else url.searchParams.delete('facet')
              void goto(url.pathname + url.search)
            },
          },
        )
      header.setTitleMenuItems(archiveMenu)
      header.setCrumbs([
        {
          name: 'Catalog',
          href: `/admin/catalogue${organisationId ? `?organisation=${organisationId}` : ''}`,
        },
        {
          name: kind === 'brand' ? 'Brands' : 'Groups',
          href: `/admin/catalogue?kind=${kind}${organisationId ? `&organisation=${organisationId}` : ''}`,
        },
      ])
      header.setFormActions(
        isFeatures || isLocations ? { ...controls, canEdit: false } : controls,
      )
    } else {
      header.setFormActions({ featuresAction: null, locationsAction: null })
      header.setHeaderForIndex('Entity Catalog', Tags, {
        showNew: canEdit,
        showFacets: true,
        showFilter: true,
        showLayoutToggle: false,
        showViewActions: true,
        showControlBarToggle: false,
      })
      header.setTitleMenuItems(indexMenu)
      header.setViewActions([
        {
          text: showFilters ? 'Hide filters' : 'Show filters',
          icon: showFilters ? FilterOffIcon : FilterIcon,
          color: 'neutral',
          style: 'ghost',
          class: 'px-4',
          alwaysHideLabel: true,
          hideLabelInstantly: true,
          onClick: () => {
            filtersVisible = !filtersVisible
          },
        },
        {
          text: cards ? 'Show smaller cards' : 'Show larger cards',
          icon: cards ? GridSmall : LayoutGrid,
          color: 'neutral',
          style: 'ghost',
          class: 'px-4',
          alwaysHideLabel: true,
          hideLabelInstantly: true,
          onClick: () => {
            catalogueLayout = cards ? 'compact' : 'card'
          },
        },
      ])
      header.setCreateAction(() => openRecord(null))
      header.setFacets(
        new Map([
          ['brand', 'Brands'],
          ['group', 'Groups'],
        ]),
        {
          active: activeKind,
          onFacetChange: value => {
            if (value === 'brand' || value === 'group') {
              const url = new URL(page.url.href)
              url.pathname = '/admin/catalogue'
              url.searchParams.set('kind', value)
              void goto(url)
            }
          },
        },
      )
      header.clearFooter()
    }
  })
})
$effect(() => {
  if (!detail)
    header.setSearch({
      query: search,
      placeholder: kind === 'brand' ? 'Search brands' : 'Search groups',
      onFilter: value => (search = value.slice(0, 200)),
    })
})
onDestroy(() => {
  header.setTitleMenuItems([])
  header.setSearch(null)
  header.setFormActions({ content: null, featuresAction: null, locationsAction: null })
})
$effect(() => {
  refresh
  if (detail) return
  const type = kind,
    query = search
  let cancelled = false
  untrack(() => {
    indexGeneration++
  })
  records = []
  nextCursor = null
  loadingMore = false
  moreFailed = false
  loading = true
  indexFailed = false
  const request = listIdentityCatalogue({
    kind: type,
    search: query,
    isArchived: admin.view.isSuperAdmin() ? isArchived : false,
    independent: type === 'brand' ? independent : null,
    quality: qualityFilters,
    origin: catalogueOrigin || undefined,
  })
  void (indexRetry || refresh ? request.refresh().then(() => request) : request)
    .then(value => {
      if (!cancelled) {
        records = value.records
        nextCursor = value.nextCursor
      }
    })
    .catch(() => {
      if (!cancelled) indexFailed = true
    })
    .finally(() => {
      if (!cancelled) loading = false
    })
  return () => {
    cancelled = true
  }
})
$effect(() => {
  refresh
  const id = page.url.searchParams.get('id')
  if (!id && !routeCode) {
    detailFailed = false
    loadingDetail = false
    const requested = page.url.searchParams.get('kind')
    if (requested === 'group' || requested === 'brand') kind = requested
    if (page.url.searchParams.has('new')) untrack(() => edit(null))
    else {
      selected = null
      content = null
      baseline = ''
      header.setEditing(false)
    }
    return
  }
  let cancelled = false
  loadingDetail = true
  detailFailed = false
  failed = false
  const lookup: { id: string } | { kind: 'brand' | 'group'; code: string } =
    routeCode && (routeKind === 'brand' || routeKind === 'group')
      ? { kind: routeKind, code: routeCode }
      : { id: id ?? '' }
  const request = getIdentityCatalogue(lookup)
  void (detailRetry ? request.refresh().then(() => request) : request)
    .then(record => {
      if (!cancelled) {
        kind = record.kind
        edit(record)
        if (id && record.code) {
          const url = new URL(page.url.href)
          url.pathname = `/admin/catalog/${record.kind}/${encodeURIComponent(record.code)}`
          url.searchParams.delete('id')
          void goto(url.pathname + url.search, { replaceState: true })
        }
      }
    })
    .catch(() => {
      if (!cancelled) detailFailed = true
    })
    .finally(() => {
      if (!cancelled) loadingDetail = false
    })
  return () => {
    cancelled = true
  }
})
/** Select a catalogue record without mutating its retained revision.
 * @param record Current record or null for creation. @returns Nothing.
 */
function edit(record: IdentityCatalogueRecord | null): void {
  saveFailure = ''
  selected = record
  wikidataId = record?.wikidataId
  newGroup = null
  groupSearch = ''
  importStatus = ''
  content = record
    ? structuredClone(
        $state.snapshot({
          isArchived: record.isArchived,
          i18n: record.i18n,
          logo: record.logo,
          artwork: record.artwork,
          evidence: record.evidence,
          logoAttribution: record.logoAttribution,
          code: record.code,
          categories: record.categories,
          discovery: record.discovery,
          groupId: record.groupId,
        }),
      )
    : {
        i18n: Object.fromEntries(
          ['en', 'zh-Hant', 'zh-Hans'].map(code => [code, { name: '' }]),
        ),
        logo: null,
      }
  selectedLocales = [
    ...new Set(['en', 'zh-Hant', 'zh-Hans', ...Object.keys(content.i18n)]),
  ]
  for (const locale of selectedLocales) content.i18n[locale] ??= { name: '' }
  visibleLocales = [...selectedLocales]
  baseline = JSON.stringify(content)
  header.setEditing(record === null)
  saved = false
}
/** Discard the draft using the selected record, or return to the first entry after creation.
 * @returns Nothing.
 */
function reset(): void {
  if (selected) edit(selected)
  else
    void goto(
      `/admin/catalogue?kind=${kind}${organisationId ? `&organisation=${organisationId}` : ''}`,
    )
}
/** Archive or restore the inspected catalogue record through the SuperAdmin command.
 * @returns Completion after refreshing the detail and active catalogue list.
 */
async function toggleArchive(): Promise<void> {
  if (!selected || busy || (isEditing && dirty) || !admin.view.isSuperAdmin()) return
  busy = true
  try {
    const record = await archiveIdentityCatalogue({
      id: selected.id,
      expectedVersion: selected.version,
      isArchived: !selected.isArchived,
    })
    await getIdentityCatalogue({ id: record.id }).refresh()
    if (record.code)
      await getIdentityCatalogue({ kind: record.kind, code: record.code }).refresh()
    await findIdentityCatalogue({
      kind: record.kind,
      search,
      isArchived,
      independent: record.kind === 'brand' ? independent : null,
    }).refresh()
    edit(record)
    header.setEditing(false)
    refresh++
    toast.success(record.isArchived ? m.catalogue_archived() : m.catalogue_restored())
  } catch {
    toast.error(m.catalogue_archive_failed())
  } finally {
    busy = false
  }
}

/** Save an inspected catalogue revision. @returns Completion with visible success/error. */
async function save(): Promise<void> {
  if (!content || busy || !valid || !dirty || !canEdit) return
  busy = true
  failed = false
  saveFailure = ''
  try {
    const record = await publishIdentityCatalogue({
      id: selected?.id ?? crypto.randomUUID(),
      kind: selected?.kind ?? kind,
      expectedVersion: selected?.version ?? 0,
      wikidataId:
        kind === 'brand' && wikidataId !== selected?.wikidataId
          ? wikidataId
          : undefined,
      content: $state.snapshot(content),
      organisationId,
      newGroup: newGroup ? $state.snapshot(newGroup) : undefined,
    })
    newGroup = null
    await findIdentityCatalogue({ kind: 'group', search: groupSearch }).refresh()
    await getIdentityCatalogue({ id: record.id }).refresh()
    if (record.code)
      await getIdentityCatalogue({ kind: record.kind, code: record.code }).refresh()
    await findIdentityCatalogue({
      kind,
      search,
      isArchived,
      independent: kind === 'brand' ? independent : null,
    }).refresh()
    selected = record
    wikidataId = record.wikidataId
    content = structuredClone({
      isArchived: record.isArchived,
      i18n: record.i18n,
      logo: record.logo,
      artwork: record.artwork,
      evidence: record.evidence,
      logoAttribution: record.logoAttribution,
      code: record.code,
      categories: record.categories,
      discovery: record.discovery,
      groupId: record.groupId,
    })
    baseline = JSON.stringify(content)
    header.setEditing(false)
    await publishLinks(record.id)
    // Finish pending links before navigation reloads the record, then refresh the new route.
    if (page.url.searchParams.has('new') || (record.code ?? undefined) !== routeCode)
      await goto(catalogueHref(record), { replaceState: true })
    saved = true
    toast.success(
      record.kind === 'brand' ? m.catalogue_brand_saved() : m.catalogue_group_saved(),
    )
    refresh++
  } catch (cause) {
    failed = true
    if (cause instanceof Error && cause.message.startsWith('This Wikidata'))
      saveFailure = cause.message
  } finally {
    busy = false
  }
}
/** Decode a chosen image and upload a bounded PNG, leaving attachment explicit until Save.
 * @param file Local image selection. @param sourceLogo Reviewed Commons thumbnail and attribution.
 * @returns Completion after the logo preview is ready.
 */
async function upload(
  file?: File,
  sourceLogo?: NonNullable<WikidataBrand['logo']>,
): Promise<void> {
  if ((!file && !sourceLogo) || !content || busy) return
  busy = true
  failed = false
  try {
    if (sourceLogo) {
      const response = await fetch(sourceLogo.url, {
        signal: AbortSignal.timeout(15000),
        referrerPolicy: 'no-referrer',
      })
      if (!response.ok) throw new Error('LOGO_UNAVAILABLE')
      file = new File([await response.blob()], 'wikimedia-logo.png')
    }
    if (!file) return
    if (file.size > 8 * 1024 * 1024) throw Error('Logo too large')
    const bitmap = await createImageBitmap(file)
    if (Math.min(bitmap.width, bitmap.height) < 512) {
      bitmap.close()
      throw Error('Use an original image at least 512 pixels wide and tall')
    }
    const sourceWidth = bitmap.width,
      sourceHeight = bitmap.height
    const canvas = document.createElement('canvas'),
      scale = 512 / Math.max(bitmap.width, bitmap.height)
    canvas.width = canvas.height = 512
    const context = canvas.getContext('2d')
    if (!context) throw Error('Image conversion unavailable')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, 512, 512)
    context.drawImage(
      bitmap,
      (512 - bitmap.width * scale) / 2,
      (512 - bitmap.height * scale) / 2,
      bitmap.width * scale,
      bitmap.height * scale,
    )
    bitmap.close()
    const result = await uploadIdentityCatalogueLogo({
      data: canvas.toDataURL('image/png').split(',')[1],
      organisationId,
    })
    content = {
      ...content,
      logo: result.logo,
      logoAttribution: sourceLogo && {
        sourceUrl: sourceLogo.sourceUrl,
        license: sourceLogo.license,
        attribution: sourceLogo.attribution,
      },
      artwork: {
        ...content.artwork,
        logo: {
          src: result.logo,
          background: '#ffffff',
          status: 'approved',
          format: 'png',
          sourceWidth,
          sourceHeight,
          ...(sourceLogo
            ? {
                sourceUrl: sourceLogo.sourceUrl,
                attribution: sourceLogo.attribution,
                license: sourceLogo.license,
              }
            : {}),
        },
      },
    }
    saved = false
  } catch {
    failed = true
  } finally {
    busy = false
  }
}

/** Publish all bounded pages, preserving locked or concurrently edited Locations for retry.
 * @param id Catalogue identity. @returns Completion after the final page.
 */
async function publishLinks(id: string): Promise<void> {
  let after: string | null = null
  let changed = 0,
    failures = 0
  do {
    const result: Awaited<ReturnType<typeof publishIdentityCatalogueLocations>> =
      await publishIdentityCatalogueLocations({
        id,
        after,
        organisationId,
      })
    changed += result.linked
    failures += result.failed.length
    after = result.next
    importStatus = failures
      ? `Updated ${changed} locations. ${failures} could not be updated; try again.`
      : ''
  } while (after)
}
/** Import existing source-brand evidence without inventing groups, formats or branches.
 * @returns Completion after the last bounded Location page.
 */
async function importBrands(): Promise<void> {
  if (busy) return
  busy = true
  failed = false
  let after: string | null = null,
    linked = 0,
    failures = 0
  try {
    do {
      const result: Awaited<ReturnType<typeof importIdentityCatalogue>> =
        await importIdentityCatalogue({ after })
      linked += result.linked
      failures += result.failed.length
      after = result.next
      importStatus = failures
        ? `Linked ${linked} locations. ${failures} could not be linked; try again.`
        : busy
          ? `Checking imported brands…`
          : ''
    } while (after)
    importStatus = failures
      ? `${failures} locations could not be linked. Try again.`
      : linked
        ? `Linked brands to ${linked} locations.`
        : 'All imported brands are already linked.'
    await findIdentityCatalogue({
      kind,
      search,
      isArchived,
      independent: kind === 'brand' ? independent : null,
    }).refresh()
    refresh++
  } catch {
    failed = true
  } finally {
    busy = false
  }
}
/** Build a code-based detail URL, retaining an ID fallback for uncoded entries.
 * @param record Catalogue identity. @returns Local detail URL with editing context.
 */
function catalogueHref(record: IdentityCatalogueRecord): string {
  const path = record.code
    ? `/admin/catalog/${record.kind}/${encodeURIComponent(record.code)}`
    : `/admin/catalogue?id=${encodeURIComponent(record.id)}`
  return (
    path +
    (organisationId
      ? `${path.includes('?') ? '&' : '?'}organisation=${encodeURIComponent(organisationId)}`
      : '')
  )
}

/** Open one stable catalogue identity in the standard detail editor.
 * @param record Selected catalogue entry, or null for creation. @returns Nothing.
 */
function openRecord(record: IdentityCatalogueRecord | null): void {
  void goto(
    record
      ? catalogueHref(record)
      : `/admin/catalogue?kind=${kind}&new=1${organisationId ? `&organisation=${organisationId}` : ''}`,
  )
}
</script>

{#snippet localeControl()}
  <LocaleToolbar
    horizontal
    class="mr-3 max-w-[min(26rem,30vw)]"
    options={localeOptions}
    {selectedLocales}
    {visibleLocales}
    contentLocales={Object.keys(content?.i18n ?? {})}
    expanded={multilingual}
    allowAdd={isEditing}
    disabled={busy}
    onExpandedChange={value => (multilingual = value)}
    onChange={change => {
      selectedLocales = change.selectedLocales
      visibleLocales = change.visibleLocales
      if (content && change.action === 'add' && !content.i18n[change.locale])
        content.i18n[change.locale] = { name: '' }
      if (newGroup && change.action === 'add' && !newGroup.i18n[change.locale])
        newGroup.i18n[change.locale] = { name: '' }
    }}
  />
{/snippet}

<Main.Root
  class="overflow-y-auto! px-0 pt-0"
  onDimensionsChange={(width, height) =>
    admin.view.layout.setMainDimensions(width, height)}
>
  {#if !detail}
    {#if filtersVisible}
      <CatalogueFilterBar
        {isArchived}
        {independent}
        showArchive={admin.view.isSuperAdmin()}
        showIndependent={kind === 'brand'}
        onArchive={value => (isArchived = value)}
        onIndependent={value => (independent = value)}
        quality={qualityFilters}
        origin={catalogueOrigin}
        origins={catalogueOrigins}
        count={records.length}
        {loading}
        onQuality={setQualityFilter}
        onOrigin={setCatalogueOrigin}
        onReset={() => {
          isArchived = false
          independent = null
          resetQualityFilters()
        }}
      />
    {/if}
    <div class="p-6">
      <CatalogueGrid
        {records}
        compact={catalogueLayout === 'compact'}
        {loading}
        {loadingMore}
        theme={theme.selected}
        mode={artworkMode}
        onNavigate={openRecord}
      />
      {#if !loading && !records.length}
        <p class="text-muted-foreground p-6 text-sm">
          {search
            ? 'No matching entries'
            : `No ${kind === 'brand' ? 'brands' : 'groups'} yet`}
        </p>
      {/if}
    </div>
  {:else if locationsActive && selected}
    <Main.Facet
      edgeToEdge
      fillHeight
      class="top-0 bottom-0"
      contentClass="h-full overflow-auto"
    >
      {#key selected.id}
        <BrandLocations brand={selected} {organisationId} />
      {/key}
    </Main.Facet>
  {:else if featuresActive && selected}
    <Main.Facet
      edgeToEdge
      fillHeight
      class="top-0 bottom-0"
      contentClass="h-full overflow-hidden"
    >
      {#key selected.id}
        <ScopedFeatureIndex resourceType="brand" resourceId={selected.id} embedded />
      {/key}
    </Main.Facet>
  {:else}
    <form
      bind:this={reviewForm}
      aria-busy={loadingDetail}
      class="contents"
      data-translation-tab="core"
      data-translation-baseline-modified={selected?.version}
      onsubmit={event => {
        event.preventDefault()
        void save()
      }}
    >
      <MultilingualReviewPanel review={translationReview} />
      <FormSurface>
        <div>
          {#if content}
            <section
              class="bits-form__section border-border mx-auto my-6 max-w-4xl overflow-hidden rounded-xl border pb-0!"
              data-catalogue-card
            >
              <div
                class="grid min-w-0 grid-cols-[12rem_minmax(0,1fr)]"
                data-catalogue-columns
              >
                <section class="grid min-w-0 content-start" aria-label="Brand image">
                  <SectionHeader
                    title={kind === 'brand' ? 'Brand' : 'Group'}
                    icon={Tags}
                  />
                  <div class="grid gap-4 px-6 py-4">
                    {#if content.logoAttribution &&
                      (!content.artwork?.logo ||
                        content.artwork.logo.src === content.logo)}
                      <a
                        class="text-muted-foreground text-xs break-words underline"
                        href={content.logoAttribution.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        >{content.logoAttribution.license || 'Wikimedia Commons'}
                        · {content.logoAttribution.attribution || 'Source'}</a
                      >
                    {/if}
                    <div class="relative size-28" data-catalogue-logo-picker>
                      <Dropzone
                        disabled={!isEditing || busy}
                        uploadSelectionMode="single"
                        showPrompt={false}
                        rounded="rounded-xl"
                        bind:inputElement={logoInput}
                        onFiles={async (files, rejections) => {
                          if (rejections.length) failed = true
                          if (files[0]) await upload(files[0])
                        }}
                      >
                        <div
                          class="border-border relative flex size-28 items-center justify-center overflow-hidden rounded-xl border"
                          style:background-color={catalogueLogoBackground(
                            { ...selected, ...content },
                            theme.selected,
                            artworkMode,
                          )}
                        >
                          {#if profileLogo}
                            <img
                              src={`${profileLogo}${logoRetry ? `?retry=${logoRetry}` : ''}`}
                              onerror={() => {
                                if (logoSourceIndex + 1 < profileLogoSources.length)
                                  logoSourceIndex++
                                else logoFailed = true
                              }}
                              onload={() => (logoFailed = false)}
                              class:hidden={logoFailed}
                              alt="Catalogue logo"
                              class="size-4/5 object-contain"
                            >
                            {#if logoFailed}
                              <ImageIcon class="text-muted-foreground size-10" />
                            {/if}
                          {:else}
                            <ImageIcon class="text-muted-foreground size-10" />
                          {/if}
                          {#if isEditing}
                            <span
                              class="bg-background/70 pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 backdrop-blur-sm transition-opacity group-focus-within/gallery-dropzone:opacity-100 group-hover/gallery-dropzone:opacity-100"
                              data-logo-overlay
                            >
                              <PhotoIcon class="size-7" />
                            </span>
                          {/if}
                        </div>
                      </Dropzone>
                      {#if logoFailed}
                        <div class="absolute bottom-1 left-1/2 z-80 -translate-x-1/2">
                          <Button
                            text="Retry image"
                            iconComponent={RetryIcon}
                            hideLabel
                            style="ghost"
                            size="sm"
                            class="size-6! p-0!"
                            disabled={busy}
                            onClick={() => {
                              logoFailed = false
                              logoSourceIndex = 0
                              logoRetry++
                            }}
                          />
                        </div>
                      {/if}
                    </div>
                  </div>
                </section>
                <section class="grid min-w-0 content-start" aria-label="Names">
                  <SectionHeader title="Names" icon={Languages} />
                  <div class="px-6 py-4">
                    <div class="grid gap-2">
                      {#each shownLocales as locale (locale)}
                        {@const reviewKey = `${selected?.id ?? kind}:name:${locale}`}
                        <div
                          transition:slide={{
                            duration: prefersReducedMotion.current ? 0 : 180,
                          }}
                        >
                          <div
                            data-missing-translation={(translationReview.started &&
                              !content.i18n[locale]?.name?.trim()) ||
                              undefined}
                          >
                            {#if translationReview.current(reviewKey)}
                              <TranslationSuggestion
                                value={translationReview.proposals[reviewKey].value}
                                label={`Name · ${locale}`}
                                prefix={shortLocaleLabel(locale)}
                                onChange={text => {
                                  translationReview.proposals[reviewKey].value = text
                                }}
                                onAccept={edited =>
                                  translationReview.accept(reviewKey, edited)}
                                onReject={() => translationReview.reject(reviewKey)}
                              />
                            {:else}
                              <FormI18nInlineRow
                                value={content.i18n[locale].name}
                                label={`Name · ${locale}`}
                                prefix={locale === shownLocales[0]
                                  ? ''
                                  : shortLocaleLabel(locale)}
                                editable={isEditing && !busy}
                                required={false}
                                issues={undefined}
                                showVerification={false}
                                attrs={{
                                  id: `catalogue-name-${locale}`,
                                  oninput: (event: Event) => {
                                    if (content)
                                      content.i18n[locale].name = (
                                        event.currentTarget as HTMLInputElement
                                      ).value
                                  },
                                }}
                                onStart={() => {
                                  namesBeforeEdit[locale] =
                                    content?.i18n[locale].name ?? ''
                                }}
                                onCancel={() => {
                                  if (content)
                                    content.i18n[locale].name = namesBeforeEdit[locale]
                                }}
                                onClear={() => {
                                  if (content) content.i18n[locale].name = ''
                                }}
                              />
                            {/if}
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>
                </section>
                <section
                  class="col-span-2 grid min-w-0 content-start"
                  aria-label="Identity"
                >
                  <SectionHeader title="Identity" icon={ListTree} />
                  <div class="grid grid-cols-2 items-start gap-x-8 gap-y-6 px-6 py-5">
                    <TextInput
                      id="catalogue-code"
                      label="Code"
                      value={content.code ?? ''}
                      onValueChange={value => {
                        if (content) content.code = value || undefined
                      }}
                      {isEditing}
                      disabled={busy}
                      variant="resource"
                      class="gap-1!"
                    />
                    <div class="grid gap-2">
                      <h4 class="text-muted-foreground text-xs font-medium">
                        {kind === 'group' ? 'Parent group' : 'Group'}
                      </h4>
                      {#if isEditing}
                        {#if !newGroup}
                          <SearchSelect
                            plain
                            selectedDisplay
                            resetOnSelect
                            createLabel="Create group"
                            onCreate={name => {
                              if (!content) return
                              previousGroupId = content.groupId ?? null
                              groupSearch = ''
                              newGroup = {
                                id: crypto.randomUUID(),
                                i18n: Object.fromEntries(
                                  selectedLocales.map(locale => [
                                    locale,
                                    { name: locale === 'en' ? name : '' },
                                  ]),
                                ),
                              }
                              content.groupId = newGroup.id
                            }}
                            label={kind === 'group'
                              ? 'Search parent groups'
                              : 'Search groups'}
                            value={content.groupId ?? ''}
                            items={groups.map(group => ({
                              value: group.id,
                              label: catalogueDisplayName(group),
                              keywords: group.code,
                              image: group.logo ?? undefined,
                              imageFallbackSrcs: catalogueLogoFallbacks(group),
                              imageFramed: true,
                              href: catalogueHref(group),
                            }))}
                            disabled={busy}
                            onSearch={value => (groupSearch = value)}
                            onSelect={value => {
                              if (content) content.groupId = value || null
                            }}
                          />
                        {/if}
                        {#if newGroup}
                          <fieldset
                            transition:slide={{
                              duration: prefersReducedMotion.current ? 0 : 160,
                            }}
                            class="grid gap-3 py-2"
                            aria-label="New group names"
                          >
                            {#each shownLocales.filter(
                              locale => newGroup?.i18n[locale],
                            ) as locale (locale)}
                              {@const reviewKey = `${newGroup.id}:group:${locale}`}
                              <div
                                transition:fade={{
                                  duration: prefersReducedMotion.current ? 0 : 160,
                                }}
                              >
                                <div
                                  data-missing-translation={(translationReview.started &&
                                    !newGroup.i18n[locale]?.name?.trim()) ||
                                    undefined}
                                >
                                  {#if translationReview.current(reviewKey)}
                                    <TranslationSuggestion
                                      value={translationReview.proposals[reviewKey]
                                        .value}
                                      label={`Group name · ${locale}`}
                                      prefix={shortLocaleLabel(locale)}
                                      onChange={text => {
                                        translationReview.proposals[reviewKey].value =
                                          text
                                      }}
                                      onAccept={edited =>
                                        translationReview.accept(reviewKey, edited)}
                                      onReject={() =>
                                        translationReview.reject(reviewKey)}
                                    />
                                  {:else}
                                    <FormI18nInlineRow
                                      value={newGroup.i18n[locale].name}
                                      label={`Group name · ${locale}`}
                                      prefix={locale === shownLocales[0]
                                        ? ''
                                        : shortLocaleLabel(locale)}
                                      editable={!busy}
                                      required={false}
                                      issues={undefined}
                                      showVerification={false}
                                      attrs={{
                                        id: `catalogue-group-name-${locale}`,
                                        oninput: (event: Event) => {
                                          if (newGroup)
                                            newGroup.i18n[locale].name = (
                                              event.currentTarget as HTMLInputElement
                                            ).value
                                        },
                                      }}
                                      onStart={() => {
                                        groupNamesBeforeEdit[locale] =
                                          newGroup?.i18n[locale].name ?? ''
                                      }}
                                      onCancel={() => {
                                        if (newGroup)
                                          newGroup.i18n[locale].name =
                                            groupNamesBeforeEdit[locale]
                                      }}
                                      onClear={() => {
                                        if (newGroup) newGroup.i18n[locale].name = ''
                                      }}
                                    />
                                  {/if}
                                </div>
                              </div>
                            {/each}
                            <Button
                              text="Cancel new group"
                              style="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() => {
                                if (content) content.groupId = previousGroupId
                                newGroup = null
                              }}
                            />
                          </fieldset>
                        {/if}
                      {:else}
                        {@const group = groups.find(
                          group => group.id === content?.groupId,
                        )}
                        {#if group}
                          <a
                            href={catalogueHref(group)}
                            class="hover:text-primary focus-visible:outline-primary flex items-center gap-3 rounded-md px-4 py-2"
                          >
                            <ResourceIcon
                              src={group.logo}
                              fallbackSrcs={catalogueLogoFallbacks(group)}
                              framed
                              class="size-12"
                            />
                            <span class="text-sm">{catalogueDisplayName(group)}</span>
                          </a>
                        {:else}
                          <div class="flex items-center gap-3 px-4 py-2">
                            <Building class="text-muted-foreground size-5 shrink-0" />
                            <span class="text-sm">{content.groupId || 'None'}</span>
                          </div>
                        {/if}
                      {/if}
                      {#if groupLookupFailed}
                        <p role="alert" class="text-destructive text-sm">
                          Unable to load group details.
                        </p>
                        <Button
                          text="Retry group details"
                          style="ghost"
                          size="sm"
                          onClick={() => groupLookupRetry++}
                        />
                      {/if}
                      {#if parentGroups.length}
                        <ol aria-label="Parent groups" class="grid gap-2">
                          {#each parentGroups as parent, level (parent.id)}
                            <li
                              class="border-border min-w-0 border-l pl-3"
                              style:margin-left={`${Math.min(level + 1, 4)}rem`}
                            >
                              <span class="text-muted-foreground text-xs">Part of</span>
                              <a
                                href={catalogueHref(parent)}
                                class="hover:text-primary focus-visible:outline-primary flex min-w-0 items-center gap-3 rounded-md py-2"
                              >
                                <ResourceIcon
                                  src={parent.logo}
                                  fallbackSrcs={catalogueLogoFallbacks(parent)}
                                  framed
                                  class="size-12 shrink-0"
                                />
                                <span
                                  class="min-w-0 text-sm break-words whitespace-normal"
                                  >{catalogueDisplayName(parent)}</span
                                >
                              </a>
                            </li>
                          {/each}
                        </ol>
                      {/if}
                      {#if parentGroupsFailed}
                        <p role="alert" class="text-destructive text-sm">
                          Unable to load parent groups.
                        </p>
                      {/if}
                    </div>
                    {#if kind === 'brand'}
                      <div class="grid gap-2">
                        <h4 class="text-muted-foreground text-xs font-medium">
                          Categories
                        </h4>
                        {#if isEditing}
                          <SearchSelect
                            label="Add category"
                            plain
                            resetOnSelect
                            items={categoryOptions
                              .filter(key => !content?.categories?.includes(key))
                              .map(key => ({
                                value: key,
                                label: placeCategoryLabel(key),
                              }))}
                            disabled={busy}
                            onSelect={value => {
                              if (value && content)
                                content.categories = [
                                  ...new Set([...(content.categories ?? []), value]),
                                ]
                            }}
                          />
                        {/if}
                        <fieldset
                          class="mt-4 flex flex-wrap gap-2 px-4"
                          aria-label="Categories"
                        >
                          {#each content.categories ?? [] as key (key)}
                            {#if isEditing}
                              <Button
                                text={`${placeCategoryLabel(key)} ×`}
                                style="soft"
                                size="sm"
                                disabled={busy}
                                onClick={() => {
                                  if (content)
                                    content.categories = content.categories?.filter(
                                      value => value !== key,
                                    )
                                }}
                              />
                            {:else}
                              <span
                                class="border-border bg-muted/30 rounded-full border px-3 py-1 text-sm"
                                >{placeCategoryLabel(key)}</span
                              >
                            {/if}
                          {:else}
                            {#if !isEditing}
                              <span class="text-muted-foreground text-sm">None</span>
                            {/if}
                          {/each}
                        </fieldset>
                      </div>
                      {#key selected?.id}
                        <WikidataBrandPicker
                          bind:value={wikidataId}
                          persisted={selected?.wikidataId}
                          name={content.i18n.en?.name ?? ''}
                          disabled={!isEditing || busy}
                          onUseLogo={logo => upload(undefined, logo)}
                        />
                      {/key}
                    {/if}
                  </div>
                </section>
              </div>
              <CatalogueArtworkEditor
                bind:content
                {organisationId}
                editable={isEditing && canEdit && !busy}
              />
              {#if selected?.kind === 'group'}
                <section aria-label="Subgroups">
                  <SectionHeader title="Subgroups" icon={Building} />
                  <div class="px-6 py-5">
                    {#if subgroupsLoading}
                      <p role="status" class="text-muted-foreground text-sm">
                        Loading subgroups…
                      </p>
                    {:else if subgroupsFailed}
                      <p role="alert" class="text-destructive text-sm">
                        Unable to load subgroups.
                      </p>
                    {:else if subgroups.length}
                      <div
                        class="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-6"
                      >
                        {#each subgroups as group (group.id)}
                          <a
                            href={catalogueHref(group)}
                            class="hover:bg-muted/40 focus-visible:outline-primary flex min-w-0 flex-col items-center gap-3 rounded-lg p-2 text-center"
                          >
                            <ResourceIcon
                              src={group.logo}
                              fallbackSrcs={catalogueLogoFallbacks(group)}
                              framed
                              class="size-20"
                            />
                            <span class="text-sm break-words"
                              >{catalogueDisplayName(group)}</span
                            >
                          </a>
                        {/each}
                      </div>
                    {:else}
                      <p class="text-muted-foreground px-4 text-sm">No subgroups.</p>
                    {/if}
                  </div>
                </section>
              {/if}
              {#if selected?.kind === 'group' ||
                (selected?.kind === 'brand' && groupBrands.length > 0)}
                <section
                  aria-label={selected?.kind === 'group' ? 'Brands' : 'Sibling brands'}
                >
                  <SectionHeader
                    title={selected?.kind === 'group' ? 'Brands' : 'Sibling brands'}
                    icon={Tags}
                  />
                  <div class="px-6 py-5">
                    {#if groupBrandsLoading}
                      <p role="status" class="text-muted-foreground text-sm">
                        Loading brands…
                      </p>
                    {:else if groupBrandsFailed}
                      <p role="alert" class="text-destructive text-sm">
                        Unable to load brands.
                      </p>
                    {:else if groupBrands.length}
                      <div
                        class="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-6"
                      >
                        {#each groupBrands as brand (brand.id)}
                          {@const name =
                            brand.i18n[canonicalContentTag(getLocaleKey())]?.name ||
                            catalogueDisplayName(brand)}
                          <a
                            href={catalogueHref(brand)}
                            class="hover:bg-muted/40 focus-visible:outline-primary flex min-w-0 flex-col items-center gap-3 rounded-lg p-2 text-center"
                          >
                            <span
                              class="border-border bg-muted/30 flex size-20 items-center justify-center rounded-xl border"
                            >
                              <ResourceIcon
                                src={brand.logo}
                                fallbackSrcs={catalogueLogoFallbacks(brand)}
                                class="size-full p-2"
                              />
                            </span>
                            <span class="text-sm break-words">{name}</span>
                          </a>
                        {/each}
                      </div>
                    {:else}
                      <p class="text-muted-foreground px-4 text-sm">
                        No linked brands.
                      </p>
                    {/if}
                  </div>
                </section>
              {/if}
            </section>
          {:else if !detailFailed}
            <CatalogueProfileSkeleton
              kind={routeKind === 'group' ? 'group' : 'brand'}
            />
          {/if}
        </div>
      </FormSurface>
    </form>
  {/if}
  {#if detailFailed}
    <div class="px-6 py-3">
      <p role="alert" class="text-destructive text-sm">
        Unable to load this catalogue record. Please retry.
      </p>
      <Button
        text="Retry catalogue record"
        style="ghost"
        onClick={() => detailRetry++}
      />
    </div>
  {/if}
  {#if !detail && nextCursor}
    <div bind:this={sentinel} class="flex justify-center p-6">
      {#if !loadingMore}
        <Button
          text={moreFailed ? 'Retry loading more' : 'Load more'}
          style="ghost"
          onClick={() => void loadMore()}
        />
      {/if}
      {#if moreFailed}
        <p role="alert">Unable to load more records.</p>
      {/if}
    </div>
  {/if}
  {#if !detail && indexFailed}
    <div class="px-6 py-3">
      <p role="alert" class="text-destructive text-sm">
        Unable to load the catalogue list.
      </p>
      <Button text="Retry catalogue list" style="ghost" onClick={() => indexRetry++} />
    </div>
  {/if}
  {#if failed}
    <p role="alert" class="text-destructive px-6 py-3 text-sm">
      {saveFailure || 'Unable to save the catalogue change. Please try again.'}
    </p>
  {/if}
  {#if saved && !dirty}
    <p role="status" class="px-6 py-3 text-sm">Catalogue saved</p>
  {/if}
  {#if importStatus}
    <p role="status" class="text-muted-foreground px-6 py-3 text-sm">{importStatus}</p>
  {/if}
</Main.Root>
