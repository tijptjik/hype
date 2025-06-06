<script lang="ts">
import type { DisplayFieldProps } from '$lib/types';

let { label, value, justify = 'start', gridCell = false }: DisplayFieldProps = $props();

let displayLabel = $derived(
  label.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())
);
</script>

<div
  class="first-child:rounded-t-xl last-child:rounded-b-xl w-full bg-neutral"
  class:text-right={justify === 'end'}
  class:grid-cell={gridCell}
  class:rounded-lg={gridCell}>
  <label
    class="block px-3 pt-3 text-sm font-light text-base-content/70"
    style="font-variant: all-small-caps;">
    {displayLabel}
  </label>
  <p class="px-3 pb-3 text-base font-normal text-base-content text-ellipsis overflow-hidden">{value ?? '-'}</p>
</div>
