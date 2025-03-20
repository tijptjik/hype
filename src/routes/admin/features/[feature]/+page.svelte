<script lang="ts">
import { NEW_TITLE, NEW_REF } from '$lib';
// FLASH
import { getFlash } from 'sveltekit-flash-message';
import { page } from '$app/stores';
// CONTEXT
import { setForm } from '$lib/context/forms.svelte';
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
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
  ImageEditRefs
} from '$lib/types';
// CONTEXT
const resourceState = getHierarchicalResourceState();

// CONFIG
const RESOURCE = HierarchicalResource.feature;
const FIELDS: FormFieldConfig = {
  i18n: {
    title: {
      label: 'Title',
      component: 'InputField',
      isArray: false,
      isNested: false,
      isTranslated: true
    },
    description: {
      label: 'Description',
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
      label: 'Address Components',
      component: 'DisplayField',
      isArray: false,
      isNested: true,
      isTranslated: true,
      coreValues: [
        'formattedAddress',
        'plusCode',
        'subPremise',
        'premise',
        'streetNumber',
        'route',
        'intersection',
        'neighbourhood',
        'administrativeAreaLevel1',
        'country',
        'googlePlaceId',
        'distanceFromPoint',
        'addressGeocoder',
        'addressReverseGen',
        'addressForwardGen'
      ],
      translatedValues: [
        'formattedAddress',
        'subPremise',
        'premise',
        'streetNumber',
        'route',
        'intersection',
        'neighbourhood',
        'administrativeAreaLevel1',
        'country',
        'addressGeocoder',
        'addressReverseGen',
        'addressForwardGen'
      ]
    }
  }
};

// STATE : PROPS
let pageProps: FormPageProps<Feature> = $props();

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

let refs: ImageEditRefs = $derived({
  refType: RESOURCE,
  refId: pageProps.data.entity
});
</script>

<!-- LAYOUT -->
<div class="h-full overflow-hidden bg-black">
  <Header {title} {form} />
  {#if pageProps.data.validatedForm.data}
    <form
      method="POST"
      use:enhance
      role="form"
      data-testid="featureForm"
      class="h-full">
      <main
        class="flex flex-1 flex-row gap-6 overflow-hidden bg-black p-6 pr-3"
        style="height: calc(100vh - 148px) !important;">
        <div class="relative z-10 h-full flex-1 basis-1/3 overflow-hidden @container">
          <MapSection {form} />
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
        <div class="h-auto basis-2/3 scroll-m-10 scroll-p-12 overflow-y-scroll">
          <div class="flex h-full flex-col-reverse justify-end gap-6 pr-3">
            {#if resourceState.activeFacet === 'core' || resourceState.activeFacet === false}
              <div class="flex flex-row gap-6">
                <PropertySection
                  {form}
                  title="Classifiers"
                  subtitle="by which features can be filtered"
                  fieldDiscriminator="classifier"
                  fields={FIELDS.property as FormFieldArray} />
                <PropertySection
                  {form}
                  title="Specifiers"
                  subtitle="which are displayed in feature info panels"
                  fieldDiscriminator="specifier"
                  fields={FIELDS.property as FormFieldArray} />
                {#if pageProps.data.entity !== NEW_REF}
                <CanonicalImage {form} />
                {/if}
              </div>
              <I18nSection
                {form}
                title="Descriptors"
                fields={FIELDS.i18n as FormField} />
              <!-- TODO Add support for translatable specifiers -->
            {:else if resourceState.activeFacet === 'address'}
              <AddressComponentSection
                {form}
                title="Address Components"
                fields={FIELDS.address as FormField & FormFieldNested} />
              <AddressSection
                {form}
                title="Addressing"
                subtitle="feature is listed under this address in the app"
                fields={FIELDS.address as FormField & FormFieldNested} />
            {:else if resourceState.activeFacet === 'images' && pageProps.data.entity !== NEW_REF}
              <ViewerSection {form} {refs} title="Viewer" />
              <GallerySection {form} title="Gallery" />
            {/if}
          </div>
        </div>
      </main>
    </form>
  {/if}
</div>
