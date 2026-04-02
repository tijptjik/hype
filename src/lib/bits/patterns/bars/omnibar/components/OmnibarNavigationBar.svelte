<script lang="ts">
// COMPONENTS
import OmnibarCollection from './OmnibarCollection.svelte'
import OmnibarNavigationArrow from './OmnibarNavigationArrow.svelte'
import OmnibarNavigationHeader from './OmnibarNavigationHeader.svelte'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getOmniCtx } from '$lib/context/omni.svelte'
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
// STYLES
import { getOmnibarNavBarClasses } from '../omnibar.styles'

const omniCtx = getOmniCtx()
const appCtx = getAppCtx()
const responsiveCtx = getResponsiveCtx()

const collectionMode = $derived(omniCtx.state.mode)
const isNotFeatureMode = $derived(collectionMode !== 'feature')
const isNewFeature = $derived(omniCtx.isNewFeatureMode)
const hasElevatedChrome = $derived(responsiveCtx.hasElevatedChrome)
const navBarClasses = $derived(getOmnibarNavBarClasses(hasElevatedChrome))
</script>

<div id="omni-nav-bar" class={navBarClasses}>
  {#if isNotFeatureMode && !isNewFeature && appCtx.state.active.collection}
    <div class="flex h-full w-full items-center">
      <div class="h-full shrink-0"><OmnibarNavigationArrow direction="left" /></div>
      <div class="min-w-0 flex-1"><OmnibarNavigationHeader /></div>
      <div class="h-full shrink-0"><OmnibarNavigationArrow direction="right" /></div>
    </div>
  {:else}
    <div class="w-full"><OmnibarNavigationHeader /></div>
  {/if}
</div>

{#if collectionMode !== 'feature' && omniCtx.state.isTrayOpen && !isNewFeature}
  <div class="relative z-50 grid grid-cols-1 grid-rows-1">
    <OmnibarCollection
      mode="navigation"
      items={appCtx.state.active.collection?.items || []}
      {hasElevatedChrome}
    />
  </div>
{/if}
