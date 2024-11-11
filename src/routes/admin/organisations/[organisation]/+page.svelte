<script lang="ts">
import SuperDebug from 'sveltekit-superforms';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
import { setForm } from '$lib/context/forms.svelte';
import { get } from 'svelte/store';
// COMPONENTS
import Header from '$lib/components/layout/EntityHeader.svelte';
import I18nSection from '$lib/components/forms/FormSectionI18n.svelte';
import SpecificationSection from '$lib/components/forms/FormSectionSpecification.svelte';
import ImageSection from '$lib/components/forms/FormSectionImage.svelte';
import InputField from '$lib/components/forms/FormFieldInput.svelte';
import TextareaField from '$lib/components/forms/FormFieldTextarea.svelte';
import UserCards from '$lib/components/forms/FormFieldUsers.svelte';
import UserSection from '$lib/components/forms/FormSectionUser.svelte';
// TYPES
import type { SuperValidated } from 'sveltekit-superforms';
import type { FormFieldConfig, Organisation, ResourceType, ResourceRouter } from '$lib/types';

// TYPES
type Props = {
  data: {
    validatedForm: SuperValidated<Organisation>;
    entity: string;
  };
};

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
  users: {
    userRoles: {
      label: 'Members',
      isArray: true,
      isTranslated: false
    }
  },
  specification: {
    code: {
      label: 'Code',
      component: 'InputField',
      isArray: false,
      isTranslated: false
    },
    url: {
      label: 'URL',
      component: 'InputField',
      isArray: false,
      isTranslated: false
    }
  },
  images: {
    image: {
      label: 'Profile Image',
      component: 'InputField',
      isArray: false,
      isTranslated: false
    }
  }
};

// STATE : PROPS
let { data }: Props = $props();
let { validatedForm, entity } = data;

// STATE : DERIVED
const routerState = getRouterState() as ResourceRouter;
const title = $derived(validatedForm.data.name || 'New');

// STATE : FORM
let { message, enhance, form, validateForm } = setForm(
  routerState.resource,
  entity,
  validatedForm
);

</script>

<!-- LAYOUT -->
<div class="h-full overflow-y-auto bg-black pb-16">
  <Header entity={data.entity} resourceType={routerState.resource} {title} />
  <main class="flex flex-col p-6">
    {#if Object.keys(message).length > 0}<h3>{get(message)}</h3>{/if}
    <form method="POST" use:enhance class="flex flex-col gap-6">
      {#if routerState.facet === 'core' || routerState.facet === false}
        <I18nSection
          title="Descriptors"
          fields={FIELDS.i18n}
          facet="core"
          {entity}
          resourceType={routerState.resource} />
        <div class="flex flex-row gap-6">
          <UserSection
            title="Members"
            subtitle="Members can be set as Project Maintainers"
            fields={FIELDS.users}
            facet="core"
            {entity}
            resourceType={routerState.resource} />
          <SpecificationSection
            title="Specification"
            fields={FIELDS.specification}
            facet="core"
            {entity}
            resourceType={routerState.resource as ResourceType} />
        </div>
      {:else if routerState.facet === 'images'}
        <ImageSection
          title="Image"
          fields={FIELDS.images}
          facet="core"
          {entity}
          resourceType={routerState.resource as ResourceType} />
      {:else}
        <h1>FACET NOT FOUND</h1>
      {/if}
    </form>
    <!-- <SuperDebug data={$form} /> -->
  </main>
</div>
