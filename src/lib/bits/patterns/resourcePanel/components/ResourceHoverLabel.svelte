<script lang="ts">
// SVELTE
import { cubicOut } from 'svelte/easing'
import { fly } from 'svelte/transition'
// THIRD-PARTY
import Portal from 'svelte-portal'

let {
  label,
}: {
  label: { name: string; left: number; top: number } | null
} = $props()
</script>

{#if label}
  <Portal target="body">
    <div
      class="bits-theme pointer-events-none fixed z-50 transition-[top,left] duration-160 ease-out motion-reduce:transition-none"
      style:left={`${label.left}px`}
      style:top={`${label.top}px`}
      aria-hidden="true"
      data-resource-hover-label
    >
      <div class="-translate-y-1/2">
        <div
          class="max-w-[min(28rem,70vw)] truncate rounded-r-md bg-panel px-3 py-2 text-sm text-base-content shadow-lg"
          transition:fly={{ x: -10, duration: 160, easing: cubicOut }}
        >
          {label.name}
        </div>
      </div>
    </div>
  </Portal>
{/if}
