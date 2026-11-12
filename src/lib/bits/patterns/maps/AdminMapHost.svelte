<script lang="ts">
// COMPONENTS
import LazyMaplet from './LazyMaplet.svelte'
// TYPES
import type { AdminMap } from '#lib/context/adminMap.svelte.js'

let { owner }: { owner: AdminMap } = $props()
let parking = $state<HTMLDivElement>()
let container = $state<HTMLDivElement>()

// The layout retains the component; routes receive the same DOM subtree and WebGL canvas.
$effect(() => {
  owner.parking = parking ?? null
  owner.container = container ?? null
  if (container) (owner.target ?? parking)?.append(container)
  return () => {
    owner.container = null
    owner.parking = null
  }
})
</script>

<div bind:this={parking} hidden aria-hidden="true">
  <div bind:this={container} class="h-full w-full" data-admin-map-renderer>
    {#if owner.props}
      <LazyMaplet {...owner.props} />
    {/if}
  </div>
</div>
