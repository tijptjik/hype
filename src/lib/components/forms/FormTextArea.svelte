<script lang="ts">
import Labels from './FormInputLabels.svelte';
import type { InputConstraints } from 'sveltekit-superforms';

// PROPS
type Props = {
  id: string;
  value: string;
  placeholder?: string;
  isGenAI: boolean;
  languageTag: string;
};

let { id, value = $bindable(), placeholder, isGenAI, languageTag }: Props = $props();

// SET PLACEHOLDER
placeholder = placeholder ? placeholder : 'Type here';
</script>

<textarea
  {id}
  name={id}
  bind:value
  {placeholder}
  class="textarea w-full border-none bg-neutral py-2 pl-4 pr-1 focus:outline-none"
  rows="4">
</textarea>
<Labels {isGenAI} {languageTag} absolute={true} />
