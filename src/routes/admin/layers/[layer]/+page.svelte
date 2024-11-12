<script lang="ts">
// Context
import { getRouterState } from '$lib/context/router.svelte';
import { setForm } from '$lib/context/forms.svelte';
import { get } from 'svelte/store';
// Components
import Header from '$lib/components/layout/EntityHeader.svelte';
import I18nSection from '$lib/components/forms/FormSectionI18n.svelte';
import LayerPropertySection from '$lib/components/forms/FormLayerSectionProperty.svelte';
// TYPES
import type { SuperForm } from 'sveltekit-superforms';
import type { Layer } from '$lib/types';
import type { FormField, FormFieldConfig, FormFieldArray, ResourceType, ResourceRouter } from '$lib/types';

// CONFIG
const FIELDS: FormFieldConfig = {
  i18n: {
    name: {
      label: 'Full Name',
      component: 'InputField',
      isArray: false,
      isTranslated: true
    },
    nameShort: {
      label: 'Short Name',
      component: 'InputField',
      isArray: false,
      isTranslated: true
    },
    description: {
      label: 'Description',
      component: 'TextareaField',
      isArray: false,
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
  }
};

// STATE : PROPS
let { data }: { data: { validatedForm: SuperForm<Layer>; entity: string } } = $props();
let { validatedForm, entity } = data;

// STATE : DERIVED
const routerState = getRouterState() as ResourceRouter;
const title = $derived(data.validatedForm.data.name || 'New');

// STATE : FORM
let {enhance, form, errors } = setForm(
  routerState.resource as ResourceType,
  entity,
  validatedForm
);
</script>

<!-- LAYOUT -->
<div class="h-full overflow-y-auto bg-black pb-16">
  <Header entity={data.entity} resourceType={routerState.resource} {title} />
  <main class="flex flex-col p-6">
    <form method="POST" use:enhance class="flex flex-col gap-6">
      {#if routerState.facet === 'core' || routerState.facet === false}
        <I18nSection
          title="Descriptors"
          fields={FIELDS.i18n as FormField}
          facet={routerState.facet}
          {entity}
          resourceType={routerState.resource} />
        <div class="flex flex-row gap-6">
          <LayerPropertySection
            title="Classifiers"
            subtitle="by which features can be filtered"
            fieldDiscriminator="classifier"
            fields={FIELDS.property as FormFieldArray}
            {entity}
            resourceType={routerState.resource} />
          <LayerPropertySection
            title="Specifiers"
            subtitle="which are displayed in feature info panels"
            fieldDiscriminator="specifier"
            fields={FIELDS.property as FormFieldArray}
            {entity}
            resourceType={routerState.resource} />
        </div>
      {:else}
        <h1>FACET NOT FOUND</h1>
      {/if}
    </form>
    <!-- <SuperDebug data={FormContext.form} /> -->
  </main>
</div>
