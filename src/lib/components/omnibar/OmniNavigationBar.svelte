<script lang="ts">
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// COMPONENTS
import OmniNavHeader from './OmniNavHeader.svelte'
import OmniNavArrow from './OmniNavArrow.svelte'
import OmniCollection from './OmniCollection.svelte'
// STYLES
import { OMNIBAR_NAV_BAR_CLASSES } from './omnibar.styles'
// TYPES
import { getOmniCtx } from '$lib/context/omni.svelte'

// CONTEXT
const omniCtx = getOmniCtx()
const appCtx = getAppCtx()

let collectionMode = $derived(omniCtx.state.mode)
let isNotFeatureMode = $derived(collectionMode !== 'feature')
let isNewFeature = $derived(omniCtx.isNewFeatureMode)
</script>

<div id="omni-nav-bar" class={OMNIBAR_NAV_BAR_CLASSES}>
  {#if isNotFeatureMode && !isNewFeature && appCtx.state.active.collection}
    <div class="flex h-full w-full items-center">
      <div class="h-full shrink-0"><OmniNavArrow direction="left" /></div>
      <div class="min-w-0 flex-1"><OmniNavHeader /></div>
      <div class="h-full shrink-0"><OmniNavArrow direction="right" /></div>
    </div>
  {:else}
    <div class="w-full"><OmniNavHeader /></div>
  {/if}
</div>

{#if collectionMode !== 'feature' && omniCtx.state.isTrayOpen && !isNewFeature}
  <div class="relative z-50 grid grid-cols-1 grid-rows-1">
    <OmniCollection
      mode="navigation"
      items={appCtx.state.active.collection?.items || []}
    />
  </div>
{/if}
