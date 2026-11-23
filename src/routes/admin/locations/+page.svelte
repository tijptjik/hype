<script lang="ts">
// SVELTE
import { onDestroy, untrack } from 'svelte'
import { goto, replaceState } from '$app/navigation'
import { page } from '$app/state'
// CONTEXT
import { usePanelResources } from '#lib/context/panel-resources.svelte.js'
import { getAdminCtx } from '#lib/context/admin.svelte.js'
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
// API
import { getLocation, getLocations } from '#lib/api/locationDirectory.remote.js'
import { runRemoteQuery } from '#lib/remote/index.js'
// BITS
import { ResourceIndex } from '#lib/bits/index.js'
import LocationRow from '#lib/bits/patterns/resource/rows/locationRow/LocationRow.svelte'
import LocationControlBar from '#lib/bits/patterns/resource/locationControlBar/LocationControlBar.svelte'
import { FirstClassResource } from '#lib/enums.js'
import { Button } from '#lib/bits/core/index.js'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// ICONS
import MapPin from 'virtual:icons/proicons/location'
import SaanSeoiMarkIcon from '#lib/bits/patterns/cards/resourceCard/components/SaanSeoiMarkIcon.svelte'
// DOMAIN
import { locationSortKey, type LocationSortKey } from '#lib/locations/sorting.js'
import {
  lifecycleStatusesForKind,
  lifecycleStatus as getLifecycleStatus,
} from '#lib/locations/lifecycle.js'
import { foldFeatureSearchText } from '#lib/features/search.js'
import { LocationKindSchema, type LocationKind } from '#lib/locations/kinds.js'
// TYPES
import type { LifecycleStatus } from '#lib/locations/lifecycle.js'
import type { LocationResource } from '#lib/locations/resource.js'

const admin = getAdminCtx()
const header = getHeaderCtrl()
admin.setFacet(false, false, FirstClassResource.location)
const organisations = usePanelResources(admin.view, 'organisation', () => '')
// Sidebar changes use the shallow URL; history navigation restores these controls.
const currentUrl = $derived(page.shallow?.url ?? page.url)
const query = $derived((currentUrl.searchParams.get('q') ?? '').slice(0, 200))
const organisationId = $derived(currentUrl.searchParams.get('organisationId') ?? '')
const kind = $derived(
  LocationKindSchema.safeParse(currentUrl.searchParams.get('kind')).data ?? '',
)
const sortBy = $derived(locationSortKey(currentUrl.searchParams.get('sortBy')))
const sortOrder = $derived(
  currentUrl.searchParams.get('sortOrder') === 'desc' ? 'desc' : 'asc',
)
const publication = $derived(
  currentUrl.searchParams.get('publication') === 'all'
    ? 'all'
    : currentUrl.searchParams.get('publication') === 'draft'
      ? 'draft'
      : 'published',
)
const buildingId = $derived(
  kind === 'building_part' ? (currentUrl.searchParams.get('buildingId') ?? '') : '',
)
const lifecycleStatus = $derived.by(() => {
  const value = currentUrl.searchParams.get('lifecycleStatus') as LifecycleStatus | null
  return value && lifecycleStatusesForKind(kind).includes(value) ? value : ''
})

/** Persist controls on this history entry so returning from a location restores them.
 * @param changes Filter parameters to replace; empty values remove the parameter.
 * @returns Nothing.
 * @remarks Preserve unrelated parameters and SvelteKit history state.
 */
function updateFilters(changes: Record<string, string>): void {
  const next = new URL(currentUrl.href)
  for (const [key, value] of Object.entries(changes)) {
    if (value) next.searchParams.set(key, value)
    else next.searchParams.delete(key)
  }
  if (next.href !== currentUrl.href) replaceState(next, page.state)
}
let rows = $state.raw<LocationResource[]>([])
let totalCount = $state<number | null>(null)
let cursor = $state<string | null>(null)
let loading = $state(false)
let initialised = $state(false)
let failed = $state(false)
let version = 0
const visibleRows = $derived.by(() => {
  if (totalCount !== null) return rows
  const needle = foldFeatureSearchText(query.trim())
  return rows.filter(
    row =>
      (!kind || row.kind === kind) &&
      (!lifecycleStatus || getLifecycleStatus(row.facts) === lifecycleStatus) &&
      (!needle ||
        row.id === query.trim() ||
        row.ssId === query.trim() ||
        Object.values(row.facts?.names ?? {}).some(
          name =>
            typeof name === 'string' && foldFeatureSearchText(name).includes(needle),
        )),
  )
})
let activeSearch = $state<{
  sortBy: LocationSortKey
  sortOrder: 'asc' | 'desc'
  kind: LocationKind | ''
  q: string
  organisationId: string
  lifecycleStatus: LifecycleStatus | ''
  buildingId: string
  publication: 'all' | 'published' | 'draft'
}>({
  sortBy: 'name',
  sortOrder: 'asc',
  kind: '',
  q: '',
  organisationId: '',
  lifecycleStatus: '',
  buildingId: '',
  publication: 'published',
})

/**
 * Load one server-authorized page, clearing stale rows when replacing the search.
 * @param more Whether to continue the submitted search.
 * @returns Completion after the newest request settles.
 */
async function load(more = false): Promise<void> {
  if (more && (loading || !cursor)) return
  const request = ++version
  if (!more) {
    activeSearch = {
      sortBy,
      sortOrder,
      kind,
      buildingId,
      q: query.trim().slice(0, 200),
      organisationId,
      lifecycleStatus,
      publication: admin.view.isSuperAdmin() ? publication : 'published',
    }
    totalCount = null
    cursor = null
  }
  loading = true
  failed = false
  try {
    const result = await runRemoteQuery(
      getLocations({
        includeCount: !more,
        sortBy: activeSearch.sortBy,
        sortOrder: activeSearch.sortOrder,
        locale:
          getLocaleKey() === 'en'
            ? 'en'
            : getLocaleKey() === 'zhHant'
              ? 'zh-hant'
              : 'zh-hans',
        publication: admin.view.isSuperAdmin() ? activeSearch.publication : undefined,
        scope: admin.view.getRoleScopeQueryKey(),
        q: activeSearch.q,
        kind: activeSearch.kind || undefined,
        buildingId: activeSearch.buildingId || undefined,
        lifecycleStatus: activeSearch.lifecycleStatus || undefined,
        organisationId: activeSearch.organisationId || undefined,
        after: more ? (cursor ?? undefined) : undefined,
      }),
    )
    if (request !== version) return
    rows = more ? [...rows, ...result.data] : result.data
    cursor = result.nextCursor
    if (!more) totalCount = result.totalCount
  } catch {
    if (request === version) failed = true
  } finally {
    if (request === version) {
      loading = false
      initialised = true
    }
  }
}

let buildingRows = $state.raw<LocationResource[]>([])
let buildingCursor = $state<string | null>(null)
let buildingQuery = $state('')
let buildingVersion = 0
let buildingsLoading = $state(false)
let buildingsFailed = $state(false)
let selectedBuilding = $state.raw<LocationResource | null>(null)
/** Load a bounded page of accessible parent Locations.
 * @param more Continue the current search.
 * @returns Completion of the latest option request.
 */
async function loadBuildings(more = false): Promise<void> {
  if (more && (buildingsLoading || !buildingCursor)) return
  const request = ++buildingVersion
  buildingsLoading = true
  buildingsFailed = false
  try {
    const result = await runRemoteQuery(
      getLocations({
        parentOfParts: true,
        includeCount: false,
        scope: admin.view.getRoleScopeQueryKey(),
        organisationId: organisationId || undefined,
        q: buildingQuery || undefined,
        after: more ? (buildingCursor ?? undefined) : undefined,
      }),
    )
    if (request !== buildingVersion) return
    buildingRows = more ? [...buildingRows, ...result.data] : result.data
    buildingCursor = result.nextCursor
  } catch {
    if (request === buildingVersion) buildingsFailed = true
  } finally {
    if (request === buildingVersion) buildingsLoading = false
  }
}
$effect(() => {
  kind
  organisationId
  buildingQuery
  admin.view.getRoleScopeQueryKey()
  untrack(() => {
    buildingVersion++
    buildingRows = []
    buildingCursor = null
  })
  if (kind !== 'building_part') return
  const timer = setTimeout(() => void loadBuildings().catch(() => {}), 200)
  return () => clearTimeout(timer)
})
$effect(() => {
  const id = buildingId
  const scope = admin.view.getRoleScopeQueryKey()
  const owner = organisationId
  let active = true
  selectedBuilding = null
  if (id)
    void runRemoteQuery(getLocation({ id, scope, organisationId: owner || undefined }))
      .then(row => {
        if (active) selectedBuilding = row
      })
      .catch(() => {})
  return () => {
    active = false
  }
})
let previousScope = ''
// Account and filter changes invalidate private rows before another authorized read.
$effect(() => {
  const scope = JSON.stringify([
    admin.view.getRoleScopeQueryKey(),
    organisationId,
    publication,
  ])
  query
  sortBy
  sortOrder
  getLocaleKey()
  buildingId
  kind
  organisationId
  lifecycleStatus
  publication
  untrack(() => {
    version++
    if (previousScope !== scope) rows = []
    previousScope = scope
    totalCount = null
    cursor = null
    initialised = rows.length > 0
    failed = false
    loading = true
  })
  const timeout = setTimeout(() => void load(), 200)
  return () => clearTimeout(timeout)
})
$effect(() => {
  header.setHeaderForIndex(m.location_policy_tab(), MapPin, {
    showNew: false,
    showLayoutToggle: false,
  })
  header.setTitleMenuItems(
    admin.view.isSuperAdmin()
      ? [
          {
            label: 'Match locations',
            icon: SaanSeoiMarkIcon,
            onSelect: () => {
              void goto('/admin/locations/match')
            },
          },
        ]
      : [],
  )
  header.setSearch({
    query,
    placeholder: m.location_directory_search(),
    onFilter: value => updateFilters({ q: value }),
  })
  header.setControlBar(
    LocationControlBar,
    {
      publication,
      sorting: { sortBy, sortOrder },
      onSortingChange: (value: { sortBy: string; sortOrder: 'asc' | 'desc' }) =>
        updateFilters(value),
      buildingId,
      buildingsLoading: buildingsLoading && !buildingQuery,
      buildingsFailed,
      onRetryBuildings: () => {
        void loadBuildings()
      },
      buildings: [
        ...(selectedBuilding &&
        !buildingRows.some(row => row.id === selectedBuilding?.id)
          ? [selectedBuilding]
          : []),
        ...buildingRows,
      ].map(row => ({
        value: row.id,
        label:
          row.facts?.names?.[
            getLocaleKey() === 'en'
              ? 'en'
              : getLocaleKey() === 'zhHant'
                ? 'zh-hant'
                : 'zh-hans'
          ] ||
          row.facts?.names?.en ||
          row.id,
      })),
      onBuildingChange: (value: string) => updateFilters({ buildingId: value }),
      onBuildingSearch: (value: string) => {
        buildingQuery = value
      },
      hasMoreBuildings: Boolean(buildingCursor),
      onMoreBuildings: () => {
        void loadBuildings(true)
      },
      showPublication: admin.view.isSuperAdmin(),
      onPublicationChange: (value: string) => updateFilters({ publication: value }),
      count: totalCount,
      countLoading: loading && totalCount === null,
      kind,
      onKindChange: (value: string) => {
        updateFilters({
          kind: value,
          buildingId: '',
          lifecycleStatus:
            lifecycleStatus &&
            lifecycleStatusesForKind(value as LocationKind | '').includes(
              lifecycleStatus,
            )
              ? lifecycleStatus
              : '',
        })
      },
      organisationId,
      lifecycleStatus,
      organisations: organisations.rows.map(organisation => ({
        value: organisation.id,
        label:
          organisation.i18n?.[getLocaleKey()]?.name ||
          organisation.i18n?.en?.name ||
          organisation.id,
      })),
      onOrganisationChange: (value: string) => updateFilters({ organisationId: value }),
      onLifecycleChange: (value: string) => updateFilters({ lifecycleStatus: value }),
      onReset: () => {
        updateFilters({
          organisationId: '',
          kind: '',
          buildingId: '',
          lifecycleStatus: '',
          publication: '',
          sortBy: '',
          sortOrder: '',
        })
      },
      hasMoreOrganisations: organisations.list.hasMore,
      loadingOrganisations: organisations.list.loading,
      organisationError: Boolean(organisations.list.error),
      onMoreOrganisations: () => {
        void organisations.list.next().catch(() => {})
      },
      onRetryOrganisations: () => organisations.retry(),
    },
    { isVisible: admin.listUi.state.isControlBarVisible.location },
  )
  header.clearFooter()
})
onDestroy(() => {
  header.setTitleMenuItems([])
  version++
  header.setSearch(null)
})
</script>

<div class="text-foreground flex min-h-0 flex-1 flex-col overflow-hidden">
  {#if failed}
    <div role="alert" class="flex items-center gap-3 px-6 py-2">
      <span>{m.resource_action_failed()}</span>
      <Button
        text={m.location_directory_search()}
        onClick={() => void load(Boolean(cursor))}
      />
    </div>
  {/if}
  <ResourceIndex
    resource={FirstClassResource.location}
    entities={visibleRows}
    isInitialised={initialised}
    hasMore={Boolean(cursor) && !failed}
    isLoadingMore={loading}
    onNearEnd={() => void load(true)}
  >
    {#snippet row(entity, index)}
      <LocationRow {entity} {index} organisationId={activeSearch.organisationId} />
    {/snippet}
  </ResourceIndex>
</div>
