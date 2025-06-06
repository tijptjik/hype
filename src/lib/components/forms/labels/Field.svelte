<script lang="ts">
import type { Field } from '$lib/types';

type Props = {
  field: Field;
  fieldRoot: string;
  fieldIndex: number;
  fieldKey: string;
  constraints: Record<string, any>;
};

let { field, fieldRoot, fieldIndex, fieldKey, constraints }: Props = $props();
</script>

<div class="label text-sm {!field.label ? 'hidden' : ''}">
  <span class="label-text text-xs font-bold">{field.label}</span>
  <span class="label-text-alt text-xs font-bold">
    {#if field.isNested}
      {$constraints?.[fieldRoot]?.[fieldIndex]?.[fieldKey]?.required ? '*' : ''}
    {:else}
      {$constraints?.[fieldRoot]?.required ? '*' : ''}
    {/if}
  </span>
</div>
