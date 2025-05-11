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
import FeatureTitle from '$lib/components/featureCard/FeatureTitle.svelte';
import FeatureDescription from '$lib/components/featureCard/FeatureDescription.svelte';
import FeatureProperties from '$lib/components/featureCard/FeatureProperties.svelte';
import FeaturePortal from '$lib/components/featureCard/FeaturePortal.svelte';
import FeatureActions from '$lib/components/featureCard/FeatureActions.svelte';
import MissingReportReason from '$lib/components/featureCard/MissingReportReason.svelte';
import PhotoCredit from '$lib/components/featureCard/PhotoCredit.svelte';
import Spacer from '$lib/components/featureCard/Spacer.svelte';
// CONTEXT
import { getMapContext } from '$lib/context/map.svelte';
import { getOmniContext } from '$lib/context/omni.svelte';
import {
  setFeatureCardContext,
  getFeatureCardContext
} from '$lib/context/featureCard.svelte';
// ENUMS
import { FeatureCardMode } from '$lib/types';
// TYPES
import type { Feature, Layer, Project } from '$lib/types';

// PARAMS
let featureId: string = $state($page.params.id);

// CONTEXT
const mapCtx = getMapContext();
const omniCtx = getOmniContext();

// CONTEXT :: FEATURE CARD
setFeatureCardContext();
const featureCardContext = getFeatureCardContext();

omniCtx.setFeatureCardContext(featureCardContext);

// STATE
let mode = $derived(featureCardContext.state.mode);

// EFFECTS
$effect(() => {
  if (!mapCtx.isInitialised) {
    return;
  }
  featureId = $page.params.id;
  if (mapCtx.getActiveCollection() == null) {
    void handleFeatureSelection();
  }
});

// Helper function to handle async operations
async function handleFeatureSelection() {
  await omniCtx.handleFeatureSelection(mapCtx, featureId);
}
</script>

{#if mapCtx && mapCtx.isInitialised && mapCtx.features[featureId]}
  <FeatureCard>
    <ImageProvider
      mode="gallery"
      isAdminMode={false}
      refType="feature"
      refId={featureId}
      refOrganisation={mapCtx.getOrganisation(
        mapCtx.getProject(
          mapCtx.getLayer(mapCtx.features[featureId] as Feature) as Layer
        ) as Project
      )}
      refProject={mapCtx.getProject(
        mapCtx.getLayer(mapCtx.features[featureId] as Feature) as Layer
      ) as Project}>
      {#if mode === FeatureCardMode.Display}
        <div
          class="flex-shink-0 flex h-full w-full flex-col overflow-y-auto overflow-x-visible">
          <FeatureGallery />
          <FeatureBreadcrumbs feature={mapCtx.features[featureId]} />
          <FeatureTitle feature={mapCtx.features[featureId]} />
          <FeatureDescription feature={mapCtx.features[featureId]} />
          <Spacer />
          <div class="flex min-h-8 w-full flex-shrink-0 flex-col overflow-x-visible">
            <div class="flex-grow-1 min-h-50 flex w-full flex-shrink-0 overflow-hidden">
              <div class="flex-1 overflow-y-auto bg-black">
                <FeatureProperties feature={mapCtx.features[featureId]} />
              </div>
              <div class="w-48 flex-shrink-0 overflow-visible">
                <FeaturePortal feature={mapCtx.features[featureId]} />
              </div>
              <div class="h-auto w-4 flex-shrink-0 bg-black"></div>
            </div>
          </div>
          <Spacer />
        </div>
      {:else if mode === FeatureCardMode.New}
        <FeatureGallery />
      {:else if mode === FeatureCardMode.Missing}
        <FeatureGallery isSingleImage={true} />
        <MissingReportReason />
      {:else if mode === FeatureCardMode.AddPhoto}
        <FeatureGallery isCameraActive={true} />
        <PhotoCredit />
      {/if}
      <FeatureActions feature={mapCtx.features[featureId]} />
    </ImageProvider>
  </FeatureCard>
{:else}
  <div class="absolute inset-0 flex items-center justify-center rounded-lg bg-base-300">
    <div class="loading loading-spinner loading-lg text-primary"></div>
  </div>
{/if}
