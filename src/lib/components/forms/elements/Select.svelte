<script lang="ts">
import { m } from '$lib/i18n';
// TYPES
import type { SelectProps } from '$lib/types';

// STATE
let {
  id,
  value = $bindable(),
  values = $bindable([]),
  isComplex = false,
  onchange
}: SelectProps & { onchange: (e: Event) => unknown } = $props();
</script>

<select
  {value}
  {id}
  tabindex="0"
  name={id}
  class="text-bold select w-full rounded-md border-none bg-transparent px-3 py-2 text-[1rem] text-lg text-base-content outline-none focus-within:border-none focus-within:outline-none focus:border-none focus:outline-none"
  {onchange}>
  <option value={undefined}>-- {m.great_crazy_squid_promise()} --</option>
  {#if isComplex && values.length > 0}
    {#each values as complexValue (typeof complexValue === 'object' ? complexValue.id : complexValue)}
      {#if typeof complexValue === 'object'}
        <option value={complexValue.id} class="m-12">{complexValue.value}</option>
      {/if}
    {/each}
  {:else}
    {#each values as optionValue}
      {#if typeof optionValue === 'string'}
        <option value={optionValue}>{optionValue}</option>
      {/if}
    {/each}
  {/if}
</select>
