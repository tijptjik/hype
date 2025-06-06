<script lang="ts">
// Svelte
import { browser } from '$app/environment';
import { untrack } from 'svelte';
// Stores
import { page } from '$app/state';
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
import Spacer from '$lib/components/featureCard/layout/Spacer.svelte';
import Container from '$lib/components/featureCard/layout/Container.svelte';
import FeaturePortalSection from '$lib/components/featureCard/layout/FeaturePortalSection.svelte';
// CONTEXT
import { getMapCtx } from '$lib/context/map.svelte';
import { getOmniContext } from '$lib/context/omni.svelte';
import {
  setFeatureCardContext,
  getFeatureCardContext
} from '$lib/context/featureCard.svelte';
// ENUMS
import { FeatureCardMode, ImageContextResource } from '$lib/enums';
// TYPES
import type { Feature, Layer, Project } from '$lib/types';

// PARAMS
let featureId: string = $state(page.params.id);

// CONTEXT
const mapCtx = getMapCtx();
const omniCtx = getOmniContext();

// CONTEXT :: FEATURE CARD
setFeatureCardContext();
const cardCtx = getFeatureCardContext();

omniCtx.setFeatureCardContext(cardCtx);

// STATE
let mode = $derived(cardCtx.state.mode);

// EFFECTS
$effect(() => {
  if (!mapCtx.isInitialised) {
    return;
  }
  featureId = page.params.id;
  
  // Only react to activeCollection changes, not flag changes
  if (mapCtx.getActiveCollection() == null) {
    // Check the flag without making the effect reactive to it
    const isClosing = untrack(() => omniCtx.isIntentionallyClosing);
    
    if (!isClosing) {
      console.log('🔴 PAGE: Active collection is null and not intentionally closing, calling handleFeatureSelection');
      void handleFeatureSelection();
    } else {
      console.log('🔴 PAGE: Active collection is null but intentionally closing, NOT calling handleFeatureSelection');
    }
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
      ctxType={ImageContextResource.feature}
      ctxId={featureId}
      organisation={mapCtx.getOrganisation(
        mapCtx.getProject(
          mapCtx.getLayer(mapCtx.features[featureId] as Feature) as Layer
        ) as Project
      )}
      project={mapCtx.getProject(
        mapCtx.getLayer(mapCtx.features[featureId] as Feature) as Layer
      ) as Project}>
      {#if mode === FeatureCardMode.Display}
        <Container>
          <FeatureGallery />
          <FeatureBreadcrumbs feature={mapCtx.features[featureId]} />
          <FeatureTitle feature={mapCtx.features[featureId]} />
          <FeatureDescription feature={mapCtx.features[featureId]} />
          <Spacer />
          <FeaturePortalSection>
            {#snippet left()}
              <FeatureProperties feature={mapCtx.features[featureId]} />
            {/snippet}
            {#snippet right()}
              <FeaturePortal feature={mapCtx.features[featureId]} />
            {/snippet}
          </FeaturePortalSection>
          <Spacer />
        </Container>
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
