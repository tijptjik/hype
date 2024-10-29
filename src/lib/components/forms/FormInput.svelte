<script lang="ts">
import Labels from './FormInputLabels.svelte';
// TYPES
import type { InputConstraints, InputConstraint } from 'sveltekit-superforms';

// PROPS
type Props = {
  id: string;
  value: string;
  isGenAI?: boolean;
  languageTag?: string;
  inputType?: string;
};

// STATE
let {
  id,
  value = $bindable(),
  isGenAI = false,
  languageTag = 'core',
  inputType = 'text'
}: Props = $props();

</script>

<input
  {id}
  type={inputType}
  name={id}
  bind:value
  placeholder={inputType === 'text' ? 'Type here' : 'Set number'}
  class="w-full rounded-md bg-neutral p-2 focus:border-none focus:outline-none" />
{#if isGenAI || languageTag !== 'core'}
  <Labels {isGenAI} {languageTag} />
{/if}
