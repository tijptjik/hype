<script lang="ts">
// TYPES
import type { FormField } from '$lib/types';

// TYPES
type Props = {
  title: string;
  fields: FormField;
  entity: string;
};

let { title, fields, entity }: Props = $props();
</script>

<div>
  <h2 class="text-lg font-bold">{title}</h2>
  <div class="flex flex-col gap-4">
    {#each Object.entries(fields) as [fieldId, field]}
      <div class="flex flex-col gap-2">
        <label for={fieldId} class="text-sm font-medium text-gray-700">{field.label}</label>
        <input
          type="file"
          id={fieldId}
          name={field.label}
          class="file-input file-input-bordered w-full max-w-xs" />
      </div>
    {/each}
  </div>
</div>
