<script lang="ts">
  import SuperDebug, { defaults, superForm } from 'sveltekit-superforms';
  import { zod } from 'sveltekit-superforms/adapters';
  import { OrganisationSchema } from '$lib/db/schema';

  let data = $props();

  const { form, errors, message, constraints, enhance, validateForm } = superForm(
    defaults(data.form, zod(OrganisationSchema)), {
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

        if (response.ok) {
          console.debug('Form submitted successfully');
        } else {
          console.error('Form submission failed');
        }
      },
    }
  );

  validateForm({ update: true });
</script>

<main class="flex flex-col">
  <SuperDebug data={$form} />
  <div>
    <h1 class="text-lg">Edit user</h1>
    {#if $message}<h3>{$message}</h3>{/if}
    <form class="flex flex-row" use:enhance>
      <div>
        <button>Submit</button>
      </div>
      <div class="flex flex-col w-1/3 items-star">

        <div>
          <label for="name">Name</label>
          <input type="text" name="name" bind:value={$form.name} {...$constraints.name} 
                 class:input-error={$errors.name}
                 aria-invalid={$errors.name ? 'true' : undefined} />
          {#if $errors.name}<span class="text-error text-sm">{$errors.name}</span>{/if}
        </div>

        <div>
          <label for="nameShort">Short Name</label>
          <input type="text" name="nameShort" bind:value={$form.nameShort} {...$constraints.nameShort} 
                 class:input-error={$errors.nameShort}
                 aria-invalid={$errors.nameShort ? 'true' : undefined} />
          {#if $errors.nameShort}<span class="text-error text-sm">{$errors.nameShort}</span>{/if}
        </div>

        <div>
          <label for="description">Description</label>
          <textarea name="description" bind:value={$form.description} {...$constraints.description} 
                    class:textarea-error={$errors.description}
                    aria-invalid={$errors.description ? 'true' : undefined}></textarea>
          {#if $errors.description}<span class="text-error text-sm">{$errors.description}</span>{/if}
        </div>

      </div>
      {#each $form.translations as _, idx}
        <div class="flex flex-col w-1/3 items-star">
          <div>
            <label for="name">Name</label>
            <input type="text" name="name"
                   class:input-error={$errors.translations?.[idx]?.name}
                   aria-invalid={$errors.translations?.[idx]?.name ? 'true' : undefined}
                   bind:value={$form.translations[idx].name}
                   {...$constraints?.translations?.name} />
            {#if $errors.translations?.[idx]?.name}<span class="text-error text-sm">{$errors.translations[idx].name}</span>{/if}
          </div>

          <div>
            <label for="nameShort">Short Name</label>
            <input type="text" name="nameShort"
                   class:input-error={$errors.translations?.[idx]?.nameShort}
                   aria-invalid={$errors.translations?.[idx]?.nameShort ? 'true' : undefined}
                   bind:value={$form.translations[idx].nameShort}
                   {...$constraints?.translations?.nameShort} />
            {#if $errors.translations?.[idx]?.nameShort}<span class="text-error text-sm">{$errors.translations[idx].nameShort}</span>{/if}
          </div>

          <div>
            <label for="description">Description</label>
            <textarea name="description"
                      class:textarea-error={$errors.translations?.[idx]?.description}
                      aria-invalid={$errors.translations?.[idx]?.description ? 'true' : undefined}
                      bind:value={$form.translations[idx].description}
                      {...$constraints?.translations?.description}></textarea>
            {#if $errors.translations?.[idx]?.description}<span class="text-error text-sm">{$errors.translations[idx].description}</span>{/if}
          </div>
        </div>
      {/each}

    </form>
  </div>
</main>