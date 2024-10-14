<script lang="ts">
import SuperDebug, { defaults, superForm } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { FeatureSchema } from '$lib/db/schema';
import Header from '$lib/components/layout/Header.svelte';
let data = $props();

const { form, errors, message, constraints, enhance, validateForm } = superForm(
  defaults(data.form, zod(FeatureSchema)),
  {
    dataType: 'json',
    SPA: true,
    validators: zod(FeatureSchema),
    onSubmit: async ({ action, formData, formElement, controller, submitter, cancel }) => {
      const response = await fetch(`/api/features/${$form.id}`, {
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

validateForm({ update: true });
</script>

<main class="flex flex-col">
  <Header />
  <SuperDebug data={$form} />
  <div>
    <h1 class="text-lg">Edit Feature</h1>
    {#if $message}<h3>{$message}</h3>{/if}
    <form class="flex flex-row" use:enhance>
      <div>
        <button>Submit</button>
      </div>
      {#snippet formFields(form, errors, constraints)}
        <div class="items-star flex w-1/3 flex-col">
          <div>
            <label for="geometry">Geometry</label>
            <textarea
              name="geometry"
              bind:value={form.geometry}
              {...constraints.geometry}
              class:textarea-error={errors.geometry}
              aria-invalid={errors.geometry ? 'true' : undefined}></textarea>
            {#if errors.geometry}<span class="text-sm text-error">{errors.geometry}</span>{/if}
          </div>

          <div>
            <label for="properties">Properties</label>
            <textarea
              name="properties"
              bind:value={form.properties}
              {...constraints.properties}
              class:textarea-error={errors.properties}
              aria-invalid={errors.properties ? 'true' : undefined}></textarea>
            {#if errors.properties}<span class="text-sm text-error">{errors.properties}</span>{/if}
          </div>

          <div>
            <label for="addressProperties">Address Properties</label>
            <textarea
              name="addressProperties"
              bind:value={form.addressProperties}
              {...constraints.addressProperties}
              class:textarea-error={errors.addressProperties}
              aria-invalid={errors.addressProperties ? 'true' : undefined}></textarea>
            {#if errors.addressProperties}<span class="text-sm text-error">{errors.addressProperties}</span>{/if}
          </div>

          <div>
            <label for="isPublished">Is Published</label>
            <input
              type="checkbox"
              name="isPublished"
              bind:checked={form.isPublished}
              {...constraints.isPublished}
              class:input-error={errors.isPublished}
              aria-invalid={errors.isPublished ? 'true' : undefined} />
            {#if errors.isPublished}<span class="text-sm text-error">{errors.isPublished}</span>{/if}
          </div>

          <div>
            <label for="isIntangible">Is Intangible</label>
            <input
              type="checkbox"
              name="isIntangible"
              bind:checked={form.isIntangible}
              {...constraints.isIntangible}
              class:input-error={errors.isIntangible}
              aria-invalid={errors.isIntangible ? 'true' : undefined} />
            {#if errors.isIntangible}<span class="text-sm text-error">{errors.isIntangible}</span>{/if}
          </div>

          <div>
            <label for="isVisitable">Is Visitable</label>
            <input
              type="checkbox"
              name="isVisitable"
              bind:checked={form.isVisitable}
              {...constraints.isVisitable}
              class:input-error={errors.isVisitable}
              aria-invalid={errors.isVisitable ? 'true' : undefined} />
            {#if errors.isVisitable}<span class="text-sm text-error">{errors.isVisitable}</span>{/if}
          </div>

          <div>
            <label for="visitableAsOf">Visitable As Of</label>
            <input
              type="date"
              name="visitableAsOf"
              bind:value={form.visitableAsOf}
              {...constraints.visitableAsOf}
              class:input-error={errors.visitableAsOf}
              aria-invalid={errors.visitableAsOf ? 'true' : undefined} />
            {#if errors.visitableAsOf}<span class="text-sm text-error">{errors.visitableAsOf}</span>{/if}
          </div>
        </div>
      {/snippet}

      {@render formFields($form, $errors, $constraints)}
    </form>
  </div>
</main>
