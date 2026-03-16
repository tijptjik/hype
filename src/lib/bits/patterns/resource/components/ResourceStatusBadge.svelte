<script lang="ts">
import { SimpleTooltip } from '$lib/bits/core/tooltip'
import type { ResourceStatusBadgeProps } from './resourceStatusBadge.types'

let {
  label,
  tone = 'neutral',
  tooltipText = null,
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
  triggerClass="bits-resource-status-badge__trigger"
  contentClass="bits-resource-status-badge__tooltip"
>
  {#snippet trigger()}
    <span class={badgeClasses}>{label}</span>
  {/snippet}

  {#snippet children()}
    <span>{tooltipText}</span>
  {/snippet}
</SimpleTooltip>
