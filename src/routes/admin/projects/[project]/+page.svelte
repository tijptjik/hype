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
import CustomFieldSection from '$lib/components/forms/FormSectionCustomField.svelte';
import InputField from '$lib/components/forms/FormFieldInput.svelte';
import TextareaField from '$lib/components/forms/FormFieldTextarea.svelte';
import CustomField from '$lib/components/forms/FormFieldCustomFields.svelte';
import FormUserCard from '$lib/components/forms/FormFieldUsers.svelte';
import UserSection from '$lib/components/forms/FormSectionUser.svelte';
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
    }
  },
  credit: {
    license: {
      label: 'License',
      component: InputField
    },
    attribution: {
      label: 'Attribution',
      component: InputField
    }
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
    }
  },
  config: {
    metadata: {
      classifiers: {
        label: 'Classifiers',
        component: CustomField
      },
      specificiers: {
        label: 'Specificiers',
        component: CustomField
      }
    }
  },
  images: {
    image: {
      label: 'Banner Image',
      component: InputField
    }
  }
};

// STATE : PROPS
let { data }: { data: { validatedForm: SuperValidated<Project>; entity: string } } = $props();
let { validatedForm, entity } = data;

// STATE : DERIVED
const routerState = getRouterState() as ResourceRouter;
const title = $derived($form.name || 'New');

// STATE : FORM
let { message, enhance, form } = setForm(
  routerState.resource as ResourceType,
  entity,
  validatedForm
);
</script>

<!-- LAYOUT -->
<div class="h-full overflow-y-auto bg-black pb-16">
  <Header entity={data.entity} resourceType={routerState.resource} {title} />
  <main class="flex w-full flex-col p-6">
    {#if Object.keys(message).length > 0}<h3>{get(message)}</h3>{/if}
    <form method="POST" use:enhance class="flex flex-col gap-6">
      {#if routerState.facet === 'core' || routerState.facet === false}
        <I18nSection
          title="Descriptors"
          fields={FIELDS.i18n}
          facet={routerState.facet as string}
          {entity}
          resourceType={routerState.resource} />
        <I18nSection
          title="Credit"
          fields={FIELDS.credit}
          facet={routerState.facet as string}
          {entity}
          resourceType={routerState.resource} />
        <div class="flex flex-row gap-6">
          <UserSection
            title="Members"
            fields={FIELDS.users}
            facet={routerState.facet as string}
            {entity}
            resourceType={routerState.resource as Exclude<ResourceType, 'layer' | 'feature'>} />
          <SpecificationSection
            title="Specification"
            fields={FIELDS.specification}
            facet={routerState.facet as string}
            {entity}
            resourceType={routerState.resource} />
        </div>
      {:else if routerState.facet === 'config'}
        <CustomFieldSection
          title="Categorical Fields"
          subtitle="by which features can be filtered"
          fieldId="metadata"
          customPropertyType="classifiers"
          fields={FIELDS.config.metadata.classifiers}
          facet={routerState.facet as string}
          {entity}
          resourceType={routerState.resource} />
        <CustomFieldSection
          title="Freeform Fields"
          subtitle="displayed in a feature's info panels"
          fieldId="metadata"
          customPropertyType="specifiers"
          fields={FIELDS.config.metadata.specifiers}
          facet={routerState.facet as string}
          {entity}
          resourceType={routerState.resource} />
      {:else if routerState.facet === 'images'}
        <ImageSection
          title="Image"
          fields={FIELDS.images}
          facet={routerState.facet as string}
          {entity}
          resourceType={routerState.resource} />
      {:else}
        <h1>FACET NOT FOUND</h1>
      {/if}
    </form>
    <!-- <SuperDebug data={$form} /> -->
  </main>
</div>
