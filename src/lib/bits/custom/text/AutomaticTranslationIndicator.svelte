<script lang="ts">
// COMPONENTS
import Popover from '#lib/bits/core/popover/Popover.svelte'
// I18N
import { m } from '#lib/i18n.js'
// TYPES
import type { ContentResolution } from '#lib/i18n/automatic.js'

let { resolution }: { resolution: ContentResolution } = $props()
let open = $state(false)
$effect(() => {
  resolution
  open = false
})
</script>

{#if resolution.kind === 'automatic' && resolution.original}
  <Popover
    bind:open
    triggerClass="inline-flex! size-6 shrink-0 cursor-pointer items-center justify-center rounded align-middle focus-visible:outline-2 focus-visible:outline-primary"
    triggerProps={{
      role: 'button',
      tabindex: 0,
      'aria-label': m.translation_show_original(),
      onclick: event => event.stopPropagation(),
    }}
    contentClass="border-border bg-panel z-[100] max-h-[min(60vh,24rem)] max-w-[min(24rem,calc(100vw-2rem))] overflow-auto rounded border p-3 text-sm font-normal whitespace-normal break-words shadow-lg"
  >
    {#snippet trigger()}
      <span aria-hidden="true">🤖</span>
    {/snippet}
    <span lang={resolution.original.locale}>{resolution.original.value}</span>
  </Popover>
{/if}
