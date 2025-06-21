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
import type { Feature, Image } from '$lib/types';

// PARAMS
let featureId: string = $state(page.params.id);

// CONTEXT
const appCtx = getAppCtx();

// Use state instead of async derived to prevent component destruction
let feature_: Feature | undefined = $state()!;

// Load feature in effect to avoid component hierarchy destruction
$effect(() => {
  if (!page.params.id) {
    return;
  }

  const loadFeatureAndSetContext = async () => {
    try {
      // 1. First, load the fresh feature data
      const loadedFeature = await appCtx.getFeatureById(page.params.id);
      // 2. Update the feature state
      feature_ = loadedFeature!;
      // 3. THEN set the featureId (which triggers ImageProvider update)
      featureId = page.params.id;
      // Only react to activeCollection changes after feature is loaded
      if (appCtx.getActiveCollection() == null) {
        const isClosing = untrack(() => omniCtx.isIntentionallyClosing);
        if (!isClosing) {
          void handleFeatureSelection();
        }
      }
    } catch (error) {
      console.error('Error loading feature:', error);
    }
  };

  loadFeatureAndSetContext();
});

const omniCtx = getOmniContext();

// CONTEXT :: FEATURE CARD
setFeatureCardContext();
const cardCtx = getFeatureCardContext();

omniCtx.setFeatureCardContext(cardCtx);

// STATE
let mode = $derived(cardCtx.state.mode);

// Helper function to handle async operations
async function handleFeatureSelection() {
  if (featureId) {
    await omniCtx.handleFeatureSelection(appCtx, featureId);
  }
}
</script>

{#if appCtx}
  <FeatureCard>
    {#if feature_}
    {@const feature = feature_ as Feature}

    <ImageProvider
      isAdminMode={false}
      image={feature.image}
      images={feature.images}
      context={{
        ctxType: ImageContextResource.feature,
        ctxId: featureId,
        ...appCtx.getHierarchySync(feature_)
      }}>
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
        <FeatureGallery />
        <MissingReportReason />
      {:else if mode === FeatureCardMode.AddPhoto}
        <FeatureGallery />
        <PhotoCredit />
      {/if}
      <FeatureActions {feature} />
    </ImageProvider>
    {/if}
  </FeatureCard>
{:else}
  <div class="absolute inset-0 flex items-center justify-center rounded-lg bg-base-300">
    <div class="loading loading-ring loading-lg text-primary"></div>
  </div>
{/if}
