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

// CONTEXT
const resourceState = getHierarchicalResourceState();

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

// STATE : FORM
let form = setForm<Layer>(
  RESOURCE,
  pageProps.data.entity,
  pageProps.data.validatedForm,
  getHierarchicalResourceState()
);
let enhance = $derived(form.enhance);

// STATE : DERIVED :: TITLE
let title = $derived(pageProps.data.validatedForm.data.name || NEW_TITLE);
</script>

<!-- LAYOUT -->
<div class="mb-12 h-full bg-black">
  <Header {title} {form} />
  <form method="POST" use:enhance role="form" data-testid="layerForm" class="h-full">
    <main class="flex h-full flex-col gap-6 overflow-y-scroll p-6">
      {#if resourceState.activeFacet === 'core' || resourceState.activeFacet === false}
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
