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
placeholder = placeholder ? placeholder : inputType === 'text' ? 'Type here' : 'Set number';
</script>

<input
  {id}
  data-testid={id}
  type={inputType}
  name={id}
  bind:value
  {placeholder}
  class="w-full rounded-md bg-neutral p-2 focus:border-none focus:outline-none"
  oninput={onchange}
/>

{#if (isGenAI || languageTag !== 'core') && isTranslated}
  <Labels {isGenAI} {languageTag} />
{/if}
