<script lang="ts">
// Context
import { getRouterState } from '$lib/context/router.svelte';
import { setForm } from '$lib/context/forms.svelte';
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
import type { Organisation } from '$lib/types';

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
    }
  },
  users: {
    userRoles: {
      label: 'Members',
      component: FormUserCard
    }
  },
  specification: {
    code: {
      label: 'Code',
      component: FormInputField
    },
    url: {
      label: 'URL',
      component: FormInputField
    }
  },
  images: {
    image: {
      label: 'Profile Image',
      component: FormInputField
    }
  }
};

// STATE : PROPS
let { data }: { data: { form: SuperValidated<Organisation>; entity: string } } = $props();
let { form, entity } = data;

// STATE : DERIVED
const routerState = getRouterState();

// STATE : FORM
const { message, enhance } = setForm(form, entity);
</script>

<!-- LAYOUT -->
<div class="h-full overflow-y-auto bg-black">
  <EntityHeader entity={data.entity} title={data.form.data.name || 'New'} />
  <main class="flex w-full flex-col p-6">
    {#if $message}<h3>{$message}</h3>{/if}
    <form method="POST" use:enhance class="flex flex-col gap-6">
      {#if routerState.facet === 'core' || routerState.facet === false}
        <FormI18nSection title="Descriptors" fields={FIELDS.i18n} {entity} />
        <div class="flex flex-row gap-6">
          <FormUserSection title="Members" fields={FIELDS.users} {entity} />
          <FormSpecificationSection title="Specification" fields={FIELDS.specification} {entity} />
        </div>
      {:else if routerState.facet === 'images'}
        <FormImageSection title="Image" fields={FIELDS.images} {entity} />
      {:else}
        <h1>FACET NOT FOUND</h1>
      {/if}
    </form>
    <!-- <SuperDebug data={$form} /> -->
  </main>
</div>
