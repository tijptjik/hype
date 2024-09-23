<script lang="ts">
  import { superForm } from 'sveltekit-superforms';
  import { zod } from 'sveltekit-superforms/adapters';
  import { selectOrganisationSchema } from '$lib/db/schema';
  import type { Snippet } from 'svelte';

  let {
    data = {},
    formFields
  }: {
    data: unknown
    formFields: Snippet<[form: unknown, formData: unknown]>
  } = $props();

  let options = {
    SPA: true,
    resetForm: false,
    applyAction: false,
    validators: zod(selectOrganisationSchema)
  };

  const form = superForm(
    data.form,
    options
  );
  const { form: formData, enhance } = form;
</script>

<form method="POST" use:enhance>
  {@render formFields(form, $formData)}
</form>