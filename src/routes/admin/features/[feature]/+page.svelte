<script lang="ts">
// Context
import { getRouterState } from '$lib/context/router.svelte';
import { setForm } from '$lib/context/forms.svelte';
import { get } from 'svelte/store';
// Components
import EntityHeader from '$lib/components/layout/EntityHeader.svelte';
import FormI18nSection from '$lib/components/forms/FormI18nSection.svelte';
import FormSpecificationSection from '$lib/components/forms/FormSpecificationSection.svelte';
import FormImageSection from '$lib/components/forms/FormImageSection.svelte';
import FormInputField from '$lib/components/forms/FormInputField.svelte';
import FormTextField from '$lib/components/forms/FormTextField.svelte';
import FormUserSection from '$lib/components/forms/FormUserSection.svelte';
// TYPES
import type { FormFieldConfig } from '$lib/types';
import type { SuperValidated } from 'sveltekit-superforms';
import type { Feature } from '$lib/types';
import type { ResourceType } from '$lib/types';
import SuperDebug from 'sveltekit-superforms';

// CONFIG
const FIELDS: FormFieldConfig = {
  i18n: {
    title: {
      label: 'Title',
      component: FormInputField
    },
    description: {
      label: 'Description',
      component: FormTextField
    }
  },
  properties: {
    markerSize: {
      label: 'Marker Size',
      component: FormInputField
    },
    markerColor: {
      label: 'Marker Color',
      component: FormInputField
    }
  },
  address: {
    formattedAddress: {
      label: 'Formatted Address',
      component: FormInputField
    }
  }
};

// STATE : PROPS
let { data }: { data: { form: SuperValidated<Feature>; entity: string } } = $props();
let { form, entity } = data;

// STATE : DERIVED
const routerState = getRouterState();

// STATE : FORM
const FormContext = setForm(routerState.resource as ResourceType, entity, form);
</script>

<!-- LAYOUT -->
<div class="h-full overflow-y-auto bg-black">
  <EntityHeader entity={data.entity} resourceType={routerState.resource as ResourceType} title={data.form.data.title || 'New'}/>
  <main class="flex w-full flex-col p-6">
    {#if Object.keys(FormContext.message).length > 0}<h3>{get(FormContext.message)}</h3>{/if}
    <form method="POST" use:FormContext.enhance class="flex flex-col gap-6">
      {#if routerState.facet === 'core' || routerState.facet === false}
        <FormI18nSection title="Descriptors" fields={FIELDS.i18n} {entity} resourceType={routerState.resource as ResourceType}  />
        <div class="flex flex-row gap-6">
          <FormSpecificationSection title="Properties" fields={FIELDS.properties} {entity} resourceType={routerState.resource as ResourceType}/>
          <FormI18nSection title="Address" fields={FIELDS.address} {entity} resourceType={routerState.resource as ResourceType}/>
        </div>
      {:else if routerState.facet === 'images'}
        <FormImageSection title="Image" fields={FIELDS.images} {entity} resourceType={routerState.resource as ResourceType}/>
      {:else}
        <h1>FACET NOT FOUND</h1>
      {/if}
    </form>
    <!-- <SuperDebug data={FormContext.form} /> -->
  </main>
</div>
