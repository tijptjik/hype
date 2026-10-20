<script lang="ts">
// SVELTE
import { onDestroy, untrack } from 'svelte'
// CONTEXT
import { usePanelResources } from '#lib/context/panel-resources.svelte.js'
import { getAdminCtx } from '#lib/context/admin.svelte.js'
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
// API
import { getPlaces } from '#lib/api/placeDirectory.remote.js'
import { runRemoteQuery } from '#lib/remote/index.js'
// BITS
import { Button } from '#lib/bits/core/index.js'
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import MapPin from 'virtual:icons/proicons/location'
// TYPES
import type { PlaceResource } from '#lib/places/resource.js'

const admin = getAdminCtx()
const header = getHeaderCtrl()
const projects = usePanelResources(admin.view, 'project', () => '')
let query = $state('')
let projectId = $state('')
let rows = $state<PlaceResource[]>([])
let cursor = $state<string | null>(null)
let loading = $state(false)
let failed = $state(false)
let version = 0
let activeSearch = { q: '', projectId: '' }

/**
 * Load one server-authorized page, preserving settled rows during replacement.
 * @param more Whether to continue the submitted search.
 * @returns Completion after the newest request settles.
 */
async function load(more = false): Promise<void> {
  const request = ++version
  if (!more) activeSearch = { q: query, projectId }
  loading = true
  failed = false
  try {
    const result = await runRemoteQuery(
      getPlaces({
        scope: admin.view.getRoleScopeQueryKey(),
        q: activeSearch.q,
        projectId: activeSearch.projectId || undefined,
        after: more ? (cursor ?? undefined) : undefined,
      }),
    )
    if (request !== version) return
    rows = more ? [...rows, ...result.data] : result.data
    cursor = result.nextCursor
  } catch {
    if (request === version) failed = true
  } finally {
    if (request === version) loading = false
  }
}

// Account changes invalidate private rows before starting another authorized read.
$effect(() => {
  admin.view.getRoleScopeQueryKey()
  untrack(() => {
    rows = []
    cursor = null
    void load()
  })
})
$effect(() => {
  header.setHeaderForStandAlone(m.place_policy_tab(), MapPin, {
    showNew: false,
    showFilter: false,
    showViewActions: false,
    showLayoutToggle: false,
    showControlBarToggle: false,
  })
  header.clearFooter()
})
onDestroy(() => {
  version++
})
</script>

<div class="min-h-0 flex-1 overflow-y-auto bg-panel">
  <div class="mx-auto flex w-full max-w-5xl flex-col gap-5 p-6">
    <form
      class="flex flex-wrap items-end gap-3"
      onsubmit={event => {
        event.preventDefault()
        void load()
      }}
    >
      <label class="flex min-w-56 flex-1 flex-col gap-2">
        <span>{m.place_directory_search()}</span>
        <input
          class="rounded-lg border border-border bg-panel px-3 py-2"
          bind:value={query}
          maxlength="200"
        >
      </label>
      <label class="flex flex-col gap-2">
        <span>{m.place_directory_scope()}</span>
        <select
          class="rounded-lg border border-border bg-panel px-3 py-2"
          bind:value={projectId}
        >
          <option value="">{m.place_directory_shared()}</option>
          {#each projects.rows as project (project.id)}
            <option value={project.id}>{project.i18n?.en?.name ?? project.id}</option>
          {/each}
        </select>
      </label>
      {#if projects.list.hasMore}
        <Button
          type="button"
          disabled={projects.list.loading}
          text={m.place_directory_more_projects()}
          onClick={() => {
            void projects.list.next().catch(() => {})
          }}
        />
      {/if}
      {#if projects.list.error}
        <Button
          type="button"
          text={m.resource_action_failed()}
          onClick={() => projects.retry()}
        />
      {/if}
      <Button type="submit" disabled={loading} text={m.place_directory_search()} />
    </form>
    <p class="text-sm text-muted-foreground">{m.place_directory_help()}</p>
    {#if failed}
      <p role="alert">{m.resource_action_failed()}</p>
    {/if}
    <div
      class="divide-y divide-border rounded-xl border border-border"
      aria-busy={loading}
    >
      {#each rows as place (place.id)}
        <a
          class="flex items-center justify-between gap-4 p-4 hover:bg-muted"
          href={`/admin/places/${encodeURIComponent(place.id)}`}
        >
          <div class="min-w-0">
            <div class="truncate text-lg font-medium">
              {place.facts?.names.en ??
                Object.values(place.facts?.names ?? {})[0] ??
                place.id}
            </div>
            <div class="text-sm text-muted-foreground">{place.id}</div>
          </div>
          <span class="rounded-full bg-muted px-3 py-1 text-sm">{place.state}</span>
        </a>
      {:else}
        <p class="p-5">
          {loading ? m.place_directory_loading() : m.place_directory_empty()}
        </p>
      {/each}
    </div>
    {#if cursor}
      <Button
        disabled={loading || failed}
        onClick={() => void load(true)}
        text={m.place_directory_more()}
      />
    {/if}
  </div>
</div>
