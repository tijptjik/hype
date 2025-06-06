<script lang="ts">
// SVELTE
import { onMount } from 'svelte';
// CONSTANTS
import { NEW_REF } from '$lib';
// PROVIDERS
import ImageProvider from '$lib/components/providers/ImageProvider.svelte';
// Components
import FeatureCard from '$lib/components/featureCard/Root.svelte';
import FeatureGallery from '$lib/components/featureCard/FeatureGallery.svelte';
import FeatureBreadcrumbs from '$lib/components/featureCard/FeatureBreadcrumbs.svelte';
import FeatureTitle from '$lib/components/featureCard/FeatureTitle.svelte';
import FeatureDescriptionEditable from '$lib/components/featureCard/FeatureDescriptionEditable.svelte';
import FeaturePropertiesEditable from '$lib/components/featureCard/FeaturePropertiesEditable.svelte';
import FeatureGeoLocation from '$lib/components/featureCard/FeatureGeoLocation.svelte';
import FeatureActions from '$lib/components/featureCard/FeatureActions.svelte';
import Spacer from '$lib/components/featureCard/layout/Spacer.svelte';
import Container from '$lib/components/featureCard/layout/Container.svelte';
import ContributorCredit from '$lib/components/featureCard/ContributorCredit.svelte';
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
import type {
  NewFeatureWithLocationAndParents,
  UserContributedFeature
} from '$lib/types';

// CONTEXT
const mapCtx = getMapCtx();
const omniCtx = getOmniContext();

// CONTEXT :: FEATURE CARD
setFeatureCardContext();
const cardCtx = getFeatureCardContext();
cardCtx.setMode(FeatureCardMode.New);
omniCtx.setFeatureCardContext(cardCtx);

// STATE
let isOpen = $state(false);
// STATE : DERIVED
let newFeature = $derived(mapCtx.getNewFeature()) as NewFeatureWithLocationAndParents;
let feature = $derived(mapCtx.getNewFeature()?.feature as UserContributedFeature);
let organisation = $derived(mapCtx.getOrganisationById(newFeature?.organisationId!));
let project = $derived(mapCtx.getProjectById(newFeature?.projectId!));

// EVENT HANDLERS
function handleShowModal() {
  omniCtx.openCard();
  isOpen = true;
}
function handleCloseModal() {
  console.log('🔴 NewFeatureCard handleCloseModal() called');
  omniCtx.closeCard();
  isOpen = false;
  console.log('🔴 NewFeatureCard isOpen set to false');
}

onMount(() => {
  window.addEventListener('showNewFeatureCard', handleShowModal);
  window.addEventListener('closeNewFeatureCard', handleCloseModal);
  return () => {
    window.removeEventListener('showNewFeatureCard', handleShowModal);
    window.removeEventListener('closeNewFeatureCard', handleCloseModal);
  };
});
</script>

{#if isOpen && newFeature && feature}
  <FeatureCard>
    <ImageProvider
      mode="gallery"
      isAdminMode={false}
      ctxType={ImageContextResource.feature}
      ctxId={NEW_REF}
      {organisation}
      {project}>
      <Container>
        <FeatureGallery />
        <FeatureBreadcrumbs {feature} />
        <FeatureTitle {feature} />
        <FeatureGeoLocation {feature} />
        <FeatureDescriptionEditable {feature} />
        <FeaturePropertiesEditable {feature} />
        <ContributorCredit />
      </Container>
      <FeatureActions {feature} />
    </ImageProvider>
  </FeatureCard>
{/if}
