<script lang="ts">
// Components
import Header from '$lib/components/forms/extra/Header.svelte';
import LayerPropertyField from '$lib/components/forms/fields/LayerProperty.svelte';
// TYPES
import type { FormFieldArray, SectionProps } from '$lib/types';

// STATE : PROPS
let sectionProps: SectionProps & { fields: FormFieldArray } = $props();
let { fields } = sectionProps;
</script>

<div
  class="from-rose-500 to-fuchsia-800 basis-2/3 overflow-hidden rounded-2xl bg-gradient-to-r p-0">
  <Header {...sectionProps} />
  {#each Object.entries(fields) as [fieldRoot, field]: [Field, FormFieldExtendedDefinition]}
    <LayerPropertyField
      {fieldRoot}
      {field}
      propertyJoinStateKey="isVisible"
      {...sectionProps} />
  {/each}
</div>
