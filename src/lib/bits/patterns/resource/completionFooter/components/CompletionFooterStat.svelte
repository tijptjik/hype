<script lang="ts">
// BITS
import SimpleMeter from '#lib/bits/core/meter/SimpleMeter.svelte'
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
// TYPES
import type { CompletionFooterStatProps } from '../completionFooter.types'

let { icon, title, tooltip, percentage }: CompletionFooterStatProps = $props()
</script>

<SimpleTooltip disabled={!tooltip} triggerClass="bits-tooltip__trigger--block">
  {#snippet trigger()}
    <div class="bits-completion-footer__stat">
      {#if icon}
        {@const IconComponent = icon}
        <IconComponent class="h-4 w-4 shrink-0" />
      {/if}
      <span class="bits-completion-footer__label">{title}</span>
      <SimpleMeter
        value={percentage}
        max={100}
        label={title}
        valueLabel={`${Math.round(percentage)}%`}
        class="bits-completion-footer__progress"
        indicatorClass="bits-completion-footer__progress-indicator"
      />
      <span class="shrink-0 text-xs leading-4 font-medium whitespace-nowrap"
        >{Math.round(percentage)}%</span
      >
    </div>
  {/snippet}
  {tooltip}
</SimpleTooltip>
