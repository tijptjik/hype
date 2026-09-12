<script lang="ts">
// SVELTE
import type { HTMLAttributes } from 'svelte/elements'

// ASSETS
import toastieUrl from './breadlineToastLoader.svg?url'

let {
  class: className,
  'aria-label': label = 'Loading',
  ...restProps
}: HTMLAttributes<HTMLDivElement> = $props()
</script>

<div
  {...restProps}
  class={['bits-load-screen__breadline h-32 w-40', className]}
  role="status"
  aria-label={label}
>
  <!-- Toastie crouches, jumps and lands on each cycle; reduced motion keeps him still. -->
  <img
    src={toastieUrl}
    class="block h-full w-full object-contain"
    width="240"
    height="260"
    alt=""
    aria-hidden="true"
  >
</div>

<style>
.bits-load-screen__breadline {
  display: none;
}

:global(html[data-theme^="breadline-"]) .bits-load-screen__breadline {
  display: block;
}
</style>
