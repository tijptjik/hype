<script lang="ts">
import SuperDebug, { defaults, superForm } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { OrganisationSchema } from '$lib/db/schema';
import { getActiveFromPath } from '$lib';
import { page } from '$app/stores';
import { meta } from '$lib/stores/resources.svelte';
// STATE : PROPS
let { children, data } = $props();

// STATE : DERIVED
const active = $derived(() => {
  return getActiveFromPath($page.url.pathname);
});

// STATE : EFFECTS
const { form, errors, message, constraints, enhance, validateForm } = superForm(
  defaults(data.form, zod(OrganisationSchema)),
  {
    dataType: 'json',
    SPA: true,
    validators: zod(OrganisationSchema),
    onSubmit: async ({ action, formData, formElement, controller, submitter, cancel }) => {
      const response = await fetch(`/api/organisations/${$form.code}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify($form)
      });
      if (!response.ok) {
        console.error('Form submission failed');
      }
    }
  }
);

$effect(() => {
  meta.title = data.form.data.name || 'Unknown';
});

validateForm({ update: true });
</script>

<main class="flex flex-col bg-black w-full">
  <main class="px-6 py-4">
  {#snippet childContent()}
    {@render children({ form, errors, message, constraints, enhance, validateForm })}
  {/snippet}

  {@render childContent()}
</main>
</main>
