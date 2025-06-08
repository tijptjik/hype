<script lang="ts">
// SVELTE
import { watch } from 'runed';
// LIB
import { NEW_TITLE, NEW_REF } from '$lib';
// I18N
import { getLocale } from '$lib/i18n';
import { m } from '$lib/i18n';
// FLASH
import { getFlash } from 'sveltekit-flash-message';
import { page } from '$app/state';
// CONTEXT
import { setForm } from '$lib/context/form.svelte';
import { getHierarchicalResourceState } from '$lib/context/resource.svelte';
// PROVIDERS
import ImageProvider from '$lib/components/providers/ImageProvider.svelte';
// COMPONENTS
import Header from '$lib/components/layout/EntityHeader.svelte';
import HeaderButton from '$lib/components/layout/HeaderButton.svelte';
import EntityActions from '$lib/components/menu/EntityActions.svelte';
import I18nSection from '$lib/components/forms/sections/I18n.svelte';
import FeatureActions from '$lib/components/forms/actions/Feature.svelte';
import InfoContent from '$lib/components/forms/info/FeatureCore.svelte';
import PropertySection from '$lib/components/forms/sections/FeatureProperty.svelte';
import MapSection from '$lib/components/forms/sections/Map.svelte';
import UserAttributionCard from '$lib/components/user/UserAttributionCard.svelte';
import AddressSection from '$lib/components/forms/sections/Address.svelte';
import AddressComponentSection from '$lib/components/forms/sections/AddressComponent.svelte';
import GallerySection from '$lib/components/forms/sections/Gallery.svelte';
import ViewerSection from '$lib/components/forms/sections/Viewer.svelte';
import CanonicalImage from '$lib/components/forms/sections/CanonicalImage.svelte';
// ENUMS
import {
  FirstClassResource,
  HierarchicalResource,
  ImageContextResource
} from '$lib/enums';
// TYPES
import type {
  Feature,
  FormPageProps,
  FormField,
  FormFieldArray,
  FormFieldArrayDefinition,
  FormFieldNested,
  FormFieldConfig,
  OrganisationDB,
  ProjectDB,
  Resource
} from '$lib/types';
// CONTEXT
const resourceState = getHierarchicalResourceState();

// CONFIG
const FIELDS: FormFieldConfig = {
  i18n: {
    title: {
      label: m.admin__forms_feature_title(),
      component: 'InputField',
      isArray: false,
      isNested: false,
      isTranslated: true
    },
    description: {
      label: m.admin__forms_common_description(),
      component: 'TextareaField',
      isArray: false,
      isNested: false,
      isTranslated: true
    }
  } as FormField,
  property: {
    properties: {
      isArray: true,
      discriminators: {
        key: 'type',
        values: ['classifier', 'specifier'],
        specs: {
          classifier: {},
          specifier: {}
        }
      }
    } as FormFieldArrayDefinition
  } as FormFieldArray,
  address: {
    displayAddress: {
      label: m.giant_deft_kangaroo_feel(),
      placeholder: 'As shown to users',
      component: 'TextareaField',
      isArray: false,
      isNested: false,
      isTranslated: true
    },
    addressProperties: {
      label: m.admin__forms_feature_address_components_title(),
      component: 'DisplayField',
      isArray: false,
      isNested: true,
      isTranslated: true
    },
    addressMeta: {
      label: m.admin__forms_feature_addressing_title(),
      component: 'DisplayField',
      isArray: false,
      isNested: true,
      isTranslated: false
    }
  } as FormFieldNested
};

// STATE : PROPS
let pageProps: FormPageProps<Feature> = $props();
resourceState.setEntity(pageProps.data.entity, FirstClassResource.feature);
resourceState.setFacet('core');

// STATE : FORM
let form = setForm(
  FirstClassResource.feature,
  pageProps.data.entity,
  pageProps.data.validatedForm,
  getHierarchicalResourceState(),
  getFlash(page, { clearOnNavigate: false, clearAfterMs: 2500 })
);

// REACTIVE: Update form when pageProps change (for reset functionality)
watch(
  () => pageProps.data.validatedForm.data,
  (newData) => {form.form.set(newData as unknown as Feature)},
  {
    lazy: true
  }
);

// STATE : DERIVED
let enhance = $derived(form.enhance);
let isMapFullscreen = $state(false);
let title = $derived(
  pageProps.data.validatedForm?.data?.i18n?.[getLocale()]?.title || NEW_TITLE
);

// UTILS
function handleMapFullscreenChange(isFullscreen: boolean): void {
  isMapFullscreen = isFullscreen;
}
</script>

{#snippet featureInfoSnippet()}
  <InfoContent />
{/snippet}

{#snippet featureActionSnippet()}
  <FeatureActions {form} />
{/snippet}

<ImageProvider
  mode="gallery"
  isAdminMode={true}
  ctxType={ImageContextResource.feature}
  ctxId={pageProps.data.entity}
  organisation={resourceState.getAscendantOrSelf(
    pageProps.data.validatedForm.data as unknown as Resource,
    HierarchicalResource.feature,
    HierarchicalResource.organisation
  ) as Omit<OrganisationDB, 'isCoreInclusive'>}
  project={resourceState.getAscendantOrSelf(
    pageProps.data.validatedForm.data as unknown as Resource,
    HierarchicalResource.feature,
    HierarchicalResource.project
  ) as ProjectDB}>
  <!-- LAYOUT -->
  <div class="h-full overflow-hidden bg-black">
    <Header {title}>
      {#snippet menuItems()}
        <HeaderButton
          facet={{ label: m.feature__core(), ref: 'core' }}
          isActive={resourceState.activeFacet === 'core' ||
            resourceState.activeFacet === false} />
        <HeaderButton
          facet={{ label: m.feature__address(), ref: 'address' }}
          isActive={resourceState.activeFacet === 'address'} />
        {#if resourceState.activeEntity !== 'new'}
          <HeaderButton
            facet={{ label: m.feature__images(), ref: 'images' }}
            isActive={resourceState.activeFacet === 'images'} />
        {/if}
      {/snippet}

      {#snippet actions()}
        <EntityActions {form} />
      {/snippet}
    </Header>
    {#if pageProps.data.validatedForm.data}
      <form
        id="featureForm"
        method="POST"
        use:enhance
        role="form"
        data-testid="featureForm"
        class="h-full">
        <main
          class="flex flex-1 flex-row gap-6 overflow-hidden bg-black p-6 pr-3"
          style="height: calc(100vh - 148px) !important;">
          <div
            class="map-container relative h-full flex-1 overflow-hidden @container"
            class:fullscreen={isMapFullscreen}>
            <MapSection
              {form}
              fields={FIELDS.map}
              toggleFullscreen={handleMapFullscreenChange} />
            <div
              class="absolute bottom-2 left-0 right-0 hidden items-center justify-center gap-6 p-4 @md:flex">
              <UserAttributionCard
                userId={pageProps.data.validatedForm.data.contributorId}
                date={pageProps.data.validatedForm.data.createdAt ?? undefined}
                type="contributor" />
              <UserAttributionCard
                userId={pageProps.data.validatedForm.data.publisherId}
                date={pageProps.data.validatedForm.data.publishedAt ?? undefined}
                type="publisher" />
            </div>
          </div>
          <div
            class="content-container h-auto scroll-m-10 scroll-p-12 overflow-y-auto"
            class:shrink={isMapFullscreen}>
            <div class="flex h-full flex-col-reverse justify-end gap-6 pr-3">
              {#if resourceState.activeFacet === 'core' || resourceState.activeFacet === false}
                <div class="flex flex-wrap justify-between gap-6">
                  <PropertySection
                    {form}
                    title={m.admin__forms_common_classifiers()}
                    subtitle={m.admin__forms_common_classifiers_subtitle()}
                    fieldDiscriminator="classifier"
                    fields={FIELDS.property as FormFieldArray}
                    cols={pageProps.data.entity == NEW_REF ? 2 : 3} />
                  <PropertySection
                    {form}
                    title={m.admin__forms_common_specifiers()}
                    subtitle={m.admin__forms_common_specifiers_subtitle()}
                    fieldDiscriminator="specifier"
                    fields={FIELDS.property as FormFieldArray}
                    cols={pageProps.data.entity == NEW_REF ? 2 : 3} />
                  {#if pageProps.data.entity !== NEW_REF}
                    <CanonicalImage {form} />
                  {/if}
                </div>
                <I18nSection
                  {form}
                  title={m.admin__forms_common_descriptors()}
                  fields={FIELDS.i18n as FormField}
                  headerActions={featureActionSnippet}
                  infoContent={featureInfoSnippet} />
                <!-- TODO Add support for translatable specifiers -->
              {:else if resourceState.activeFacet === 'address'}
                <AddressComponentSection
                  {form}
                  title={m.admin__forms_feature_address_components_title()}
                  fields={FIELDS.address as FormField & FormFieldNested} />
                <AddressSection
                  {form}
                  title={m.admin__forms_feature_addressing_title()}
                  subtitle={m.admin__forms_feature_addressing_subtitle()}
                  fields={FIELDS.address as FormField & FormFieldNested} />
              {:else if resourceState.activeFacet === 'images' && pageProps.data.entity !== NEW_REF}
                <ViewerSection
                  {form}
                  title={m.admin__forms_feature_viewer_title()}
                  fields={FIELDS.viewer as FormFieldNested} />
                <GallerySection
                  {form}
                  title={m.admin__forms_feature_gallery_title()}
                  fields={FIELDS.gallery as FormFieldNested} />
              {/if}
            </div>
          </div>
        </main>
      </form>
    {/if}
  </div>
</ImageProvider>

<style>
.map-container {
  flex-basis: 33% !important;
  transition: flex-basis 0.3s ease-in-out !important;
}
.map-container.fullscreen {
  flex-basis: 100% !important;
}

.content-container {
  flex-basis: 66% !important;
  transition:
    flex-basis 0.3s ease-in-out,
    opacity 0.2s ease-in-out;
  opacity: 1 !important;
}

.content-container.shrink {
  flex-basis: 0% !important;
  overflow: hidden;
  opacity: 0 !important;
  overflow: hidden !important;
  width: 400px !important;
  height: 400px !important;
}
</style>
