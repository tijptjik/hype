<script lang="ts">
// SVELTE
import { onMount, type ComponentProps } from 'svelte'
// COMPONENTS
import MapLoading from './MapLoading.svelte'
// I18N
import { m } from '#lib/i18n.js'
// TYPES
import type MapCanvas from './MapCanvas.svelte'

let props: ComponentProps<typeof MapCanvas> = $props()
let renderer = $state<Promise<typeof import('./MapCanvas.svelte')> | null>(null)

// Keep the renderer and its MapLibre dependencies out of non-map startup paths.
onMount(() => {
  renderer = import('./MapCanvas.svelte')
})
</script>

{#if renderer}
  {#await renderer}
    <MapLoading />
  {:then module}
    <module.default {...props} />
  {:catch}
    <div class="bg-base-200 absolute inset-0 flex items-center justify-center">
      <button
        type="button"
        class="text-base-content rounded px-4 py-2 text-sm"
        onclick={() => {
          renderer = import('./MapCanvas.svelte')
        }}
      >
        {m.bootstrap__retry()}
      </button>
    </div>
  {/await}
{:else}
  <MapLoading />
{/if}
