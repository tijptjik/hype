<script lang="ts">
import { NEW_TITLE, NEW_REF } from '$lib';
// I18N
import { m } from '$lib/i18n';
// FLASH
import { getFlash } from 'sveltekit-flash-message';
import { page } from '$app/stores';
// CONTEXT
import { setForm } from '$lib/context/forms.svelte';
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// PROVIDERS
import ImageProvider from '$lib/components/providers/ImageProvider.svelte';
// COMPONENTS
import Header from '$lib/components/layout/EntityHeader.svelte';
import I18nSection from '$lib/components/forms/sections/I18n.svelte';
import PropertySection from '$lib/components/forms/sections/FeatureProperty.svelte';
import MapSection from '$lib/components/forms/sections/Map.svelte';
import UserAttributionCard from '$lib/components/user/UserAttributionCard.svelte';
import AddressSection from '$lib/components/forms/sections/Address.svelte';
import AddressComponentSection from '$lib/components/forms/sections/AddressComponent.svelte';
import GallerySection from '$lib/components/forms/sections/Gallery.svelte';
import ViewerSection from '$lib/components/forms/sections/Viewer.svelte';
import CanonicalImage from '$lib/components/forms/sections/CanonicalImage.svelte';
// ENUMS
import { HierarchicalResource } from '$lib/types';
// TYPES
import type {
  Feature,
  FormPageProps,
  FormField,
  FormFieldArray,
  FormFieldNested,
  FormFieldConfig,
  ImageEditRefs,
  OrganisationDB,
  ProjectDB,
  Resource
} from '$lib/types';
// CONTEXT
const resourceState = getHierarchicalResourceState();

// CONFIG
const RESOURCE = HierarchicalResource.feature;
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
  },
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
    }
  },
  address: {
    displayAddress: {
      label: 'Display Address',
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
  }
};

// STATE : PROPS
let pageProps: FormPageProps<Feature> = $props();
resourceState.setEntity(pageProps.data.entity, RESOURCE);
resourceState.setFacet('core');

// STATE : FORM
let form = setForm<Feature>(
  RESOURCE,
  pageProps.data.entity,
  pageProps.data.validatedForm,
  getHierarchicalResourceState(),
  getFlash(page, { clearOnNavigate: false, clearAfterMs: 2500 })
);
let enhance = $derived(form.enhance);

// STATE : DERIVED :: TITLE
let title = $derived(pageProps.data.validatedForm.data.title || NEW_TITLE);

// STATE : DERIVED :: FULLSCREEN
let isMapFullscreen = $state(false);

function handleMapFullscreenChange(isFullscreen: boolean) {
  isMapFullscreen = isFullscreen;
}
</script>

<ImageProvider
  mode="gallery"
  isAdminMode={true}
  refType="feature"
  refId={pageProps.data.entity}
  refOrganisation={resourceState.getAscendantOrSelf(
    pageProps.data.validatedForm.data as unknown as Resource,
    HierarchicalResource.feature,
    HierarchicalResource.organisation
  ) as OrganisationDB}
  refProject={resourceState.getAscendantOrSelf(
    pageProps.data.validatedForm.data as unknown as Resource,
    HierarchicalResource.feature,
    HierarchicalResource.project
  ) as ProjectDB}>
  <!-- LAYOUT -->
  <div class="h-full overflow-hidden bg-black">
    <Header {title} {form} />
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
            <MapSection {form} toggleFullscreen={handleMapFullscreenChange} />
            <div
              class="absolute bottom-2 left-0 right-0 hidden items-center justify-center gap-6 p-4 @md:flex">
              <UserAttributionCard
                userId={pageProps.data.validatedForm.data.contributorId || null}
                date={pageProps.data.validatedForm.data.createdAt || null}
                type="contributor" />
              <UserAttributionCard
                userId={pageProps.data.validatedForm.data.publisherId || null}
                date={pageProps.data.validatedForm.data.publishedAt || null}
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
                    fields={FIELDS.property as FormFieldArray} />
                  <PropertySection
                    {form}
                    title={m.admin__forms_common_specifiers()}
                    subtitle={m.admin__forms_common_specifiers_subtitle()}
                    fieldDiscriminator="specifier"
                    fields={FIELDS.property as FormFieldArray} />
                  {#if pageProps.data.entity !== NEW_REF}
                    <CanonicalImage {form} />
                  {/if}
                </div>
                <I18nSection
                  {form}
                  title={m.admin__forms_common_descriptors()}
                  fields={FIELDS.i18n as FormField} />
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
                <ViewerSection {form} title={m.admin__forms_feature_viewer_title()} />
                <GallerySection {form} title={m.admin__forms_feature_gallery_title()} />
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
