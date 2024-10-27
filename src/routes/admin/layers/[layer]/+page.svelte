<script lang="ts">
// Context
import { getRouterState } from '$lib/context/router.svelte';
import { setForm } from '$lib/context/forms.svelte';
import { get } from 'svelte/store';
// Components
import Header from '$lib/components/layout/EntityHeader.svelte';
import SectionI18n from '$lib/components/forms/FormSectionI18n.svelte';
import InputField from '$lib/components/forms/FormFieldInput.svelte';
import TextareaField from '$lib/components/forms/FormFieldTextarea.svelte';
// TYPES
import type { FormFieldConfig } from '$lib/types';
import type { SuperValidated } from 'sveltekit-superforms';
import type { Layer } from '$lib/types';
import type { ResourceType, ResourceRouter } from '$lib/types';
import SuperDebug from 'sveltekit-superforms';

// TODO Add Metadata

// CONFIG
const FIELDS: FormFieldConfig = {
  i18n: {
    name: {
      label: 'Full Name',
      component: InputField
    },
    nameShort: {
      label: 'Short Name',
      component: InputField
    },
    description: {
      label: 'Description',
      component: TextareaField
    },
  }
};

// STATE : PROPS
let { data }: { data: { form: SuperValidated<Layer>; entity: string } } = $props();
let { form, entity } = data;

// STATE : DERIVED
const routerState = getRouterState() as ResourceRouter;

// STATE : FORM
const FormContext = setForm(routerState.resource as ResourceType, entity, form);
</script>

<!-- LAYOUT -->
<div class="h-full overflow-y-auto bg-black">
  <Header entity={data.entity} resourceType={routerState.resource} title={data.form.data.name || 'New'}/>
  <main class="flex w-full flex-col p-6">
    {#if Object.keys(FormContext.message).length > 0}<h3>{get(FormContext.message)}</h3>{/if}
    <form method="POST" use:FormContext.enhance class="flex flex-col gap-6">
      {#if routerState.facet === 'core' || routerState.facet === false}
        <SectionI18n title="Descriptors" fields={FIELDS.i18n} {entity} resourceType={routerState.resource}  />
      {:else}
        <h1>FACET NOT FOUND</h1>
      {/if}
    </form>
    <!-- <SuperDebug data={FormContext.form} /> -->
  </main>
</div>
