<script lang="ts">
// Context
import { getRouterState } from '$lib/context/router.svelte';
import { setForm } from '$lib/context/forms.svelte';
// Components
import Header from '$lib/components/layout/EntityHeader.svelte';
import I18nSection from '$lib/components/forms/sections/I18n.svelte';
import LayerPropertySection from '$lib/components/forms/sections/LayerProperty.svelte';
// TYPES
import type {
  Layer,
  PageProps,
  NavProps,
  FormField,
  FormFieldArray,
  ResourceRouter
} from '$lib/types';

// CONFIG
const FIELDS: Record<string, FormField | FormFieldArray> = {
  i18n: {
    name: {
      label: 'Full Name',
      component: 'InputField',
      isArray: false,
      isTranslated: true,
      isNested: false
    },
    nameShort: {
      label: 'Short Name',
      component: 'InputField',
      isArray: false,
      isTranslated: true,
      isNested: false
    },
    description: {
      label: 'Description',
      component: 'TextareaField',
      isArray: false,
      isTranslated: true,
      isNested: false
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
  }
};

// STATE : PROPS
let { data }: PageProps<Layer> = $props();
let { validatedForm } = data;

// STATE : DERIVED
const routerState = getRouterState() as ResourceRouter;
let title = $derived(data.validatedForm.data.name || 'New');

let navProps: NavProps = $derived({
  resource: routerState.resource,
  entity: data.entity,
  facet: routerState.facet || 'core'
});

// STATE : FORM
let { enhance } = setForm<Layer>(navProps.resource, navProps.entity, validatedForm);

$effect(() => {
  //Remove parentRef from URL if it exists
  const url = new URL(window.location.href);
  url.searchParams.delete('parentRef');
  // shallow navigation
  goto(url.toString(), { replaceState: true });
});
</script>

<!-- LAYOUT -->
<div class="h-full overflow-y-auto bg-black pb-16">
  <Header {title} {...navProps} />
  <form method="POST" use:enhance>
    <main class="flex flex-col gap-6 p-6">
      {#if navProps.facet === 'core'}
        <I18nSection title="Descriptors" fields={FIELDS.i18n as FormField} {...navProps} />
        <div class="flex flex-row gap-6">
          <LayerPropertySection
            title="Classifiers"
            subtitle="by which features can be filtered"
            fieldDiscriminator="classifier"
            fields={FIELDS.property as FormFieldArray}
            {...navProps} />
          <LayerPropertySection
            title="Specifiers"
            subtitle="which are displayed in feature info panels"
            fieldDiscriminator="specifier"
            fields={FIELDS.property as FormFieldArray}
            {...navProps} />
        </div>
      {:else}
        <h1>FACET NOT FOUND</h1>
      {/if}
    </main>
  </form>
  <!-- <SuperDebug data={FormContext.form} /> -->
</div>
