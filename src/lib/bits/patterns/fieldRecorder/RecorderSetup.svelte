<script lang="ts">
// SVELTE
import { onDestroy, onMount, untrack } from 'svelte'
import { goto } from '$app/navigation'
import { page } from '$app/state'
// CONTEXT
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
// ICONS
import FieldResearchIcon from '#lib/bits/custom/icon/FieldResearchIcon.svelte'
// API
import {
  createResearchSession,
  getResearchProjects,
  getResearchLayers,
  getResearchSession,
  getResearchSessions,
} from '#lib/api/fieldResearch.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// COMPONENTS
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import ResearchConfiguration from '#lib/bits/patterns/fieldResearch/ResearchConfiguration.svelte'
import ResearchLocations from '#lib/bits/patterns/fieldResearch/ResearchLocations.svelte'
// TYPES
import type { ResearchSession } from '#lib/fieldResearch/model.js'
let projects = $state<Awaited<ReturnType<typeof getResearchProjects>>>([])
let sessions = $state<Awaited<ReturnType<typeof getResearchSessions>>>([])
let layers = $state<Awaited<ReturnType<typeof getResearchLayers>>>([])
let current = $state<ResearchSession | null>(null)
let projectId = $state('')
let name = $state('')
let busy = $state(false)
let ready = $state(false)
let failure = $state('')
const control = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'
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
  return goto(indexPath + '?new=1')
}

/** Select a resource tab while keeping the session's draft mounted. @param ref Resource facet. @returns Nothing. */
function selectFacet(ref: string): void {
  if (!facets.has(ref)) return
  const url = new URL(tabUrl.href)
  if (url.hash === '#' + ref) return
  url.hash = ref
  void goto(url, { shallow: true, state: page.state })
}

$effect(() => {
  const detail = Boolean(sessionId)
  const isNew = creating
  const active = facet
  const title = current?.name
  untrack(() => {
    if (detail || isNew) {
      header.setHeaderForEntity(
        isNew ? 'New field session' : title || 'Field Sessions',
        FieldResearchIcon,
        facets,
        { showFacets: detail, showFormActions: detail && active !== 'locations' },
      )
      if (detail) header.setFacets(facets, { active, onFacetChange: selectFacet })
      header.setCrumbs([{ name: 'Field Sessions', href: indexPath }])
      header.setCreateAction(null)
    } else {
      header.setHeaderForIndex('Field Sessions', FieldResearchIcon, {
        showNew: true,
        showFilter: false,
        showFacets: false,
        showViewActions: false,
        showLayoutToggle: false,
        showControlBarToggle: false,
      })
      header.setCreateAction(startNew)
    }
  })
})
onDestroy(() => header.setCreateAction(null))
/** Load authorized project and session choices. @returns Once the list is ready. */
async function load(): Promise<void> {
  try {
    ;[projects, sessions] = await Promise.all([
      getResearchProjects({}),
      refreshRemoteQuery(getResearchSessions({})),
    ])
    ready = true
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
}
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
    await goto(indexPath + '?session=' + encodeURIComponent(session.id), {
      replace: true,
    })
    await load()
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  } finally {
    busy = false
  }
}
onMount(() => void load())
</script>
<div
  class={sessionId
    ? 'w-full min-w-0'
    : 'mx-auto w-full min-w-0 max-w-5xl px-4 py-6 sm:px-6'}
>
  {#if !sessionId}
    <h1 class="text-2xl font-semibold">Field Sessions</h1>
    <p class="text-muted-foreground mt-2 text-sm">
      Configure project fields, layers and vetted Locations for recording.
    </p>
  {/if}
  {#if failure}
    <p role="alert" class="text-error mt-4">{failure}</p>
  {/if}
  {#if !ready || (sessionId && !current && !failure)}
    <div
      class="bg-base-200 mt-6 h-64 animate-pulse rounded-xl"
      aria-busy="true"
      aria-label="Loading field sessions"
    ></div>
  {:else if current}
    {#key current.id}
      <FormSurface>
        <div hidden={facet === 'locations'}>
          <ResearchConfiguration
            {header}
            section={facet === 'fields' ? 'fields' : 'core'}
            sessionId={current.id}
            revision={current.revision}
            {layers}
            disabled={busy ||
              current.status === 'completed' ||
              Boolean(current.isArchived)}
            onSaved={refresh}
          />
        </div>
        {#if facet === 'locations'}
          <ResearchLocations
            sessionId={current.id}
            revision={current.revision}
            disabled={busy ||
              current.status === 'completed' ||
              Boolean(current.isArchived)}
            onSaved={refresh}
          />
        {/if}
      </FormSurface>
    {/key}
  {:else if creating}
    <div class="mt-6 max-w-xl">
      <form
        class="space-y-4 rounded-xl border border-slate-200 bg-white p-5 text-slate-800 shadow-sm"
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
        <label class="block space-y-1 text-sm"
          >Project<select class={control} bind:value={projectId} required>
            <option value="">Choose a project</option>
            {#each projects as project}
              <option value={project.id}>
                {project.name} · {project.organisationName}
              </option>
            {/each}
          </select></label
        >
        <button
          type="submit"
          class="bg-primary text-primary-foreground rounded-lg px-4 py-2 disabled:opacity-50"
          disabled={busy || !projectId || !name.trim()}
        >
          Create session
        </button>
        <a href={indexPath} class="ml-3 text-sm underline">Cancel</a>
      </form>
    </div>
  {:else if !sessionId}
    <div class="mt-6">
      <section
        class="rounded-xl border border-slate-200 bg-white p-5 text-slate-800 shadow-sm"
      >
        <h2 class="text-lg font-semibold">Existing sessions</h2>
        <div class="mt-3 space-y-2">
          {#each sessions as session (session.id)}
            <a
              href={indexPath + '?session=' + encodeURIComponent(session.id)}
              class="border-border hover:bg-base-200 block w-full rounded-lg border p-3 text-left"
            >
              <span class="font-medium">{session.name}</span
              ><span class="text-muted-foreground block text-xs"
                >{projects.find(project => project.id === session.projectId)?.name ??
                  session.projectId}</span
              >
            </a>
          {:else}
            <p class="text-muted-foreground text-sm">No field sessions yet.</p>
          {/each}
        </div>
      </section>
    </div>
  {/if}
</div>
