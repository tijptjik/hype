<script lang="ts">
// BITS COMPONENTS
import Button from '#lib/bits/core/button/Button.svelte'
// ICONS
import XMark from 'virtual:icons/proicons/cancel'
import { fade } from 'svelte/transition'

let { text, active, onReset }: { text: string; active: boolean; onReset: () => void } =
  $props()
</script>

<!-- TODO : Move to the bottom of the panel as an absolute bottom element -->
{#if active}
  <div class="absolute bottom-4 z-10 h-auto w-full px-4 pb-2">
    <Button
      {text}
      iconComponent={XMark}
      iconClasses="h-4 w-4 shrink-0"
      color="dark"
      style="ghost"
      modifier="block"
      class="h-auto justify-start rounded-lg border-3 border-base-300 bg-panel px-4 py-4 font-mono font-normal hover:text-base-content"
      labelClasses="min-w-0 flex-1 max-w-none overflow-hidden text-ellipsis whitespace-nowrap text-left leading-tight"
      onClick={onReset}
      transition={fade}
      transitionOpts={{ duration: 200 }}
    />
  </div>
{/if}
