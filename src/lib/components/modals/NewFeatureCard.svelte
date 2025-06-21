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
import Container from '$lib/components/featureCard/layout/Container.svelte';
import ContributorCredit from '$lib/components/featureCard/ContributorCredit.svelte';
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
import type {
  NewFeatureWithLocationAndParents,
  OrganisationDB,
  ProjectDB,
  Feature
} from '$lib/types';

// CONTEXT
const appCtx = getAppCtx();
const omniCtx = getOmniContext();

// CONTEXT :: FEATURE CARD
setFeatureCardContext();
const cardCtx = getFeatureCardContext();
cardCtx.setMode(FeatureCardMode.New);
omniCtx.setFeatureCardContext(cardCtx);

// STATE
let isOpen = $state(false);
// STATE : DERIVED
let newFeature = $derived(appCtx.getNewFeature())! as NewFeatureWithLocationAndParents;
let feature = $derived(newFeature.feature as Feature)!;
let { organisation, project } = $derived(
  appCtx.getHierarchySync(feature)
);

// EVENT HANDLERS
function handleShowModal() {
  omniCtx.openCard();
  isOpen = true;
}
function handleCloseModal() {
  omniCtx.closeCard();
  isOpen = false;
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
      isAdminMode={false}
      context={{
        ctxType: ImageContextResource.feature,
        ctxId: NEW_REF,
        organisation: organisation as Omit<OrganisationDB, 'isCoreInclusive'>,
        project: project as Omit<ProjectDB, 'isCoreInclusive'>
      }}>
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
