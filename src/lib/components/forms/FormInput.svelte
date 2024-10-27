<script lang="ts">
import FormInputLabels from './FormInputLabels.svelte';
let { id, value = $bindable(), constraints, isGenAI, languageTag } = $props();
</script>

<input
  {id}
  type="text"
  name={id}
  bind:value
  {...constraints}
  placeholder="Type here"
  class="w-full rounded-md bg-neutral p-2 focus:border-none focus:outline-none" />
{#if isGenAI || languageTag !== 'core'}
  <FormInputLabels {isGenAI} {languageTag} />
{/if}
