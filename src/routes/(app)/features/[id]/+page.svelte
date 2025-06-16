<script lang="ts">
// Svelte
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
import { getAppCtx } from '$lib/context/app.svelte';
import { getOmniContext } from '$lib/context/omni.svelte';
import {
  setFeatureCardContext,
  getFeatureCardContext
} from '$lib/context/featureCard.svelte';
// ENUMS
import { FeatureCardMode, ImageContextResource } from '$lib/enums';
// TYPES

// PARAMS
let featureId: string = $state(page.params.id);

// CONTEXT
const appCtx = getAppCtx();
// @ts-expect-error - TODO Svelte Async 
let feature = $derived(await appCtx.getFeatureById(page.params.id));
const omniCtx = getOmniContext();

// CONTEXT :: FEATURE CARD
setFeatureCardContext();
const cardCtx = getFeatureCardContext();

omniCtx.setFeatureCardContext(cardCtx);

// STATE
let mode = $derived(cardCtx.state.mode);

// EFFECTS
$effect(() => {
  if (!appCtx.isInitialised || !page.params.id) {
    return;
  }
  featureId = page.params.id;

  // Only react to activeCollection changes, not flag changes
  if (appCtx.getActiveCollection() == null) {
    // Check the flag without making the effect reactive to it
    const isClosing = untrack(() => omniCtx.isIntentionallyClosing);

    if (!isClosing) {
      void handleFeatureSelection();
    }
  }
});

// Helper function to handle async operations
async function handleFeatureSelection() {
  if (featureId) {
    await omniCtx.handleFeatureSelection(appCtx, featureId);
  }
}
</script>

{#if appCtx && feature}
  {#await appCtx.getHierarchy(feature) then { organisation, project }}
    <FeatureCard>
      {#if appCtx.isInitialised}
        <ImageProvider
          mode="gallery"
          isAdminMode={false}
          ctxType={ImageContextResource.feature}
          ctxId={featureId}
          {organisation}
          {project}>
          {#if mode === FeatureCardMode.Display}
            <Container>
              <FeatureGallery />
              <FeatureBreadcrumbs {feature} />
              <FeatureTitle {feature} />
              <FeatureDescription {feature} />
              <Spacer />
              <FeaturePortalSection>
                {#snippet left()}
                  <FeatureProperties {feature} />
                {/snippet}
                {#snippet right()}
                  <FeaturePortal {feature} />
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
          <FeatureActions {feature} />
        </ImageProvider>
      {/if}
    </FeatureCard>
  {/await}
{:else}
  <div class="absolute inset-0 flex items-center justify-center rounded-lg bg-base-300">
    <div class="loading loading-spinner loading-lg text-primary"></div>
  </div>
{/if}
