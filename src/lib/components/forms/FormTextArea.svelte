<script lang="ts">
import Labels from './FormInputLabels.svelte';

let { id, value = $bindable(), constraints, isGenAI, languageTag } = $props();
</script>

<textarea
  {id}
  name={id}
  bind:value
  {...constraints}
  placeholder="Type here"
  class="textarea w-full bg-neutral pl-4 pr-1 py-2 border-none focus:outline-none"
  rows="4">
</textarea>
<Labels {isGenAI} {languageTag} absolute={true} />
