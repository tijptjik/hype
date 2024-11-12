<script lang="ts">
import Labels from './FormInputLabels.svelte';
// TYPES
import type { InputConstraints, InputConstraint } from 'sveltekit-superforms';

// PROPS
type Props = {
  id: string;
  value: string;
  values: string[] | { value: string; id: string }[];
  languageTag: string;
  isComplex?: boolean;
};

// STATE
let { id, value = $bindable(), values, languageTag = 'core', isComplex = false }: Props = $props();
</script>

<select
  {id}
  name={id}
  class="select w-full rounded-md border-none bg-neutral p-2 px-4 outline-none focus-within:border-none focus-within:outline-none focus:border-none focus:outline-none"
  bind:value>
  {#if isComplex}
    {#each values as optionValue}
      <option value={optionValue.id} class="m-12">{optionValue.value}</option>
    {/each}
  {:else}
    {#each values as optionValue}
      <option value={optionValue}>{optionValue}</option>
    {/each}
  {/if}
</select>
