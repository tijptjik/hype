<script lang="ts">
import { SimpleTooltip } from '$lib/bits/core/tooltip'
import type { ResourceStatusBadgeProps } from './resourceStatusBadge.types'

let {
  label,
  tone = 'neutral',
  tooltipText = null,
  icon = null,
  class: className = '',
}: ResourceStatusBadgeProps = $props()

const badgeClasses = $derived(
  ['bits-resource-status-badge', `bits-resource-status-badge--${tone}`, className]
    .filter(Boolean)
    .join(' '),
)
</script>

<SimpleTooltip
  disabled={!tooltipText}
  triggerProps={{ tabindex: -1 }}
  triggerClass="bits-resource-status-badge__trigger"
  contentClass="bits-resource-status-badge__tooltip"
>
  {#snippet trigger()}
    <span class={badgeClasses}>
      {#if icon}
        {@const StatusIcon = icon}
        <span class="bits-index-card__status-icon" aria-hidden="true">
          <StatusIcon />
        </span>
      {/if}
      {label}
    </span>
  {/snippet}

  {#snippet children()}
    <span>{tooltipText}</span>
  {/snippet}
</SimpleTooltip>
