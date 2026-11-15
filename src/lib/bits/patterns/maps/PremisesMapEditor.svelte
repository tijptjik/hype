<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// API
import {
  listPremisesMaps,
  getPremisesMapDraft,
  savePremisesMapDraft,
  publishPremisesMapDraft,
  restorePremisesMapDraft,
} from '#lib/api/premisesMaps.remote.js'
// COMPONENTS
import ConnectionMapEditor from './ConnectionMapEditor.svelte'
// TYPES
import type { MapBundle, MapConnection } from '#lib/indoor/releases.js'
let maps = $state.raw<Awaited<ReturnType<typeof listPremisesMaps>>>([])
let selected = $state('')
let loaded = $state.raw<Awaited<ReturnType<typeof getPremisesMapDraft>> | null>(null)
let connections = $state<MapConnection[]>([])
let busy = $state(false)
let message = $state('')
let dirty = $derived(
  loaded?.bundle
    ? JSON.stringify(connections) !==
        JSON.stringify(loaded.bundle.data.connections ?? [])
    : false,
)
/** Load the exact draft and concurrency fences. @returns Completion. */
async function load(): Promise<void> {
  if (!selected) return
  const query = getPremisesMapDraft({ id: selected })
  await query.refresh()
  loaded = await query
  connections = structuredClone(loaded.bundle?.data.connections ?? [])
}
/** Handle an editor operation and retain actionable server errors. @param action Authorized remote operation. @returns Completion. */
async function run(action: () => Promise<void>): Promise<void> {
  busy = true
  message = ''
  try {
    await action()
  } catch (error) {
    message = error instanceof Error ? error.message : 'Map update failed'
  } finally {
    busy = false
  }
}
$effect(() => {
  untrack(() => {
    void run(async () => {
      maps = await listPremisesMaps({})
      selected = maps[0]?.id ?? ''
      await load()
    })
  })
})
</script>

<main class="mx-auto flex w-full max-w-5xl flex-col gap-8 overflow-y-auto p-8">
  <div>
    <h1 class="text-2xl font-semibold">Premises maps</h1>
    <p class="text-muted-foreground mt-2">
      Edit connections in a draft, then publish a complete map version.
    </p>
  </div>
  <label class="flex flex-col gap-2"
    >Map
    <select
      class="border-input bg-panel rounded border p-2"
      bind:value={selected}
      disabled={busy || dirty}
      onchange={() => run(load)}
    >
      {#each maps as map}
        <option value={map.id}>{map.name}</option>
      {/each}
    </select>
  </label>
  {#if loaded?.bundle}
    <p>
      Published version {loaded.map.publishedVersion} · Draft revision
      {loaded.map.draftVersion}
    </p>
    {#key selected}
      <ConnectionMapEditor data={loaded.bundle.data} bind:connections disabled={busy} />
    {/key}
    <div class="flex gap-4">
      <button
        type="button"
        class="bg-primary text-primary-content rounded px-4 py-2 disabled:opacity-50"
        disabled={busy || !dirty}
        onclick={() =>
          run(async () => {
            if (!loaded?.bundle) return
            const bundle: MapBundle = {
              ...loaded.bundle,
              data: {
                ...loaded.bundle.data,
                connections: $state.snapshot(connections),
              },
            }
            await savePremisesMapDraft({
              id: selected,
              expectedVersion: loaded.map.draftVersion,
              bundle,
            })
            await load()
            message = 'Draft saved. The published map is unchanged.'
          })}
      >
        Save draft
      </button>
      <button
        type="button"
        class="border-input rounded border px-4 py-2 disabled:opacity-50"
        disabled={busy ||
          dirty ||
          !loaded.map.draftHash ||
          loaded.map.draftHash === loaded.map.publishedHash}
        onclick={() =>
          run(async () => {
            if (!loaded?.map.draftHash) return
            await publishPremisesMapDraft({
              id: selected,
              hash: loaded.map.draftHash,
              expectedDraftVersion: loaded.map.draftVersion,
              expectedPublishedVersion: loaded.map.publishedVersion,
            })
            await load()
            message = 'Map published.'
          })}
      >
        Publish saved draft
      </button>
      <button
        type="button"
        class="text-primary p-2 underline"
        disabled={busy || !dirty}
        onclick={() => run(load)}
      >
        Discard unsaved edits
      </button>
      <a class="text-primary p-2 underline" href={`/premises/${selected}`}
        >Open published map</a
      >
    </div>
    <section>
      <h2 class="text-lg font-semibold">Published history</h2>
      <ul class="mt-3 space-y-3">
        {#each loaded.history as release}
          <li class="flex flex-wrap items-center gap-3">
            <span>Version {release.version} · {release.createdAt}</span
            ><button
              type="button"
              class="text-primary underline disabled:opacity-50"
              disabled={busy || dirty}
              onclick={() =>
                run(async () => {
                  if (!loaded) return
                  await restorePremisesMapDraft({
                    id: selected,
                    hash: release.hash,
                    expectedVersion: loaded.map.draftVersion,
                  })
                  await load()
                  message =
                    'Previous release restored as a draft. Publish to activate it.'
                })}
            >
              Restore as draft
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
  {#if message}
    <p role="status">{message}</p>
  {/if}
</main>
