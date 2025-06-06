<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// COMPONENTS
import Labels from '$lib/components/forms/labels/Input.svelte';
// TYPES
import type { InputProps } from '$lib/types';

// STATE
let {
  value = $bindable(),
  isGenAI = $bindable(),
  id,
  locale = 'core',
  placeholder,
  isTranslated = false,
  inputType = 'text',
  onchange
}: InputProps & { onchange: () => unknown } = $props();

// SET PLACEHOLDER
placeholder = placeholder
  ? placeholder
  : inputType === 'text'
    ? m.suave_livid_wombat_zoom()
    : m.muddy_each_herring_boil();

function getLabelCount() {
  let count = 0;
  if (isGenAI) count += 1;
  if (locale !== 'core') count += 1;
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
  class="w-full truncate rounded-md bg-neutral p-2 active:border-none active:outline-none focus:border-none focus:outline-none focus:ring-0 group-focus-within:pr-0 {getLabelCount() === 1 ? 'pr-10' : getLabelCount() === 2 ? 'pr-20' : ''}"
  class:padOne={getLabelCount() === 1}
  class:padTwo={getLabelCount() === 2}
  oninput={onchange} />

{#if (isGenAI || locale !== 'core') && isTranslated}
  <div class="absolute right-2 top-[7px]">
    <Labels {isGenAI} {locale} />
  </div>
{/if}