<script lang="ts">
// TRANSITIONS
import { fade, slide } from 'svelte/transition';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';
// COMPONENTS
import OmniNavHeader from './OmniNavHeader.svelte';
import OmniNavArrow from './OmniNavArrow.svelte';
import OmniCollection from './OmniCollection.svelte';
// TYPES
import { getOmniContext } from '$lib/context/omni.svelte';

// CONTEXT
const omniContext = getOmniContext();
const mapContext = getMapContext();

let collectionMode = $derived(mapContext.getActiveCollection()?.type);
</script>

<div
  id="omni-nav-bar"
  class="relative z-30 col-start-1 row-start-1 flex min-h-16 w-full items-center border-b-3 border-base-300 bg-black transition-[height] w-120:rounded-lg w-120:border-3 w-192:min-h-14">
  {#if collectionMode !== 'feature'}
    <div class="flex h-full w-full items-center">
      <div class="h-full flex-shrink-0">
        <OmniNavArrow direction="left" />
      </div>
      <div class="min-w-0 flex-1">
        <OmniNavHeader />
      </div>
      <div class="h-full flex-shrink-0">
        <OmniNavArrow direction="right" />
      </div>
    </div>
  {:else}
    <div class="w-full">
      <OmniNavHeader />
    </div>
  {/if}
</div>

{#if collectionMode !== 'feature' && omniContext.state.isTrayOpen}
  <div
    class="relative z-50 grid grid-cols-1 grid-rows-1"
    transition:slide={{ duration: 200 }}>
    <OmniCollection
      mode="navigation"
      items={mapContext.state.active.collection?.items || []} />
  </div>
  <div
    class="fixed inset-0 z-[6] h-[calc(100dvh*3)] w-full -translate-y-1/2 bg-black/30"
    onclick={(e) => omniContext.toggleTray(e)}
    transition:fade={{ duration: 200 }}>
  </div>
{/if}
