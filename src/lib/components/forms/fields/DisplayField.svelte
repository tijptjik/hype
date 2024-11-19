<script lang="ts">
import type { DisplayFieldProps } from '$lib/types';

let { label, value, justify = 'start' }: DisplayFieldProps = $props();

let displayLabel = $derived(
  label.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())
);
</script>

<div
  class="w-full bg-neutral first-child:rounded-t-xl last-child:rounded-b-xl"
  class:text-right={justify === 'end'}>
  <label class="block text-sm font-light text-base-content/70 px-3 pt-3"
  style="font-variant: all-small-caps;">
    {displayLabel}
  </label>
  <p class="text-base font-normal text-base-content px-3 pb-3">{value ?? '-'}</p>
</div>
