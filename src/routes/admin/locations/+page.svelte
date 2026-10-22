<script lang="ts">
// SVELTE
import { onDestroy, untrack } from 'svelte'
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
import { lifecycleStatusesForKind } from '#lib/locations/lifecycle.js'
// TYPES
import type { LocationKind } from '#lib/locations/kinds.js'
import type { LifecycleStatus } from '#lib/locations/lifecycle.js'
import type { LocationResource } from '#lib/locations/resource.js'

const admin = getAdminCtx()
const header = getHeaderCtrl()
admin.setFacet(false, false, FirstClassResource.location)
const organisations = usePanelResources(admin.view, 'organisation', () => '')
let query = $state('')
let organisationId = $state('')
let kind = $state<LocationKind | ''>('')
let lifecycleStatus = $state<LifecycleStatus | ''>('')
let rows = $state.raw<LocationResource[]>([])
let cursor = $state<string | null>(null)
let loading = $state(false)
let initialised = $state(false)
let failed = $state(false)
let version = 0
let activeSearch = $state<{
  kind: LocationKind | ''
  q: string
  organisationId: string
  lifecycleStatus: LifecycleStatus | ''
}>({ kind: '', q: '', organisationId: '', lifecycleStatus: '' })

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
    }
    rows = []
    cursor = null
    initialised = false
  }
  loading = true
  failed = false
  try {
    const result = await runRemoteQuery(
      getLocations({
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
  } catch {
    if (request === version) failed = true
  } finally {
    if (request === version) {
      loading = false
      initialised = true
    }
  }
}

// Account and filter changes invalidate private rows before another authorized read.
$effect(() => {
  admin.view.getRoleScopeQueryKey()
  query
  kind
  organisationId
  lifecycleStatus
  untrack(() => {
    version++
    rows = []
    cursor = null
    initialised = false
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
    onFilter: value => (query = value),
  })
  header.setControlBar(
    LocationControlBar,
    {
      count: rows.length,
      kind,
      onKindChange: (value: string) => {
        kind = value as LocationKind | ''
        if (
          lifecycleStatus &&
          !lifecycleStatusesForKind(kind).includes(lifecycleStatus)
        )
          lifecycleStatus = ''
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
      onOrganisationChange: (value: string) => (organisationId = value),
      onLifecycleChange: (value: string) =>
        (lifecycleStatus = value as LifecycleStatus | ''),
      onReset: () => {
        organisationId = ''
        kind = ''
        lifecycleStatus = ''
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

<div class="flex min-h-0 flex-1 flex-col overflow-hidden text-foreground">
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
    entities={rows}
    isInitialised={initialised}
    hasMore={Boolean(cursor) && !failed}
    isLoadingMore={loading}
    onNearEnd={() => void load(true)}
  >
    {#snippet row(
      entity,
      index,
    )}
      <LocationRow {entity} {index} organisationId={activeSearch.organisationId} />
    {/snippet}
  </ResourceIndex>
</div>
