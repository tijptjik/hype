<script lang="ts">
// Svelte
import { browser } from '$app/environment';
// Stores
import { page } from '$app/stores';
// Components
import FeatureCard from '$lib/components/featureCard/Root.svelte';
import FeatureGallery from '$lib/components/featureCard/FeatureGallery.svelte';
import FeatureBreadcrumbs from '$lib/components/featureCard/FeatureBreadcrumbs.svelte';
import FeatureDescription from '$lib/components/featureCard/FeatureDescription.svelte';
import FeatureProperties from '$lib/components/featureCard/FeatureProperties.svelte';
import FeaturePortal from '$lib/components/featureCard/FeaturePortal.svelte';
import FeatureActions from '$lib/components/featureCard/FeatureActions.svelte';
import MissingReportReason from '$lib/components/featureCard/MissingReportReason.svelte';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';
import { getOmniContext, PageState } from '$lib/context/omni.svelte';
import {
  setFeatureCardContext,
  getFeatureCardContext
} from '$lib/context/featureCard.svelte';
// ENUMS
import { FeatureCardMode } from '$lib/types';
// CONFIG
import { MOBILE_MAX_WIDTH } from '$lib/index';

// PARAMS
let featureId = $state($page.params.id);

// CONTEXT
const mapContext = getMapContext();
const omniContext = getOmniContext();

// CONTEXT :: FEATURE CARD
setFeatureCardContext();
const featureCardContext = getFeatureCardContext();

// STATE
let mode = $derived(featureCardContext.state.mode);

// EFFECTS
$effect(() => {
  if (!mapContext.isInitialised) {
    return;
  }
  featureId = $page.params.id;
  if (mapContext.getActiveCollection() == null) {
    void handleFeatureSelection();
  }
});

// Helper function to handle async operations
async function handleFeatureSelection() {
  await omniContext.handleFeatureSelection(mapContext, featureId);
}

// Calculate offset based on visible panels
let horizontalOffset = $derived(() => {
  const { filters, maps, stars, settings } = mapContext.state.panels;
  const leftPanelOpen = maps || stars;
  const rightPanelOpen = filters || settings;

  if (browser && window.innerWidth < MOBILE_MAX_WIDTH) return 0;
  return (leftPanelOpen ? 210 : 0) - (rightPanelOpen ? 210 : 0);
});
</script>

{#if mapContext.isInitialised && mapContext.features[featureId]}
  <FeatureCard>
    {#if mode === FeatureCardMode.Display}
      <FeatureGallery {featureId} />
      <div>
        <FeatureBreadcrumbs feature={mapContext.features[featureId]} />
        <FeatureDescription feature={mapContext.features[featureId]} />
        <div class="flex">
          <div class="flex-1 bg-black">
            <FeatureProperties feature={mapContext.features[featureId]} />
          </div>
          <div class="w-48 flex-shrink-0 flex-grow-0">
            <FeaturePortal feature={mapContext.features[featureId]} />
          </div>
          <div class="h-auto w-4 flex-shrink-0 flex-grow-0 bg-black"></div>
        </div>
        <FeatureActions feature={mapContext.features[featureId]} />
      </div>
    {:else if mode === FeatureCardMode.New}
      <FeatureGallery {featureId} />
    {:else if mode === FeatureCardMode.Missing}
      <FeatureGallery {featureId} />
      <div>
        <FeatureBreadcrumbs feature={mapContext.features[featureId]} />
        <FeatureDescription feature={mapContext.features[featureId]} />
      </div>
      <MissingReportReason />
      <FeatureActions feature={mapContext.features[featureId]} />
    {/if}
  </FeatureCard>
{/if}
