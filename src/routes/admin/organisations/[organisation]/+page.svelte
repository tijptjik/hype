<script lang="ts">
// Context
import { getRouterState } from '$lib/context/router.svelte';
import { setForm } from '$lib/context/forms.svelte';
// Stores
import { meta } from '$lib/stores/resources.svelte';
// Components
import EntityHeader from '$lib/components/layout/EntityHeader.svelte';
import FormI18nSection from '$lib/components/forms/FormI18nSection.svelte';
import FormSpecificationSection from '$lib/components/forms/FormSpecificationSection.svelte';
import FormImageSection from '$lib/components/forms/FormImageSection.svelte';
import FormInputField from '$lib/components/forms/FormInputField.svelte';
import FormTextField from '$lib/components/forms/FormTextField.svelte';
// CONFIG
const FIELDS = {
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
let { data } = $props();

// STATE : DERIVED
const routerState = getRouterState();

// STATE : EFFECTS
$effect(() => {
  if (routerState.entity) {
    meta.title = data.form.data.name || 'Unknown';
  }
});

// STATE : FORM
const { message, enhance, errors } = setForm(data);

$effect(() => {
  $inspect('ERRORS', $errors);
});


</script>

<!-- LAYOUT -->
<div class="h-full overflow-y-auto bg-black">
  <EntityHeader />
  <main class="flex w-full flex-col p-6">
    {#if $message}<h3>{$message}</h3>{/if}
    <form method="POST" use:enhance class="flex flex-col gap-6">
      {#if routerState.facet === 'core' || routerState.facet === false}
        <FormI18nSection title="Descriptors" fields={FIELDS.i18n} />
        <FormSpecificationSection title="Specification" fields={FIELDS.specification} />
      {:else if routerState.facet === 'images'}
        <FormImageSection title="Image" fields={FIELDS.images} />
      {:else}
        <h1>FACET NOT FOUND</h1>
      {/if}
    </form>
    <!-- <SuperDebug data={$form} /> -->
  </main>
</div>
