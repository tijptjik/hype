<script lang="ts">
// Context
import { getRouterState } from '$lib/context/router.svelte';
import { setForm } from '$lib/context/forms.svelte';
import { get } from 'svelte/store';
// Components
import Header from '$lib/components/layout/EntityHeader.svelte';
import I18nSection from '$lib/components/forms/FormSectionI18n.svelte';
import SpecificationSection from '$lib/components/forms/FormSectionSpecification.svelte';
import ImageSection from '$lib/components/forms/FormSectionImage.svelte';
import InputField from '$lib/components/forms/FormFieldInput.svelte';
import TextareaField from '$lib/components/forms/FormFieldTextarea.svelte';
import FormUserCard from '$lib/components/forms/FormFieldUsers.svelte';
import UserSection from '$lib/components/forms/FormSectionUser.svelte';
import CustomFieldSection from '$lib/components/forms/FormSectionCustomField.svelte';
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
  },
  credit: {
    license: {
      label: 'License',
      component: InputField
    },
    attribution: {
      label: 'Attribution',
      component: InputField
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
      component: InputField
    },
  },
  config: {
    metadata: {
      label: 'Metadata',
      component: CustomFieldSection
    },
  },
  images: {
    image: {
      label: 'Banner Image',
      component: InputField
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
  <Header entity={data.entity} resourceType={routerState.resource} title={data.form.data.name || 'New'}/>
  <main class="flex w-full flex-col p-6">
    {#if Object.keys(FormContext.message).length > 0}<h3>{get(FormContext.message)}</h3>{/if}
    <form method="POST" use:FormContext.enhance class="flex flex-col gap-6">
      {#if routerState.facet === 'core' || routerState.facet === false}
        <I18nSection title="Descriptors" fields={FIELDS.i18n} {entity} resourceType={routerState.resource}  />
        <I18nSection title="Credit" fields={FIELDS.credit} {entity} resourceType={routerState.resource}  />
        <div class="flex flex-row gap-6">
          <UserSection title="Members" fields={FIELDS.users} {entity} resourceType={routerState.resource as Exclude<ResourceType, 'layer' | 'feature'>}/>
          <SpecificationSection title="Specification" fields={FIELDS.specification} {entity} resourceType={routerState.resource}/>
        </div>
      {:else if routerState.facet === 'config'}
        <CustomFieldSection title="Custom Fields" fields={FIELDS.config} {entity} resourceType={routerState.resource}/>
      {:else if routerState.facet === 'images'}
        <ImageSection title="Image" fields={FIELDS.images} {entity} resourceType={routerState.resource}/>
      {:else}
        <h1>FACET NOT FOUND</h1>
      {/if}
    </form>
    <!-- <SuperDebug data={FormContext.form} /> -->
  </main>
</div>
