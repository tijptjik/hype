<script lang="ts">
// BITS COMPONENTS
import { Button, Popover } from '$lib/bits/core'
// ICONS
import CircleHelpIcon from 'virtual:icons/lucide/circle-help'

let { reason }: { reason: string } = $props()
</script>

<Popover
  triggerProps={{ 'aria-label': 'Review reason' }}
  contentProps={{ side: 'bottom', align: 'center', sideOffset: 10 }}
  contentClass="z-50 max-w-sm rounded-2xl border border-white/10 bg-black/95 p-3 text-sm leading-5 text-white shadow-[var(--shadow-popover)]"
>
  {#snippet trigger()}
    <Button
      text="Review reason"
      color="neutral"
      style="ghost"
      modifier="circle"
      class="h-9 w-9 border border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white"
      iconComponent={CircleHelpIcon}
      hideLabel={true}
      attrs={{ title: reason }}
    />
  {/snippet}

  {#snippet children()}
    <p class="max-w-sm text-balance">{reason}</p>
  {/snippet}
</Popover>
