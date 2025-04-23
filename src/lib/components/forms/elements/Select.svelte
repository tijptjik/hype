<script lang="ts">
import Labels from '../labels/Input.svelte';
// TYPES
import type { SelectProps } from '$lib/types';

// STATE
let {
  value = $bindable(),
  id,
  values,
  isComplex = false,
  onchange
}: SelectProps & { onchange: (e: Event) => unknown } = $props();
</script>

<select
  bind:value
  {id}
  name={id}
  class="select w-full rounded-md border-none bg-neutral p-2 px-4 outline-none focus-within:border-none focus-within:outline-none focus:border-none focus:outline-none"
  {onchange}>
  <option value={undefined}>-- Unset --</option>
  {#if isComplex}
    {#each values as { id, value }}
      <option value={id} class="m-12">{value}</option>
    {/each}
  {:else}
    {#each values as optionValue}
      <option value={optionValue}>{optionValue}</option>
    {/each}
  {/if}
</select>
