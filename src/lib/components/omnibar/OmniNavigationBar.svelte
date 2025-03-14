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
  class="relative z-30 col-start-1 row-start-1 flex min-h-14 w-full items-stretch justify-between transition-[height]"
  in:fade={{ duration: 150, delay: 150 }}
  out:fade={{ duration: 150 }}>
  {#if collectionMode !== 'feature'}
    <OmniNavArrow direction="left" />
    <OmniNavHeader />
    <OmniNavArrow direction="right" />
  {:else}
    <OmniNavHeader />
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
    class="fixed inset-0 z-[6] h-[100dvh] w-full bg-black/30"
    onclick={(e) => omniContext.toggleTray(e)}
    transition:fade={{ duration: 200 }}>
  </div>
{/if}
