<script lang="ts">
// SVELTE
import { onDestroy, onMount, untrack } from 'svelte'
// COMPONENTS
import * as Main from '#lib/bits/custom/main/index.js'
import ResourceChangelog from './ResourceChangelog.svelte'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
// NAVIGATION
import { getAdminFacetTabsForResource } from '#lib/navigation/facets.js'
import { navigateOnAdmin } from '#lib/navigation/admin.js'
// ENUMS
import { FirstClassResource } from '#lib/enums.js'
// I18N
import { getLocaleKey } from '#lib/i18n.js'
// API
import {
  getResourceChangelog,
  markResourceChangelogChecked,
} from '#lib/api/resourceChangelog.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// ICONS
import HistoryIcon from 'virtual:icons/proicons/history'
import OrganisationIcon from 'virtual:icons/proicons/person-multiple'
import ProjectIcon from 'virtual:icons/proicons/grid'
import LayerIcon from 'virtual:icons/proicons/layers'
// TYPES
import type {
  ChangelogCursor,
  ChangelogFilters,
  ChangelogPage,
  ChangelogResource,
} from '#lib/revisions/changelog.js'
import type { FacetType } from '#lib/context/facets.js'

let { resource, resourceRef }: { resource: ChangelogResource; resourceRef: string } =
  $props()
const adminCtx = getAdminCtx()
const headerCtrl = getHeaderCtrl()
// Retain the resolved navigation when changing only this resource's history scope.
const retainedIdentity = untrack(
  () => `${resource}:${resourceRef}:${adminCtx.view.account.revision}`,
)
const retainedFacets = untrack(() =>
  adminCtx.activeResourceType === resource &&
  adminCtx.activeResourceRef === resourceRef &&
  headerCtrl.state.meta.facets.length > 0
    ? headerCtrl.state.meta.facets
    : null,
)
let ownerName = $state('')
let filters = $state<ChangelogFilters>({})
let lastCheckedAt = $state<string | null>(null)
let trackingFailed = $state(false)
let checkedThrough: string | null = null
let visitGeneration = 0
let checkSaved = false
let checkPending = false
const visitIdentity = $derived(
  `${resource}:${resourceRef}:${adminCtx.view.account.revision}`,
)
const locale = $derived(getLocaleKey())
const icons = { organisation: OrganisationIcon, project: ProjectIcon, layer: LayerIcon }

/** Read a fresh authorized page using route identity and explicit admin intent.
 * @param before Optional stable continuation.
 * @param filters Current changelog view filters.
 * @param includeFilterOptions Whether to refresh the unfiltered actor and date metadata.
 * @returns Localized root metadata and accepted descendant changes.
 */
async function loadPage(
  before?: ChangelogCursor,
  filters?: ChangelogFilters,
  includeFilterOptions?: boolean,
): Promise<ChangelogPage> {
  return await refreshRemoteQuery(
    getResourceChangelog({
      resource,
      ref: resourceRef,
      locale,
      before,
      filters,
      includeFilterOptions,
      meta: { isAdminRequest: true },
    }),
  )
}

/** Return to an ordinary editor tab through its owning navigation contract.
 * @param facet Selected header tab.
 * @returns Nothing.
 */
function selectFacet(facet: string): void {
  if (facet !== 'changelog')
    navigateOnAdmin(
      adminCtx,
      FirstClassResource[resource],
      resourceRef,
      facet as FacetType,
    )
}

/** Persist only this successfully loaded visit's original cutoff.
 * @returns Completion after the progress write settles; failures remain retryable.
 */
async function saveCheck(): Promise<void> {
  if (
    !checkedThrough ||
    checkSaved ||
    checkPending ||
    document.visibilityState !== 'visible'
  )
    return
  const visit = visitGeneration
  checkPending = true
  trackingFailed = false
  try {
    await markResourceChangelogChecked({
      resource,
      ref: resourceRef,
      checkedThrough,
      meta: { isAdminRequest: true },
    })
    if (visit === visitGeneration) checkSaved = true
  } catch {
    if (visit === visitGeneration) trackingFailed = true
  } finally {
    if (visit === visitGeneration) checkPending = false
  }
}

/** Freeze the previous visit's marker before saving progress for the next visit.
 * @param value Successfully loaded page from the current resource/account.
 * @returns Nothing; continuations and refreshes retain the original marker.
 */
function handleLoaded(value: ChangelogPage): void {
  ownerName = value.owner.name
  if (checkedThrough !== null) return
  lastCheckedAt = value.checkpoint.lastCheckedAt
  checkedThrough = value.checkpoint.checkedThrough
  void saveCheck()
}

$effect(() => {
  visitIdentity
  visitGeneration++
  lastCheckedAt = null
  checkedThrough = null
  trackingFailed = false
  checkSaved = false
  checkPending = false
  ownerName = ''
})
$effect(() => {
  const facets = new Map<
    string,
    { label: string; icon?: import('svelte').Component | null }
  >(
    retainedFacets && retainedIdentity === visitIdentity
      ? retainedFacets.map(facet => [facet.ref, facet] as const)
      : getAdminFacetTabsForResource(FirstClassResource[resource]),
  )
  facets.set('changelog', { label: 'Changelog', icon: HistoryIcon })
  headerCtrl.setHeaderForEntity(
    headerCtrl.resolveEntityTitle(ownerName, resourceRef),
    icons[resource],
    facets,
    {
      showFilter: true,
      showViewActions: true,
      showFormActions: false,
      showControlBarToggle: false,
      showLayoutToggle: false,
    },
  )
  headerCtrl.setFacets(facets, { active: 'changelog', onFacetChange: selectFacet })
  headerCtrl.setTitleMenuItems([])
  headerCtrl.clearFormActions()
  headerCtrl.setFormActions({
    canEdit: false,
    canPublish: false,
    showDeleteAction: false,
    showPublishAction: false,
  })
})
// Use the same controlled top-header search contract as organisation user indexes.
$effect(() => {
  headerCtrl.setSearch({
    query: filters.search ?? '',
    placeholder: 'Search changes',
    onFilter: value => {
      filters = { ...filters, search: value.slice(0, 200) || undefined }
    },
  })
})
onDestroy(() => {
  headerCtrl.setViewActions([])
  headerCtrl.setSearch(null)
  visitGeneration++
  headerCtrl.clearFormActions()
})
onMount(() => {
  /** A background tab is only checked when its successfully loaded view becomes visible. */
  const onVisible = (): void => {
    if (!trackingFailed) void saveCheck()
  }
  document.addEventListener('visibilitychange', onVisible)
  return () => document.removeEventListener('visibilitychange', onVisible)
})
</script>

<Main.Root>
  <Main.Facet
    isVisible={true}
    fillHeight={true}
    edgeToEdge={true}
    contentClass="h-full overflow-hidden"
    attrs={{ 'data-facet-id': 'changelog' }}
  >
    <FormSurface class="mb-0! flex h-full min-h-0 flex-col">
      <ResourceChangelog
        identity={visitIdentity}
        {locale}
        {loadPage}
        bind:filters
        {lastCheckedAt}
        onLoaded={handleLoaded}
        onActions={actions => headerCtrl.setViewActions(actions)}
      />
      {#if trackingFailed}
        <div
          role="alert"
          class="text-muted-foreground flex shrink-0 flex-wrap items-center gap-2 px-4 py-2 text-xs"
        >
          <span>Could not save your last checked time.</span>
          <button
            type="button"
            class="focus-visible:outline-ring rounded-sm underline focus-visible:outline-2"
            onclick={() => void saveCheck()}
          >
            Retry
          </button>
        </div>
      {/if}
    </FormSurface>
  </Main.Facet>
</Main.Root>
