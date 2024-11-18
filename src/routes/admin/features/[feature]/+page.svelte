<script lang="ts">
// Context
import { getRouterState } from '$lib/context/router.svelte';
import { setForm } from '$lib/context/forms.svelte';
import { goto } from '$app/navigation';
// Components
import Header from '$lib/components/layout/EntityHeader.svelte';
import I18nSection from '$lib/components/forms/sections/I18n.svelte';
import PropertySection from '$lib/components/forms/sections/FeatureProperty.svelte';
import ImageSection from '$lib/components/forms/sections/Image.svelte';
import MapSection from '$lib/components/forms/sections/Map.svelte';
import UserAttributionCard from '$lib/components/user/UserAttributionCard.svelte';
import AddressSection from '$lib/components/forms/sections/Address.svelte';
// TYPES
import type { SuperForm } from 'sveltekit-superforms';
import type {
  FormFieldConfig,
  Feature,
  PageProps,
  ResourceRouter,
  FormField,
  FormFieldArray
} from '$lib/types';
// DEBUG
import SuperDebug from 'sveltekit-superforms';

// CONFIG
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
    formattedAddress: {
      label: 'Formatted Address',
      component: 'TextareaField',
      isArray: false,
      isNested: false,
      isTranslated: true
    }
  }
};

// STATE : PROPS
let { data }: PageProps<Feature> = $props();
let { validatedForm, entity } = data;

// STATE : DERIVED
const routerState = getRouterState() as ResourceRouter;
const title = $derived(data.validatedForm.data.title || 'New');

let navProps: NavProps = $derived({
  resource: routerState.resource,
  entity: data.entity,
  facet: routerState.facet || 'core'
});

console.log('navProps', navProps);

// STATE : FORM
let { enhance, form } = setForm<Feature>(routerState.resource, entity, validatedForm);

$effect(() => {
  //Remove parentRef from URL if it exists
  const url = new URL(window.location.href);
  url.searchParams.delete('parentRef');
  // shallow navigation
  goto(url.toString(), { replaceState: true });
});
</script>

<!-- LAYOUT -->
<Header {title} {...navProps} />
<form method="POST" use:enhance class="h-full flex-1 overflow-hidden">
  <main class="flex h-full flex-1 flex-row gap-6 bg-black p-6 pb-0 pr-3">
    <div class="relative z-10 h-full flex-1 basis-1/3 @container">
      <MapSection {...navProps}/>
      <div
        class="absolute bottom-2 left-0 right-0 hidden items-center justify-center gap-6 p-4 @md:flex">
        <UserAttributionCard
          userId={$form.contributorId}
          date={$form.createdAt}
          type="contributor" />
        {#if $form.publisherId && $form.publishedAt}
          <UserAttributionCard
            userId={$form.publisherId}
            date={$form.publishedAt}
            type="publisher" />
        {/if}
      </div>
    </div>
    <div class="flex basis-2/3 flex-col-reverse justify-end gap-6 overflow-auto pb-12 pr-3">
      {#if navProps.facet === 'core'}
        <div class="flex flex-row gap-6">
          <PropertySection
            title="Classifiers"
            subtitle="by which features can be filtered"
            fieldDiscriminator="classifier"
            fields={FIELDS.property as FormFieldArray}
            {...navProps} />
          <PropertySection
            title="Specifiers"
            subtitle="which are displayed in feature info panels"
            fieldDiscriminator="specifier"
            fields={FIELDS.property as FormFieldArray}
            {...navProps} />
        </div>
        <I18nSection
          title="Descriptors"
          fields={FIELDS.i18n as FormField}
          {...navProps} />
        <!-- TODO Add support for translatable specifiers -->
      {:else if navProps.facet === 'address'}
        <AddressSection
          title="Addressing"
          subtitle="feature is listed under this address in the app"
          fields={FIELDS.address as FormField}
          {...navProps} />
        <!-- <AddressComponentSection
            title="Address Components"
            {...navProps} /> -->
      {:else}
        <h1>FACET NOT FOUND</h1>
      {/if}
    </div>
    <!-- <SuperDebug data={form} /> -->
  </main>
</form>
