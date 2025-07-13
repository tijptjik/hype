<script lang="ts">
// SVELTE
import { watch } from 'runed';
import { fade } from 'svelte/transition';
import { untrack } from 'svelte';
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
import { getAdminCtx } from '$lib/context/admin.svelte';
// ICONS
import { MapPin as FeatureIcon } from '@steeze-ui/heroicons';
// PROVIDERS
import ImageProvider from '$lib/components/providers/ImageProvider.svelte';
// COMPONENTS
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
import Scrollbar from '$lib/components/common/scrollbars/Scrollbar.svelte';
// ENUMS
import { FirstClassResource, ImageContextResource } from '$lib/enums';
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
  Image
} from '$lib/types';

// CONTEXT
const adminCtx = getAdminCtx();

// ELEMENTS
let vietportElement: HTMLDivElement | undefined = $state();
let contentsElement: HTMLFormElement | undefined = $state();

// CONFIG
const FIELDS: FormFieldConfig = {
  i18n: {
    title: {
      label: m.feature__title(),
      component: 'InputField',
      isArray: false,
      isNested: false,
      isTranslated: true
    },
    description: {
      label: m.feature__description(),
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

// Read facet from URL hash
const hashFacet = $derived(() => {
  if (typeof window !== 'undefined') {
    const hash = page.url.hash;
    return hash ? hash.substring(1) : null;
  }
  return null;
});

// Set facet from hash or default to 'core'
$effect(() => {
  const facet = hashFacet();
  if (facet && ['core', 'address', 'images'].includes(facet)) {
    adminCtx.setFacet(facet as any, pageProps.data.entity, FirstClassResource.feature);
  } else {
    adminCtx.setFacet('core', pageProps.data.entity, FirstClassResource.feature);
  }
});

// STATE : FORM
let form = setForm(
  FirstClassResource.feature,
  pageProps.data.entity,
  pageProps.data.validatedForm,
  getAdminCtx(),
  getFlash(page, { clearOnNavigate: false, clearAfterMs: 2500 })
);

// REACTIVE: Update form when pageProps change (for reset functionality)
watch(
  () => pageProps.data.validatedForm.data,
  (newData) => {
    form.form.set(newData as unknown as Feature);
  },
  {
    lazy: true
  }
);

// STATE : DERIVED
let enhance = $derived(form.enhance);
let isMapFullscreen = $state(false);
let isMapCollapsed = $state(
  adminCtx?.appCtx?.getUserPreferences
    ? (adminCtx.appCtx?.getUserPreferences()?.admin?.isAdminMapCollapsed ?? false)
    : false
);
let title = $derived(
  pageProps.data.validatedForm?.data?.i18n?.[getLocale()]?.title || NEW_TITLE
);
let image = $derived(pageProps.data.validatedForm.data.image);

// HEADER SETUP
$effect(() => {
  const facetTabs = new Map();
  facetTabs.set('core', m.resources__main());
  facetTabs.set('address', m.feature__address());
  if (adminCtx.activeResourceRef !== 'new') {
    facetTabs.set('images', m.feature__images());
  }

  untrack(() => adminCtx.setHeaderForEntity(title, FeatureIcon, facetTabs));

  // Set form context for header actions
  adminCtx.appCtx.setFormContext(form);
});

// Clean up form context when component unmounts
$effect(() => {
  return () => {
    adminCtx.appCtx.clearFormContext();
  };
});

// UTILS
function handleMapFullscreenChange(isFullscreen: boolean): void {
  isMapFullscreen = isFullscreen;
}

function handleMapCollapse(): void {
  isMapCollapsed = !isMapCollapsed;
}
</script>

{#snippet featureInfoSnippet()}
  <InfoContent />
{/snippet}

{#snippet featureActionSnippet()}
  <FeatureActions {form} />
{/snippet}

<!-- LAYOUT -->
<div class="relative h-full w-full overflow-hidden" bind:this={vietportElement}>
  {#if adminCtx.appCtx.isInitialised && pageProps.data.validatedForm}
    {#await adminCtx.appCtx.getHierarchy(pageProps.data.validatedForm.data as Feature) then { organisation, project }}
      <ImageProvider
        {page}
        isAdminMode={true}
        image={(pageProps.data.validatedForm.data as Feature).image as Image}
        images={(pageProps.data.validatedForm.data as Feature).images as Image[]}
        context={{
          ctxType: ImageContextResource.feature,
          ctxId: (pageProps.data.validatedForm.data as Feature).id,
          organisation: organisation as Omit<OrganisationDB, 'isCoreInclusive'>,
          project
        }}>
        <form
          id="featureForm"
          method="POST"
          use:enhance
          role="form"
          transition:fade
          data-testid="featureForm"
          class="mb-12 h-full overflow-y-auto">
          <main class="flex h-full min-h-0 flex-1 flex-row gap-6 overflow-visible pl-6">
            {#if adminCtx.activeFacet !== 'images'}
              <div
                class="relative h-full overflow-hidden rounded-lg pb-6 pt-6 transition-all duration-300 ease-in-out @container"
                class:flex-[0_0_3%]={isMapCollapsed}
                class:overflow-visible={isMapCollapsed}
                class:flex-[0_0_100%]={isMapFullscreen}
                class:flex-[0_0_33%]={!isMapFullscreen && !isMapCollapsed}>
                <MapSection
                  {form}
                  fields={FIELDS.map}
                  toggleFullscreen={handleMapFullscreenChange}
                  toggleCollapsed={handleMapCollapse} />
                <div
                  class="absolute bottom-6 left-0 right-0 hidden items-center justify-center gap-6 p-4 @md:flex">
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
            {/if}
            <div
              class="h-full overflow-y-auto pt-6 transition-all duration-300 ease-in-out"
              class:flex-[0_0_0%]={isMapFullscreen}
              class:overflow-hidden={isMapFullscreen}
              class:opacity-0={isMapFullscreen}
              class:w-[400px]={isMapFullscreen}
              class:h-[400px]={isMapFullscreen}
              class:flex-[0_0_100%]={adminCtx.activeFacet === 'images'}
              class:flex-[0_0_96%]={isMapCollapsed && adminCtx.activeFacet !== 'images'}
              class:flex-[0_0_66%]={!isMapFullscreen &&
                !isMapCollapsed &&
                adminCtx.activeFacet !== 'images'}
              class:opacity-100={!isMapFullscreen}
              bind:this={contentsElement}>
              <div
                class="pb-6 pr-6 {adminCtx.activeFacet === 'images' ? 'h-full' : ''}">
                <div
                  class="flex flex-col gap-6 {adminCtx.activeFacet === 'images'
                    ? 'h-full items-stretch'
                    : ''}">
                  {#if adminCtx.activeFacet === 'core' || adminCtx.activeFacet === false}
                    <I18nSection
                      {form}
                      title={m.admin__forms_common_descriptors()}
                      fields={FIELDS.i18n as FormField}
                      headerActions={featureActionSnippet}
                      infoContent={featureInfoSnippet} />
                    <!-- TODO Add support for translatable specifiers -->
                    <div class="flex flex-wrap items-start justify-between gap-6">
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
                        <CanonicalImage {form} {image} />
                      {/if}
                    </div>
                  {:else if adminCtx.activeFacet === 'address'}
                    <AddressSection
                      {form}
                      title={m.admin__forms_feature_addressing_title()}
                      subtitle={m.admin__forms_feature_addressing_subtitle()}
                      fields={FIELDS.address as FormField & FormFieldNested} />
                    <AddressComponentSection
                      {form}
                      title={m.admin__forms_feature_address_components_title()}
                      fields={FIELDS.address as FormField & FormFieldNested} />
                  {:else if adminCtx.activeFacet === 'images' && pageProps.data.entity !== NEW_REF}
                    <div
                      class="flex h-full min-h-0 w-full flex-row overflow-hidden pt-1">
                      <ViewerSection
                        {form}
                        title={m.admin__forms_feature_gallery_title()}
                        fields={FIELDS.viewer as FormFieldNested} />
                      <GallerySection
                        {form}
                        fields={FIELDS.gallery as FormFieldNested} />
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          </main>
        </form>
      </ImageProvider>
    {:catch error}
      <!-- Error state - show fallback -->
      <div class="flex items-center justify-center p-8">
        <div class="text-error">{m.blue_long_felix_bask()}</div>
      </div>
    {/await}
  {/if}
  {#if vietportElement && contentsElement}
    <Scrollbar
      viewport={vietportElement}
      contents={contentsElement}
      showThumbOnTrackEnter={true}
      margin={{
        top: 8,
        bottom: 0
      }}
      width={{
        track: 24,
        thumb: 8,
        thumbActive: 12
      }} />
  {/if}
</div>
