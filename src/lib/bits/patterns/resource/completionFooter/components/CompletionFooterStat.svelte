<script lang="ts">
// BITS
import { SimpleMeter, SimpleTooltip } from '$lib/bits'
// TYPES
import type { CompletionFooterStatProps } from '../completionFooter.types'

let {
  icon,
  title,
  tooltip,
  percentage,
}: CompletionFooterStatProps = $props()
</script>

<SimpleTooltip disabled={!tooltip} triggerClass="bits-tooltip__trigger--block">
  {#snippet trigger()}
    <div class="bits-completion-footer__stat">
      {#if icon}
        {@const IconComponent = icon}
        <IconComponent class="bits-completion-footer__icon" />
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
      <span class="bits-completion-footer__value">{Math.round(percentage)}%</span>
    </div>
  {/snippet}
  {tooltip}
</SimpleTooltip>
