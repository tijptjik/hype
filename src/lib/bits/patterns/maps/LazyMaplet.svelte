<script lang="ts">
// SVELTE
import { onMount, type ComponentProps } from 'svelte'
// COMPONENTS
import MapLoading from './MapLoading.svelte'
// I18N
import { m } from '#lib/i18n.js'
// TYPES
import type Maplet from './Maplet.svelte'

let props: ComponentProps<typeof Maplet> = $props()
let renderer = $state<Promise<typeof import('./Maplet.svelte')> | null>(null)

// Keep the renderer and its MapLibre dependencies out of non-map startup paths.
onMount(() => {
  renderer = import('./Maplet.svelte')
})
</script>

{#if renderer}
  {#await renderer}
    <div class="relative h-full w-full overflow-hidden"><MapLoading /></div>
  {:then module}
    <module.default {...props} />
  {:catch}
    <div class="bg-base-200 flex h-full w-full items-center justify-center">
      <button
        type="button"
        class="text-base-content rounded px-4 py-2 text-sm"
        onclick={() => {
          renderer = import('./Maplet.svelte')
        }}
      >
        {m.bootstrap__retry()}
      </button>
    </div>
  {/await}
{:else}
  <div class="relative h-full w-full overflow-hidden"><MapLoading /></div>
{/if}
