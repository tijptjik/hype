<script lang="ts">
import { get } from 'svelte/store';
import { goto } from '$app/navigation';
import { NEW_TITLE, NEW_REF } from '$lib';
// Context
import { getRouterState } from '$lib/context/router.svelte';
import { setForm, getForm } from '$lib/context/forms.svelte';
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// Components
import Header from '$lib/components/layout/EntityHeader.svelte';
import I18nSection from '$lib/components/forms/sections/I18n.svelte';
import PropertySection from '$lib/components/forms/sections/FeatureProperty.svelte';
import ImageSection from '$lib/components/forms/sections/Image.svelte';
import MapSection from '$lib/components/forms/sections/Map.svelte';
import UserAttributionCard from '$lib/components/user/UserAttributionCard.svelte';
import AddressSection from '$lib/components/forms/sections/Address.svelte';
import AddressComponentSection from '$lib/components/forms/sections/AddressComponent.svelte';
import GallerySection from '$lib/components/forms/sections/Gallery.svelte';
// TYPES
import type {
  Feature,
  PageProps,
  FormField,
  FormFieldArray,
  FormFieldNested,
  EntityRouter,
  FormFieldConfig
} from '$lib/types';

// CONFIG
const RESOURCE = 'feature';
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
let pageProps: PageProps<Feature> = $props();
let { validatedForm, entity } = pageProps.data;

// STATE : CONTEXT :: ROUTER
const routerState = getRouterState() as EntityRouter;

// STATE : CONTEXT :: RESOURCES
const resourceState = getHierarchicalResourceState();

// STATE : FORM
let form = $state(setForm<Feature>(RESOURCE, entity, validatedForm));
let enhance = $derived(form.enhance);
let isNew = $state(entity === NEW_REF);

$effect(() => {
  if (isNew && title !== NEW_TITLE) {
    form = setForm<Feature>(RESOURCE, routerState.entity, pageProps.data.validatedForm);
    entity = routerState.entity;
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
  resourceState.update('feature', pageProps.data.validatedForm.data);
});

// SYNC :: Remove parentRef from URL if it exists
$effect(() => {
  const url = new URL(window.location.href);
  url.searchParams.delete('parentRef');
  goto(url.toString(), { replaceState: true });
});

// SYNC :: Await immediately resolved promise to react to value change.
const forceUpdate = async (_) => {};
let doRerender = $state(0);
</script>

{#await forceUpdate(doRerender) then _}
  <!-- LAYOUT -->
  <div class="h-full overflow-y-auto bg-black pb-16">
    <Header {title} {form} />
    <form method="POST" use:enhance role="form" data-testid="featureForm">
      <main class="flex h-full flex-1 flex-row gap-6 bg-black p-6 pb-0 pr-3">
        <div class="relative z-10 h-full flex-1 basis-1/3 @container">
          <MapSection {form} />
          <div
            class="absolute bottom-2 left-0 right-0 hidden items-center justify-center gap-6 p-4 @md:flex">
            <UserAttributionCard
              userId={get(form.form).contributorId ?? ''}
              date={get(form.form).createdAt ?? ''}
              type="contributor" />
            {#if get(form.form).publisherId && get(form.form).publishedAt}
              <UserAttributionCard
                userId={get(form.form).publisherId ?? ''}
                date={get(form.form).publishedAt ?? ''}
                type="publisher" />
            {/if}
          </div>
        </div>
        <div class="h-auto basis-2/3 scroll-m-10 scroll-p-12 overflow-y-scroll">
          <div class="flex flex-col-reverse justify-end gap-6 pb-12 pr-3">
            {#if routerState.facet === 'core'}
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
              </div>
              <I18nSection
                {form}
                title="Descriptors"
                fields={FIELDS.i18n as FormField} />
              <!-- TODO Add support for translatable specifiers -->
            {:else if routerState.facet === 'address'}
              <AddressComponentSection
                {form}
                title="Address Components"
                fields={FIELDS.address as FormField & FormFieldNested} />
              <AddressSection
                {form}
                title="Addressing"
                subtitle="feature is listed under this address in the app"
                fields={FIELDS.address as FormField & FormFieldNested} />
            {:else if routerState.facet === 'images'}
              <GallerySection {form} title="Gallery" />
            {/if}
          </div>
        </div>
      </main>
    </form>
  </div>
{/await}
