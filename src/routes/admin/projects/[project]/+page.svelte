<script lang="ts">
    import SuperDebug, { defaults, superForm } from 'sveltekit-superforms';
    import { zod } from 'sveltekit-superforms/adapters';
    import { ProjectSchema } from '$lib/db/schema';
    
    let data = $props();
    
    const { form, errors, message, constraints, enhance, validateForm } = superForm(
      defaults(data.form, zod(ProjectSchema)),
      {
        dataType: 'json',
        SPA: true,
        validators: zod(ProjectSchema),
        onSubmit: async ({ action, formData, formElement, controller, submitter, cancel }) => {
          const response = await fetch(`/api/projects/${$form.code}`, {
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
      <SuperDebug data={$form} />
      <div>
        <h1 class="text-lg">Edit project</h1>
        {#if $message}<h3>{$message}</h3>{/if}
        <form class="flex flex-row" use:enhance>
          <div>
            <button>Submit</button>
          </div>
          {#snippet formFields(form, errors, constraints)}
            <div class="items-star flex w-1/3 flex-col">
              <div>
                <label for="name">Name</label>
                <input
                  type="text"
                  name="name"
                  bind:value={form.name}
                  {...constraints.name}
                  class:input-error={errors.name}
                  aria-invalid={errors.name ? 'true' : undefined} />
                {#if errors.name}<span class="text-sm text-error">{errors.name}</span>{/if}
              </div>
    
              <div>
                <label for="nameShort">Short Name</label>
                <input
                  type="text"
                  name="nameShort"
                  bind:value={form.nameShort}
                  {...constraints.nameShort}
                  class:input-error={errors.nameShort}
                  aria-invalid={errors.nameShort ? 'true' : undefined} />
                {#if errors.nameShort}<span class="text-sm text-error">{errors.nameShort}</span>{/if}
              </div>
    
              <div>
                <label for="description">Description</label>
                <textarea
                  name="description"
                  bind:value={form.description}
                  {...constraints.description}
                  class:textarea-error={errors.description}
                  aria-invalid={errors.description ? 'true' : undefined}></textarea>
                {#if errors.description}<span class="text-sm text-error">{errors.description}</span
                  >{/if}
              </div>
            </div>
          {/snippet}
    
          {@render formFields($form, $errors, $constraints)}
    
          {#each $form.translations as translation, idx}
            {@render formFields(
              translation,
              $errors.translations?.[idx] ?? {},
              $constraints?.translations ?? {}
            )}
          {/each}
        </form>
      </div>
    </main>