<script lang="ts">
// SVELTE
import { tick } from 'svelte'
// TYPES
import type { Snippet } from 'svelte'
type Option = { id: string; label: string; name: string }
let {
  origins,
  destinations,
  onPlan,
  onStop,
  onClear,
  flying,
  hasRoute,
  status,
}: {
  origins: Option[]
  destinations: Option[]
  onPlan: (origin: string, destination: string, fly: boolean) => Promise<boolean>
  onStop: () => void
  onClear: () => void
  flying: boolean
  hasRoute: boolean
  status: Snippet
} = $props()
let origin = $state(''),
  destination = $state(''),
  busy = $state(false),
  error = $state('')
$effect(() => {
  if (!origins.some(o => o.id === origin)) origin = origins[0]?.id ?? ''
  if (!destinations.some(o => o.id === destination))
    destination = destinations[0]?.id ?? ''
})
/** Requests a route through the host's adapter. @param fly Whether to animate. @returns Completion. */
async function plan(fly: boolean): Promise<void> {
  busy = true
  error = ''
  await tick()
  try {
    if (!(await onPlan(origin, destination, fly)))
      error = 'No verified route available between these places.'
  } catch {
    error = 'Could not load the route. Please try again.'
  } finally {
    busy = false
  }
}
</script>
<div
  class="bg-panel text-base-content border-border pointer-events-auto w-80 max-w-full rounded-xl border p-3 text-xs"
  data-route-controls
>
  <details>
    <summary class="cursor-pointer font-medium">Route preview</summary>
    <div class="mt-3 grid grid-cols-2 gap-2">
      <label class="grid gap-1"
        >Entrance<select
          aria-label="Route entrance"
          class="bg-surface min-w-0 rounded p-2"
          bind:value={origin}
          disabled={busy}
        >
          {#each origins as option (option.id)}
            <option value={option.id}>{option.label}</option>
          {/each}
        </select></label
      >
      <label class="grid gap-1"
        >Destination<select
          aria-label="Route destination"
          class="bg-surface min-w-0 rounded p-2"
          bind:value={destination}
          disabled={busy}
        >
          {#each destinations as option (option.id)}
            <option value={option.id}>{option.label}</option>
          {/each}
        </select></label
      >
    </div>
    <p class="text-muted-foreground mt-2">
      Unpaid routes first. Paid access only when no unpaid route is mapped. Preview
      connections may be incomplete.
    </p>
  </details>
  <div class="mt-2 flex flex-wrap gap-3">
    <button
      type="button"
      class="text-primary"
      disabled={busy || !origin || !destination}
      onclick={() => plan(false)}
    >
      Highlight route
    </button>
    <button
      type="button"
      class="text-primary font-semibold"
      disabled={busy || !origin || !destination}
      onclick={() => plan(true)}
    >
      {busy
        ? 'Finding route…'
        : `▶ Fly to ${destinations.find(d => d.id === destination)?.name ?? 'destination'}`}
    </button>
    {#if flying}
      <button type="button" onclick={onStop}>Stop</button>
    {/if}
    {#if hasRoute}
      <button type="button" onclick={onClear}>Clear</button>
    {/if}
  </div>
  {#if error}
    <p role="alert" class="text-error mt-2">{error}</p>
  {/if}
  {@render status()}
</div>
