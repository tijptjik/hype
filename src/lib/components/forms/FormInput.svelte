<script lang="ts">
import Labels from './FormInputLabels.svelte';

// PROPS
type Props = {
  id: string;
  value: string;
  placeholder?: string;
  isGenAI?: boolean;
  languageTag?: string;
  isTranslated?: boolean;
  inputType?: string;
};

// STATE
let {
  id,
  value = $bindable(),
  placeholder,
  isGenAI = false,
  languageTag = 'core',
  isTranslated = false,
  inputType = 'text'
}: Props = $props();

// SET PLACEHOLDER
placeholder = placeholder ? placeholder : inputType === 'text' ? 'Type here' : 'Set number';

</script>
<input
  {id}
  type={inputType}
  name={id}
  bind:value
  {placeholder}
  class="w-full rounded-md bg-neutral p-2 focus:border-none focus:outline-none" />
{#if (isGenAI || languageTag !== 'core') && isTranslated}
  <Labels {isGenAI} {languageTag} />
{/if}
