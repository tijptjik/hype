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
  users: {
    userRoles: {
      label: 'Members',
      component: UserCards
    }
  },
  specification: {
    code: {
      label: 'Code',
      component: InputField
    },
    url: {
      label: 'URL',
      component: InputField
    }
  },
  images: {
    image: {
      label: 'Profile Image',
      component: InputField
    }
  }
};

// STATE : PROPS
let { data }: { data: { validatedForm: SuperValidated<Organisation>; entity: string } } = $props();
let { validatedForm, entity } = data;

// STATE : DERIVED
const routerState = getRouterState() as ResourceRouter;
const title = $derived($form.name || 'New');

// STATE : FORM
let { message, enhance, form } = setForm(routerState.resource as ResourceType, entity, validatedForm);

</script>

<!-- LAYOUT -->
<div class="h-full overflow-y-auto bg-black pb-16">
  <Header entity={data.entity} resourceType={routerState.resource as ResourceType} {title}/>
  <main class="flex flex-col p-6">
    {#if Object.keys(message).length > 0}<h3>{get(message)}</h3>{/if}
    <form method="POST" use:enhance class="flex flex-col gap-6">
      {#if routerState.facet === 'core' || routerState.facet === false}
        <I18nSection title="Descriptors" fields={FIELDS.i18n} {entity} resourceType={routerState.resource as ResourceType}/>
        <div class="flex flex-row gap-6">
          <UserSection title="Members" fields={FIELDS.users} {entity} resourceType={routerState.resource as ResourceType}/>
          <SpecificationSection title="Specification" fields={FIELDS.specification} {entity} resourceType={routerState.resource as ResourceType}/>
        </div>
      {:else if routerState.facet === 'images'}
        <ImageSection title="Image" fields={FIELDS.images} {entity} resourceType={routerState.resource as ResourceType}/>
      {:else}
        <h1>FACET NOT FOUND</h1>
      {/if}
    </form>
    <!-- <SuperDebug data={$form} /> -->
  </main>
</div>
