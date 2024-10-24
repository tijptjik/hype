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
import FormUserCard from '$lib/components/forms/FormUserCard.svelte';
import FormUserSection from '$lib/components/forms/FormUserSection.svelte';
// TYPES
import type { FormFieldConfig } from '$lib/types';
import type { SuperValidated } from 'sveltekit-superforms';
import type { Project } from '$lib/types';
import type { ResourceType, ResourceRouter } from '$lib/types';
import SuperDebug from 'sveltekit-superforms';

// CONFIG
const FIELDS: FormFieldConfig = {
  i18n: {
    name: {
      label: 'Full Name',
      component: FormInputField
    },
    nameShort: {
      label: 'Short Name',
      component: FormInputField
    },
    description: {
      label: 'Description',
      component: FormTextField
    },
  },
  credit: {
    license: {
      label: 'License',
      component: FormInputField
    },
    attribution: {
      label: 'Attribution',
      component: FormInputField
    },
  },
  users: {
    maintainerRoles: {
      label: 'Maintainers',
      component: FormUserCard
    }
  },
  specification: {
    code: {
      label: 'Code',
      component: FormInputField
    },
  },
  images: {
    image: {
      label: 'Banner Image',
      component: FormInputField
    }
  }
};

// STATE : PROPS
let { data }: { data: { form: SuperValidated<Project>; entity: string } } = $props();
let { form, entity } = data;

// STATE : DERIVED
const routerState = getRouterState() as ResourceRouter;

// STATE : FORM
const FormContext = setForm(routerState.resource as ResourceType, entity, form);
</script>

<!-- LAYOUT -->
<div class="h-full overflow-y-auto bg-black">
  <EntityHeader entity={data.entity} resourceType={routerState.resource} title={data.form.data.name || 'New'}/>
  <main class="flex w-full flex-col p-6">
    {#if Object.keys(FormContext.message).length > 0}<h3>{get(FormContext.message)}</h3>{/if}
    <form method="POST" use:FormContext.enhance class="flex flex-col gap-6">
      {#if routerState.facet === 'core' || routerState.facet === false}
        <FormI18nSection title="Descriptors" fields={FIELDS.i18n} {entity} resourceType={routerState.resource}  />
        <FormI18nSection title="Credit" fields={FIELDS.credit} {entity} resourceType={routerState.resource}  />
        <div class="flex flex-row gap-6">
          <FormUserSection title="Members" fields={FIELDS.users} {entity} resourceType={routerState.resource as Exclude<ResourceType, 'layer' | 'feature'>}/>
          <FormSpecificationSection title="Specification" fields={FIELDS.specification} {entity} resourceType={routerState.resource}/>
        </div>
      {:else if routerState.facet === 'images'}
        <FormImageSection title="Image" fields={FIELDS.images} {entity} resourceType={routerState.resource}/>
      {:else}
        <h1>FACET NOT FOUND</h1>
      {/if}
    </form>
    <!-- <SuperDebug data={FormContext.form} /> -->
  </main>
</div>
