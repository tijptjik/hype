<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// COMPONENTS
import Labels from '$lib/components/forms/labels/Input.svelte'
// TYPES
import type { InputProps } from '$lib/types'

// STATE
let {
  value = $bindable(),
  isGenAI = $bindable(),
  id,
  locale = 'core',
  placeholder,
  isTranslated = false,
  inputType = 'text',
  onchange,
  onToggleGenAI,
}: InputProps & {
  onchange: (value: string) => unknown
  onToggleGenAI: (e: MouseEvent) => void
} = $props()

// SET PLACEHOLDER
placeholder = placeholder
  ? placeholder
  : inputType === 'text'
    ? m.suave_livid_wombat_zoom()
    : m.muddy_each_herring_boil()
</script>

<input
  {id}
  data-testid={id}
  type={inputType}
  name={id}
  bind:value
  {placeholder}
  class="h-12 w-full truncate rounded-md bg-transparent p-2 caret-white selection:bg-primary/70 selection:text-base-content focus:border-none focus:outline-none focus:ring-0 active:border-none active:outline-none group-focus-within:pr-0 {value ==
  ''
    ? 'italic placeholder:text-base-content/70'
    : 'text-bold text-base-content'} {inputType !== 'number'
    ? 'pr-10'
    : inputType == 'number'
      ? 'pl-3 pr-1 group-focus-within:pr-1'
      : ''}"
  oninput={(e) => onchange((e.target as HTMLInputElement).value)}
>

{#if (isGenAI || locale !== 'core') && isTranslated}
  <div class="absolute right-2 top-[12px]"><Labels {isGenAI} {onToggleGenAI} /></div>
{/if}

<style>
input[type="number"]::-webkit-inner-spin-button,
input[type="number"]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

input[type="number"] {
  -moz-appearance: textfield;
  appearance: textfield;
  margin: 0;
}
</style>
