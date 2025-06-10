<script lang="ts">
// Components
import Header from '$lib/components/forms/extra/Header.svelte';
import LayerPropertyField from '$lib/components/forms/fields/LayerProperty.svelte';
// TYPES
import type { FormFieldArray, SectionProps, Field, FormFieldExtendedDefinition } from '$lib/types';
import { getAdminCtx } from '$lib/context/admin.svelte';

// CONTEXT
const adminCtx = getAdminCtx();

// STATE : PROPS
let sectionProps: SectionProps & { fields: FormFieldArray } = $props();
let { fields } = sectionProps;
</script>

<div
  class="gradient-loading basis-2/3 overflow-hidden rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-800 p-0 min-h-24">
  <Header {...sectionProps} />
  {#if !adminCtx.appCtx.isInitialised}{:else}
    {#each Object.entries(fields) as [fieldRoot, field]: [Field, FormFieldExtendedDefinition]}
      <LayerPropertyField
        fieldRoot={fieldRoot as Field}
        field={field as unknown as FormFieldExtendedDefinition}
        fieldIndex={0}
        fieldKey="value"
        fieldDiscriminator={sectionProps.fieldDiscriminator!}
        {...sectionProps} />
    {/each}
  {/if}
</div>
