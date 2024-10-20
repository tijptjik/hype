<script lang="ts">
    // Components
    import FormSectionHeader from '$lib/components/forms/FormSectionHeader.svelte';
    import { getForm } from '$lib/context/forms.svelte';
    // Types
    import type { Component } from 'svelte';
    
    let {
      title,
      fields
    }: {
      title: string;
      fields: Record<
        string, Record<string, string>
      >;
    } = $props();

    $inspect('FIELDS', fields);
    
    const { form, errors, constraints } = getForm();
    </script>
    
    <div class="w-full overflow-hidden rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-800 p-0">
      <FormSectionHeader {title} />
      <div class="flex flex-row flex-wrap items-baseline gap-4 p-4">
        <div class="group flex flex-grow flex-col gap-4">
          {#each Object.entries(fields) as [fieldId, field]}
            <div class="rounded-xl">
              <!-- svelte-ignore svelte_component_deprecated -->
              <svelte:component this={field.component} {fieldId} {field} {form} {constraints} {errors} />
            </div>
          {/each}
        </div>
      </div>
    </div>
    