<script lang="ts">
import { goto } from '$app/navigation';
import { i18n } from '$lib/i18n';
import { NEW_TITLE, NEW_REF } from '$lib';
// Context
import { setForm, getForm } from '$lib/context/forms.svelte';
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// Components
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
let { validatedForm, entity } = pageProps.data;

// STATE : CONTEXT :: RESOURCES
const resourceState = getHierarchicalResourceState();

// STATE : FORM
let form = $state(setForm<Feature>(RESOURCE, entity, validatedForm));
let enhance = $derived(form.enhance);
let isNew = $state(entity === NEW_REF);

$effect(() => {
  if (isNew && title !== NEW_TITLE) {
    form = setForm<Feature>(
      RESOURCE,
      resourceState.activeEntity as string,
      pageProps.data.validatedForm
    );
    entity = resourceState.activeEntity as string;
    isNew = false;
    doRerender++;
  } else {
    form = getForm<Feature>(RESOURCE, entity);
  }
});

// STATE : DERIVED :: TITLE
let title = $derived(pageProps.data.validatedForm.data.title || NEW_TITLE);

// SYNC :: Update resource state with current entity
$effect(() => {
  resourceState.setEntity(entity, RESOURCE);
});

// SYNC :: Remove parentRef from URL if it exists
$effect(() => {
  const url = new URL(window.location.href);
  url.searchParams.delete('parentRef');
  goto(i18n.resolveRoute(url.toString()), { replaceState: true });
});

let refs: ImageEditRefs = $derived({
  refType: RESOURCE,
  refId: entity
});

// SYNC :: Await immediately resolved promise to react to value change.
const forceUpdate = async (_) => {};
let doRerender = $state(0);
</script>

{#await forceUpdate(doRerender) then _}
  <!-- LAYOUT -->
  <div class="h-full overflow-hidden bg-black">
    <Header {title} {form} />
    <form
      method="POST"
      use:enhance
      role="form"
      data-testid="featureForm"
      class="h-full">
      <main
        class="flex h-[calc(100vh-148px)] flex-1 flex-row gap-6 overflow-hidden bg-black p-6 pr-3">
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
            {#if resourceState.activeFacet === 'core'}
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
                <CanonicalImage {form} />
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
            {:else if resourceState.activeFacet === 'images' && !isNew}
              <ViewerSection {form} {refs} title="Viewer" />
              <GallerySection {form} title="Gallery" />
            {/if}
          </div>
        </div>
      </main>
    </form>
  </div>
{/await}
