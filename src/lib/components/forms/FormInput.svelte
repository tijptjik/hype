<script lang="ts">
  import FormFieldLabels from './FormFieldLabels.svelte';
let { id, value = $bindable(), constraints, isGenAI, languageTag } = $props();
</script>

<input
  {id}
  type="text"
  name={id}
  bind:value
  {...constraints}
  placeholder="Type here"
  class="w-full p-2 bg-neutral rounded-md focus:outline-none focus:border-none" />
  {#if isGenAI || languageTag !== 'core'}
    <FormFieldLabels {isGenAI} {languageTag} />
  {/if}
  