<script lang="ts">
import type { SectionProps, FormField } from '$lib/types';

let sectionProps: SectionProps = $props();
let { title, fields } = sectionProps;
</script>

<div>
  <h2 class="text-lg font-bold">{title}</h2>
  <div class="flex flex-wrap gap-4">
    {#each Object.entries(fields as FormField) as [fieldRoot, field]}
      <div class="flex flex-col gap-2">
        <label for={fieldRoot} class="text-sm font-medium text-gray-700">{field.label}</label>
        <input
          type="file"
          id={fieldRoot}
          name={field.label}
          class="file-input file-input-bordered w-full max-w-xs" />
      </div>
    {/each}
  </div>
</div>