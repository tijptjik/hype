<script lang="ts">
// SVELTE
import { onDestroy, untrack } from 'svelte'
import { replaceState } from '$app/navigation'
import { page } from '$app/state'
// CONTEXT
import { usePanelResources } from '#lib/context/panel-resources.svelte.js'
import { getAdminCtx } from '#lib/context/admin.svelte.js'
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
// API
import { getLocations } from '#lib/api/locationDirectory.remote.js'
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
// DOMAIN
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
const publication = $derived(
  currentUrl.searchParams.get('publication') === 'draft' ? 'draft' : 'published',
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
  kind: LocationKind | ''
  q: string
  organisationId: string
  lifecycleStatus: LifecycleStatus | ''
  publication: 'published' | 'draft'
}>({
  kind: '',
  q: '',
  organisationId: '',
  lifecycleStatus: '',
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
      kind,
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
        publication: admin.view.isSuperAdmin() ? activeSearch.publication : undefined,
        scope: admin.view.getRoleScopeQueryKey(),
        q: activeSearch.q,
        kind: activeSearch.kind || undefined,
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

let previousScope = ''
// Account and filter changes invalidate private rows before another authorized read.
$effect(() => {
  const scope = JSON.stringify([
    admin.view.getRoleScopeQueryKey(),
    organisationId,
    publication,
  ])
  query
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
  header.setSearch({
    query,
    placeholder: m.location_directory_search(),
    onFilter: value => updateFilters({ q: value }),
  })
  header.setControlBar(
    LocationControlBar,
    {
      publication,
      showPublication: admin.view.isSuperAdmin(),
      onPublicationChange: (value: string) => updateFilters({ publication: value }),
      count: totalCount,
      countLoading: loading && totalCount === null,
      kind,
      onKindChange: (value: string) => {
        updateFilters({
          kind: value,
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
          lifecycleStatus: '',
          publication: '',
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
