<script lang="ts">
// BITS COMPONENTS
import { Button, Popover } from '#lib/bits/core/index.js'
// ICONS
import CircleHelpIcon from 'virtual:icons/proicons/question-circle'

let { reason }: { reason: string } = $props()
</script>

<Popover
  triggerProps={{ 'aria-label': 'Review reason' }}
  contentProps={{ side: 'bottom', align: 'center', sideOffset: 10 }}
  contentClass="z-50 max-w-sm rounded-2xl border border-foreground/10 bg-panel/95 p-3 text-sm leading-5 text-foreground shadow-[var(--shadow-popover)]"
>
  {#snippet trigger()}
    <Button
      text="Review reason"
      color="neutral"
      style="ghost"
      modifier="circle"
      class="h-9 w-9 border border-foreground/10 bg-foreground/[0.04] text-foreground/70 hover:bg-foreground/[0.08] hover:text-foreground"
      iconComponent={CircleHelpIcon}
      hideLabel={true}
      attrs={{ title: reason }}
    />
  {/snippet}

  {#snippet children()}
    <p class="max-w-sm text-balance">{reason}</p>
  {/snippet}
</Popover>
