<script lang="ts">
// Svelte
import { browser } from '$app/environment';
// Stores
import { page } from '$app/stores';
// PROVIDERS
import ImageProvider from '$lib/components/providers/ImageProvider.svelte';
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
// TYPES
import type { Feature, Layer, Project } from '$lib/types';

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
    <ImageProvider
      {mode}
      refType={'feature'}
      refId={featureId}
      refOrganisation={mapContext.getOrganisation(
        mapContext.getProject(
          mapContext.getLayer(mapContext.features[featureId] as Feature) as Layer
        ) as Project
      )}
      refProject={mapContext.getProject(
        mapContext.getLayer(mapContext.features[featureId] as Feature) as Layer
      ) as Project}>
      {#if mode === FeatureCardMode.Display}
        <div class="flex h-full w-full flex-col overflow-x-visible">
          <FeatureGallery {featureId} />
          <div class="flex min-h-0 w-full flex-1 basis-2/5 flex-col overflow-x-visible">
            <FeatureBreadcrumbs feature={mapContext.features[featureId]} />
            <FeatureDescription feature={mapContext.features[featureId]} />
            <div class="flex w-full flex-shrink-0 overflow-x-visible">
              <div class="flex-1 overflow-y-auto bg-black">
                <FeatureProperties feature={mapContext.features[featureId]} />
              </div>
              <div class="w-48 flex-shrink-0 overflow-visible">
                <FeaturePortal feature={mapContext.features[featureId]} />
              </div>
              <div class="h-auto w-4 flex-shrink-0 bg-black"></div>
            </div>
            <FeatureActions feature={mapContext.features[featureId]} />
          </div>
        </div>
      {:else if mode === FeatureCardMode.New}
        <FeatureGallery {featureId} />
      {:else if mode === FeatureCardMode.Missing}
        <FeatureGallery {featureId} />
        <div class="flex-shrink-1 flex flex-grow-0 flex-col">
          <FeatureBreadcrumbs feature={mapContext.features[featureId]} />
          <FeatureDescription feature={mapContext.features[featureId]} />
        </div>
        <MissingReportReason />
        <FeatureActions feature={mapContext.features[featureId]} />
      {/if}
    </ImageProvider>
  </FeatureCard>
{/if}
