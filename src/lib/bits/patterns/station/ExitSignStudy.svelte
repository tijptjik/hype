<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// COMPONENTS
import ExitSign from './ExitSign.svelte'
// DATA
import catalogue from '#lib/indoor/exit-catalogue.json'
// Keep the server-rendered controls inert until their bindings are attached.
let ready = $state(false)
onMount(() => {
  ready = true
})
let query = $state('')
let size = $state(64)
let selected = $state(false)
const groups = ['Standalone letters', 'Numbered exits'] as const
const visible = $derived(
  catalogue.exits.filter(exit =>
    `${exit.code} ${exit.stations.join(' ')}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  ),
)
</script>

<main class="bg-base-100 text-base-content h-dvh overflow-y-auto px-5 py-10 sm:px-10">
  <div class="mx-auto max-w-7xl">
    <a href="/themes" class="text-sm underline">← Theme studio</a>
    <h1 class="mt-4 text-3xl font-semibold">Exit signs</h1>
    <p class="text-muted-foreground mt-3 max-w-3xl text-sm">
      {catalogue.exits.length}
      distinct exit codes recorded across {catalogue.stations} station maps. Standalone
      letters and numbered exits use the same square badge and the same renderer as the
      map.
    </p>
    <fieldset
      disabled={!ready}
      class="bg-surface mt-6 flex flex-wrap items-end gap-5 rounded-xl border border-current/10 p-4"
    >
      <label class="grid gap-2 text-sm"
        >Find an exit or station code
        <input
          type="search"
          bind:value={query}
          placeholder="D3, R, TST…"
          class="bg-base-100 rounded border border-current/20 px-3 py-2"
        >
      </label>
      <label class="grid gap-2 text-sm"
        >Badge size · {size}px
        <input
          aria-label="Badge size"
          type="range"
          min="32"
          max="96"
          step="16"
          bind:value={size}
        >
      </label>
      <label class="flex items-center gap-2 py-2 text-sm"
        ><input type="checkbox" bind:checked={selected}>Selected state</label
      >
      <p class="text-muted-foreground py-2 text-sm" role="status">
        {visible.length}
        signs
      </p>
    </fieldset>
    {#each groups as group}
      {@const exits = visible.filter(
        exit =>
          (/\d/.test(exit.code) ? 'Numbered exits' : 'Standalone letters') === group,
      )}
      {#if exits.length}
        <section class="mt-8" aria-label={group}>
          <h2 class="text-lg font-semibold">{group}</h2>
          <ul class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {#each exits as exit (exit.code)}
              <li
                data-exit-specimen={exit.code}
                class="bg-surface flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-current/10 p-4"
              >
                <svg
                  width={(size * 36) / 32}
                  height={(size * 36) / 32}
                  viewBox="-18 -18 36 36"
                  role="img"
                  aria-label={`Exit ${exit.code}`}
                >
                  <ExitSign label={exit.code} {selected} />
                </svg>
                <p class="font-medium">{exit.code}</p>
                <p
                  class="text-muted-foreground max-w-full text-center text-xs break-words"
                  title={exit.stations.join(', ')}
                >
                  {exit.stations.length}
                  {exit.stations.length === 1 ? 'station' : 'stations'}
                </p>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    {/each}
    {#if !visible.length}
      <p class="mt-8">No matching exit codes.</p>
    {/if}
    <p class="text-muted-foreground mt-8 text-sm">
      Source: station map baseline {catalogue.baseline}. Codes are included only where
      recorded; this is not a claim that every physical exit is covered. Descriptive
      entrances without a letter code are not included.
    </p>
  </div>
</main>
