<script lang="ts">
import { getFieldComponent } from '$lib';
// Components
import Header from '$lib/components/forms/extra/Header.svelte';
// Types
import type { SectionProps } from '$lib/types';

// STATE : PROPS
let sectionProps: SectionProps = $props();
let { fields } = sectionProps;
</script>

<div
  class="from-rose-500 to-fuchsia-800 basis-1/3 overflow-hidden rounded-2xl bg-gradient-to-r p-0"
  style="transition: none;">
  <Header {...sectionProps} />
  <div class="flex flex-wrap items-baseline gap-4 p-4">
    <div class="group flex flex-grow flex-col gap-4">
      {#each Object.entries(fields) as [fieldRoot, field]}
        {@const Field = getFieldComponent(field.component)}
        <div class="rounded-xl bg-base-100 px-6 py-2 pb-6 pt-4">
          <Field {fieldRoot} {field} locale="core" {...sectionProps} />
        </div>
      {/each}
    </div>
  </div>
</div>
