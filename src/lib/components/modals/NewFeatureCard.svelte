<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
import { page } from '$app/state'
// CONSTANTS
import { NEW_REF } from '$lib'
// ADAPTERS
import { useImageProviderModel } from '$lib/adapters/image'
// BITS
import {
  FeatureCardActions,
  FeatureCardBreadcrumbs,
  FeatureCardContainer,
  FeatureCardRoot,
  FeatureCardTitle,
} from '$lib/bits'
// PROVIDERS
import ImageProvider from '$lib/providers/ImageProvider.svelte'
// Components
import NewFeatureInfoBar from '$lib/components/featureCard/NewFeatureInfoBar.svelte'
import FeatureDescriptionEditable from '$lib/components/featureCard/FeatureDescriptionEditable.svelte'
import FeaturePropertiesEditable from '$lib/components/featureCard/FeaturePropertiesEditable.svelte'
import FeatureGeoLocation from '$lib/components/featureCard/FeatureGeoLocation.svelte'
import ContributorCredit from '$lib/components/featureCard/ContributorCredit.svelte'
import NewFeatureLabel from '$lib/components/featureCard/actions/labels/NewFeatureLabel.svelte'
import SubmitNewFeatureAction from '$lib/components/featureCard/actions/SubmitNewFeatureAction.svelte'
import ValidationError from '$lib/components/featureCard/ValidationError.svelte'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getOmniCtx } from '$lib/context/omni.svelte'
import { setCardCtx } from '$lib/context/card.svelte'
// ENUMS
import { FeatureCardMode, ImageContextResource, NewFeatureMode } from '$lib/enums'
// TYPES
import type { OrganisationDB } from '$lib/db/zod/schema/organisation.types'
import type { ProjectDB } from '$lib/db/zod/schema/project.types'
import type {
  Feature,
  NewFeatureWithLocationAndParents,
} from '$lib/db/zod/schema/feature.types'

// CONTEXT
const appCtx = getAppCtx()
const omniCtx = getOmniCtx()

// CONTEXT :: FEATURE CARD
const cardCtx = setCardCtx()

// STATE : DERIVED
let newFeature: NewFeatureWithLocationAndParents = $state()!
let feature: Feature = $state()!
let organisation = $state()!
let project = $state()!

// ELEMENTS
let viewport: HTMLElement = $state()!

// EVENT HANDLERS
function handleShowModal() {
  cardCtx.setMode(FeatureCardMode.New)
  omniCtx.setCardCtx(cardCtx)
  omniCtx.openCard()
  newFeature = appCtx.getNewFeature() as NewFeatureWithLocationAndParents
  feature = newFeature.feature as Feature
  const hierarchy = appCtx.getHierarchySync(feature)
  organisation = hierarchy.organisation!
  project = hierarchy.project!
}
function handleCloseModal() {
  omniCtx.closeCard()
}
$effect(() => {
  if (appCtx.newFeatureMode === NewFeatureMode.card) {
    handleShowModal()
  } else {
    handleCloseModal()
  }
})

const imageProviderModel = useImageProviderModel(
  () => page,
  () => ({
    isAdminMode: false,
    context: {
      ctxType: ImageContextResource.feature,
      ctxId: NEW_REF,
      organisation: organisation as Omit<OrganisationDB, 'isCoreInclusive'>,
      project: project as Omit<ProjectDB, 'isCoreInclusive'>,
    },
  }),
)
</script>

{#if appCtx.newFeatureMode === NewFeatureMode.card && newFeature && feature}
  <FeatureCardRoot>
    <ImageProvider model={imageProviderModel}>
      <FeatureCardContainer bind:viewport scrollable={true}>
        <NewFeatureInfoBar {viewport} />
        <FeatureCardBreadcrumbs {feature} />
        <FeatureCardTitle {feature} />
        <FeatureGeoLocation {feature} />
        <FeatureDescriptionEditable {feature} />
        <FeaturePropertiesEditable {feature} />
        <ContributorCredit />
      </FeatureCardContainer>
      <ValidationError />
      <FeatureCardActions>
        {#snippet leftActions()}
          <NewFeatureLabel />
        {/snippet}
        {#snippet rightActions()}
          <SubmitNewFeatureAction />
        {/snippet}
      </FeatureCardActions>
    </ImageProvider>
  </FeatureCardRoot>
{/if}
