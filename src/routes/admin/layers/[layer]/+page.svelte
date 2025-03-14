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
import LayerPropertySection from '$lib/components/forms/sections/LayerProperty.svelte';
// ENUMS
import { HierarchicalResource } from '$lib/types';
// TYPES
import type { Layer, FormPageProps, FormField, FormFieldArray } from '$lib/types';

// CONFIG
const RESOURCE = HierarchicalResource.layer;
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
let pageProps: FormPageProps<Layer> = $props();
let { validatedForm, entity } = pageProps.data;

// STATE : CONTEXT :: RESOURCES
const resourceState = getHierarchicalResourceState();

// STATE : FORM
let form = $state(setForm<Layer>(RESOURCE, entity, validatedForm));
let enhance = $derived(form.enhance);
let isNew = $state(entity === NEW_REF);

$effect(() => {
  if (isNew && title !== NEW_TITLE) {
    form = setForm<Layer>(RESOURCE, entity, pageProps.data.validatedForm);
    isNew = false;
    doRerender++;
  } else {
    form = getForm<Layer>(RESOURCE, entity);
  }
});

// STATE : DERIVED :: TITLE
let title = $derived(pageProps.data.validatedForm.data.name || NEW_TITLE);

// SYNC :: Update resource state with current entity
$effect(() => {
  resourceState.setEntity(entity, RESOURCE);
});

// SYNC :: Remove parentRef from URL if it exists
$effect(() => {
  //Remove parentRef from URL if it exists
  const url = new URL(window.location.href);
  url.searchParams.delete('parentRef');
  // shallow navigation
  goto(i18n.resolveRoute(url.toString()), { replaceState: true });
});

// SYNC :: Await immediately resolved promise to react to value change.
const forceUpdate = async (_) => {};
let doRerender = $state(0);
</script>

{#await forceUpdate(doRerender) then _}
  <!-- LAYOUT -->
  <div class="h-full overflow-y-auto bg-black pb-16">
    <Header {title} {form} />
    <form method="POST" use:enhance role="form" data-testid="layerForm">
      <main class="flex flex-col gap-6 p-6">
        {#if resourceState.activeFacet === 'core'}
          <I18nSection title="Descriptors" fields={FIELDS.i18n as FormField} {form} />
          <div class="flex flex-row gap-6">
            <LayerPropertySection
              title="Classifiers"
              subtitle="by which features can be filtered"
              fieldDiscriminator="classifier"
              fields={FIELDS.property as FormField & FormFieldArray}
              {form} />
            <LayerPropertySection
              title="Specifiers"
              subtitle="which are displayed in feature info panels"
              fieldDiscriminator="specifier"
              fields={FIELDS.property as FormField & FormFieldArray}
              {form} />
          </div>
        {/if}
      </main>
    </form>
  </div>
{/await}
