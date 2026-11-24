<script lang="ts">
// SVELTE
import { onDestroy, untrack } from 'svelte'
import { goto } from '$app/navigation'
import { page } from '$app/state'
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
// ICONS
import FieldResearchIcon from '#lib/bits/custom/icon/FieldResearchIcon.svelte'
import FilterIcon from 'virtual:icons/proicons/filter'
import FilterOffIcon from 'virtual:icons/lucide/funnel-x'
import ProjectIcon from 'virtual:icons/lucide/layout-grid'
import ExteriorIcon from 'virtual:icons/lucide/box'
import InteriorIcon from 'virtual:icons/lucide/layers-3'
import ModelMapIcon from 'virtual:icons/lucide/map'
// API
import {
  createResearchSession,
  archiveResearchSessions,
  getResearchProjects,
  getResearchLayers,
  getResearchSession,
  getResearchSessionFilters,
} from '#lib/api/fieldResearch.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// COMPONENTS
import ResearchSessionIndex from '#lib/bits/patterns/fieldResearch/ResearchSessionIndex.svelte'
import ResearchSessionFilterBar from '#lib/bits/patterns/fieldResearch/ResearchSessionFilterBar.svelte'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import ResearchConfiguration from '#lib/bits/patterns/fieldResearch/ResearchConfiguration.svelte'
import ResearchLocations from '#lib/bits/patterns/fieldResearch/ResearchLocations.svelte'
import ResearchModelGallery from '#lib/bits/patterns/fieldResearch/ResearchModelGallery.svelte'
import ResearchSessionSkeleton from '#lib/bits/patterns/fieldResearch/ResearchSessionSkeleton.svelte'
import { researchConfigurationVersion } from '#lib/fieldResearch/configuration.js'
// TYPES
import type { ResearchSession } from '#lib/fieldResearch/model.js'
let projects = $state<Awaited<ReturnType<typeof getResearchProjects>>>([])
let archived = $state<boolean | null>(false)
let filtersVisible = $state(false)
let creatorId = $state('')
let hasRecords = $state<boolean | null>(null)
let creators = $state<{ value: string; label: string }[]>([])
let sorting = $state<{ sortBy: 'createdAt' | 'name'; sortOrder: 'asc' | 'desc' }>({
  sortBy: 'createdAt',
  sortOrder: 'desc',
})
const adminCtx = getAdminCtx()
const isSuperAdmin = $derived(Boolean(adminCtx.view.user?.superAdmin))
const prisms = $derived({
  organisation: [...adminCtx.view.scope.prisms.organisation],
  project: [...adminCtx.view.scope.prisms.project],
})
const archive = $derived(
  !isSuperAdmin || archived === false
    ? 'active'
    : archived === true
      ? 'archived'
      : 'all',
)
let sessionCount = $state(0)
let layers = $state<Awaited<ReturnType<typeof getResearchLayers>>>([])
let current = $state<ResearchSession | null>(null)
let projectId = $state('')
let projectSearch = $state('')
let name = $state('')
let busy = $state(false)
let ready = $state(false)
let failure = $state('')
const control =
  'border-border bg-panel text-base-content w-full rounded-lg border px-3 py-2 text-sm'
const matchingProjects = $derived.by(() => {
  const query = projectSearch.trim().toLocaleLowerCase()
  return projects.filter(project =>
    [
      project.name,
      project.organisationName,
      project.code,
      project.organisationCode,
    ].some(value => value.toLocaleLowerCase().includes(query)),
  )
})
const header = getHeaderCtrl()
const indexPath = '/admin/field-recorder'
const facets = new Map([
  ['core', 'Profile'],
  ['fields', 'Fields'],
  ['locations', 'Locations'],
])
const sessionId = $derived(page.url.searchParams.get('session'))
const creating = $derived(!sessionId && page.url.searchParams.has('new'))
const tabUrl = $derived(page.shallow?.url ?? page.url)
const modelViews = [
  { id: 'exterior', label: 'Exterior gallery', icon: ExteriorIcon },
  { id: 'interior', label: 'Interior gallery', icon: InteriorIcon },
  { id: 'map', label: '3D model map', icon: ModelMapIcon },
] as const
const modelView = $derived(
  modelViews.find(view => view.id === tabUrl.searchParams.get('models')),
)
const facet = $derived(
  tabUrl.hash === '#fields'
    ? 'fields'
    : tabUrl.hash === '#locations'
      ? 'locations'
      : 'core',
)

/** Open the creation form from the index toolbar. @returns Navigation completion. */
function startNew(): Promise<void> {
  name = ''
  projectId = ''
  projectSearch = ''
  return goto(indexPath + '?new=1')
}

/** Select a resource tab while keeping the session's draft mounted. @param ref Resource facet. @returns Nothing. */
function selectFacet(ref: string): void {
  if (!facets.has(ref)) return
  const url = new URL(tabUrl.href)
  if (url.hash === '#' + ref) return
  url.hash = ref
  url.searchParams.delete('models')
  void goto(url, { shallow: true, state: page.state })
}

/** Toggle a read-only model view, retaining browser history and the active session.
 * @param id Requested view, or null for location selection. @returns Nothing.
 */
function selectModels(id: string | null): void {
  const url = new URL(tabUrl.href)
  if (id && modelView?.id !== id) url.searchParams.set('models', id)
  else url.searchParams.delete('models')
  void goto(url, { shallow: true, state: page.state })
}

const showModelViews = $derived(
  Boolean(
    sessionId &&
      facet === 'locations' &&
      current?.configurationVersion === researchConfigurationVersion,
  ),
)
const showModelMap = $derived(showModelViews && modelView?.id === 'map')
$effect(() => {
  adminCtx.setResourceRef(sessionId || false)
})

$effect(() => {
  const detail = Boolean(sessionId)
  const isNew = creating
  const active = facet
  const title = current?.name
  const showModels = showModelViews
  untrack(() => {
    if (detail || isNew) {
      header.setHeaderForEntity(
        isNew ? 'New field session' : title || 'Field Sessions',
        FieldResearchIcon,
        facets,
        {
          showFacets: detail,
          showViewActions: showModels,
          showControlBarToggle: false,
          showLayoutToggle: false,
          showFormActions: detail && active !== 'locations',
        },
      )
      if (detail) header.setFacets(facets, { active, onFacetChange: selectFacet })
      header.setCrumbs([{ name: 'Field Sessions', href: indexPath }])
      header.setCreateAction(null)
    } else {
      header.setHeaderForIndex('Field Sessions', FieldResearchIcon, {
        showNew: true,
        showFilter: false,
        showFacets: false,
        showViewActions: true,
        showLayoutToggle: false,
        showControlBarToggle: false,
      })
      header.setCreateAction(startNew)
    }
  })
})
onDestroy(() => header.setCreateAction(null))
/** Archive or restore the current session without deleting its records. @returns Once refreshed. */
async function toggleArchive(): Promise<void> {
  if (!current || busy || (current.isArchived && !isSuperAdmin)) return
  busy = true
  try {
    await archiveResearchSessions({
      sessions: [{ id: current.id, revision: current.revision }],
      archived: !current.isArchived,
    })
    await goto(indexPath)
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  } finally {
    busy = false
  }
}
$effect(() => {
  header.setFormActions({
    showDeleteAction: Boolean(current) && (!current?.isArchived || isSuperAdmin),
    isDeleted: Boolean(current?.isArchived),
    isDeleting: busy,
    toggleDelete: toggleArchive,
  })
})
$effect(() => {
  header.setViewActions(
    !sessionId && !creating
      ? [
          {
            text: filtersVisible ? 'Hide filters' : 'Show filters',
            icon: filtersVisible ? FilterOffIcon : FilterIcon,
            color: 'neutral',
            style: 'ghost',
            class: 'px-4',
            alwaysHideLabel: true,
            hideLabelInstantly: true,
            onClick: () => {
              filtersVisible = !filtersVisible
            },
          },
        ]
      : showModelViews
        ? modelViews.map(view => ({
            id: view.id,
            text: view.label,
            icon: view.icon,
            color: modelView?.id === view.id ? 'primary' : 'neutral',
            style: modelView?.id === view.id ? 'soft' : 'ghost',
            alwaysHideLabel: true,
            hideLabelInstantly: true,
            attrs: { 'aria-pressed': modelView?.id === view.id, title: view.label },
            onClick: () => selectModels(view.id),
          }))
        : [],
  )
})
/** Apply the selected session ordering. @param value Sort selection. @returns Nothing. */
function changeSorting(value: { sortBy: string; sortOrder: 'asc' | 'desc' }): void {
  if (value.sortBy !== 'createdAt' && value.sortBy !== 'name') return
  sorting = { sortBy: value.sortBy, sortOrder: value.sortOrder }
}
/** Apply the shared status filter and refresh the index. @param value Archive state. @returns Nothing. */
function filterArchive(value: boolean | null): void {
  archived = isSuperAdmin ? value : false
}
$effect(() => {
  if (!sessionId && !creating) {
    header.setControlBar(
      ResearchSessionFilterBar,
      {
        archived,
        count: sessionCount,
        onChange: filterArchive,
        showArchive: isSuperAdmin,
        sorting,
        onSortingChange: changeSorting,
        creatorId,
        creators,
        hasRecords,
        onCreatorChange: (value: string) => (creatorId = value),
        onRecordsChange: (value: boolean | null) => (hasRecords = value),
        onReset: () => {
          archived = false
          creatorId = ''
          hasRecords = null
        },
      },
      { isVisible: filtersVisible },
    )
  } else header.clearControlBar()
})
// Refresh creator choices within the current authorized prism and record scope.
$effect(() => {
  if (sessionId || creating || !filtersVisible) return
  let active = true
  refreshRemoteQuery(
    getResearchSessionFilters({ archive, prisms, hasRecords: hasRecords ?? undefined }),
  )
    .then(result => {
      if (active) creators = result.creators
    })
    .catch(error => {
      if (active) failure = error instanceof Error ? error.message : String(error)
    })
  return () => {
    active = false
  }
})
onDestroy(() => {
  header.clearControlBar()
  header.setViewActions([])
  header.setFormActions({ showDeleteAction: false, toggleDelete: () => {} })
})
// Only the creation form needs the full set of authorized project choices.
$effect(() => {
  if (!creating) return
  let active = true
  ready = false
  getResearchProjects({})
    .then(choices => {
      if (active) {
        projects = choices
        ready = true
      }
    })
    .catch(error => {
      if (active) failure = error instanceof Error ? error.message : String(error)
    })
  return () => {
    active = false
  }
})
/** Refresh the session revision after a configuration mutation. @returns Once current. */
async function refresh(): Promise<void> {
  const id = sessionId
  if (!id) return
  const result = await refreshRemoteQuery(getResearchSession({ sessionId: id }))
  if (id === sessionId) current = result.session
}

// Fetch only when the session identity changes, including browser Back and Forward.
$effect(() => {
  const id = sessionId
  current = null
  failure = ''
  if (!id) return
  let cancelled = false
  Promise.all([
    refreshRemoteQuery(getResearchSession({ sessionId: id })),
    getResearchLayers({ sessionId: id }),
  ])
    .then(([result, choices]) => {
      if (cancelled) return
      layers = choices
      current = result.session
    })
    .catch(error => {
      if (!cancelled) failure = error instanceof Error ? error.message : String(error)
    })
  return () => {
    cancelled = true
  }
})
/** Create a project-owned session without requiring a layer. @returns Once ready to configure. */
async function create(): Promise<void> {
  busy = true
  failure = ''
  try {
    const session = await createResearchSession({
      id: crypto.randomUUID(),
      name,
      projectId,
    })
    name = ''
    projectId = ''
    projectSearch = ''
    await goto(indexPath + '?session=' + encodeURIComponent(session.id), {
      replace: true,
    })
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  } finally {
    busy = false
  }
}
</script>
<div
  class={creating
    ? 'mx-auto w-full max-w-5xl min-w-0 px-4 py-6 sm:px-6'
    : sessionId && !showModelMap
      ? 'w-full min-w-0'
      : 'flex min-h-0 min-w-0 flex-1 flex-col'}
>
  {#if failure}
    <p role="alert" class="text-error mt-4">{failure}</p>
  {/if}
  {#if !sessionId && !creating}
    <ResearchSessionIndex
      {indexPath}
      {archive}
      {sorting}
      {prisms}
      {creatorId}
      {hasRecords}
      bind:count={sessionCount}
    />
  {:else if !failure && sessionId && !current}
    <FormSurface>
      <ResearchSessionSkeleton
        section={facet === 'fields'
          ? 'fields'
          : facet === 'locations'
            ? 'locations'
            : 'core'}
      />
    </FormSurface>
  {:else if !failure && creating && !ready}
    <div
      class="bg-base-200 mt-6 h-64 animate-pulse rounded-xl"
      aria-busy="true"
      aria-label="Loading field sessions"
      role="status"
    ></div>
  {:else if current}
    {#key current.id}
      <FormSurface class={showModelMap ? 'mb-0 flex min-h-0 flex-1 flex-col' : ''}>
        <div
          hidden={facet === 'locations' &&
            current.configurationVersion === researchConfigurationVersion}
        >
          <ResearchConfiguration
            {header}
            section={facet === 'fields' ? 'fields' : 'core'}
            sessionId={current.id}
            revision={current.revision}
            {layers}
            allowMigration={!current.isArchived}
            disabled={busy ||
              current.status === 'completed' ||
              Boolean(current.isArchived)}
            onSaved={refresh}
          />
        </div>
        {#if facet === 'locations' &&
          current.configurationVersion === researchConfigurationVersion}
          {#if modelView}
            <ResearchModelGallery
              view={modelView.id}
              title={modelView.label}
              icon={modelView.icon}
              organisationId={current.organisationId}
              sessionId={current.id}
              revision={current.revision}
              onClose={() => selectModels(null)}
            />
          {:else}
            <ResearchLocations
              organisationId={current.organisationId}
              projectId={current.projectId}
              sessionId={current.id}
              revision={current.revision}
              disabled={busy ||
                current.status === 'completed' ||
                Boolean(current.isArchived)}
              onSaved={refresh}
            />
          {/if}
        {/if}
      </FormSurface>
    {/key}
  {:else if creating}
    <div class="max-w-xl">
      <form
        class="border-border bg-panel text-base-content space-y-4 rounded-xl border p-5 shadow-sm"
        onsubmit={event => {
          event.preventDefault()
          void create()
        }}
      >
        <h2 class="text-lg font-semibold">Create a session</h2>
        <label class="block space-y-1 text-sm"
          >Session name<input
            class={control}
            bind:value={name}
            required
            maxlength="200"
          ></label
        >
        <fieldset class="space-y-2">
          <legend class="text-sm">Project</legend>
          <label class="text-muted-foreground block text-sm">
            Search by project or organisation name
            <input
              type="search"
              class="bg-panel text-base-content border-border focus-visible:outline-primary mt-2 w-full min-w-0 rounded-lg border p-3"
              placeholder="Search by name"
              bind:value={projectSearch}
              oninput={() => (projectId = '')}
              onkeydown={event => {
                if (event.key === 'Enter') event.preventDefault()
              }}
            >
          </label>
          <div class="grid gap-2 sm:grid-cols-2">
            {#each matchingProjects as project (project.id)}
              <button
                type="button"
                class="bg-panel border-border hover:border-primary hover:bg-primary/5 focus-visible:ring-primary/50 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
                class:ring-1={project.id === projectId}
                class:ring-primary={project.id === projectId}
                class:ring-inset={project.id === projectId}
                aria-pressed={project.id === projectId}
                onclick={() => (projectId = project.id)}
              >
                <ProjectIcon
                  class="text-primary bg-primary/10 size-10 shrink-0 rounded-lg p-2"
                />
                <span class="min-w-0 break-words whitespace-normal">
                  <span class="text-muted-foreground block text-xs"
                    >{project.organisationName}</span
                  >
                  <span class="block font-semibold">{project.name}</span>
                </span>
              </button>
            {:else}
              <p class="text-muted-foreground text-sm">No projects found.</p>
            {/each}
          </div>
        </fieldset>
        <button
          type="submit"
          class="bg-primary text-primary-content rounded-lg px-4 py-2 disabled:opacity-50"
          disabled={busy || !projectId || !name.trim()}
        >
          Create session
        </button>
        <a href={indexPath} class="ml-3 text-sm underline">Cancel</a>
      </form>
    </div>
  {/if}
</div>
