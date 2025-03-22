<script lang="ts">
import Labels from '$lib/components/forms/labels/Input.svelte';
// TYPES
import type { InputProps } from '$lib/types';

// STATE
let {
  value = $bindable(),
  isGenAI = $bindable(),
  id,
  languageTag = 'core',
  placeholder,
  isTranslated = false,
  inputType = 'text',
  onchange
}: InputProps & { onchange: () => unknown } = $props();

// SET PLACEHOLDER
placeholder = placeholder
  ? placeholder
  : inputType === 'text'
    ? 'Type here'
    : 'Set number';

function getLabelCount() {
  let count = 0;
  if (isGenAI) count += 1;
  if (languageTag !== 'core') count += 1;
  return count;
}
</script>

<input
  {id}
  data-testid={id}
  type={inputType}
  name={id}
  bind:value
  {placeholder}
  class="w-full truncate rounded-md bg-neutral p-2 focus:border-none focus:outline-none focus:ring-0 group-focus-within:pr-0"
  class:padOne={getLabelCount() === 1}
  class:padTwo={getLabelCount() === 2}
  oninput={onchange} />

{#if (isGenAI || languageTag !== 'core') && isTranslated}
  <div class="absolute right-2 top-[7px]">
    <Labels {isGenAI} {languageTag} />
  </div>
{/if}

<style>
.padOne {
  @apply pr-10;
}
.padTwo {
  @apply pr-20;
}
</style>
