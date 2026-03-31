<script lang="ts">
// BITS
import SimpleTooltip from '$lib/bits/core/tooltip/SimpleTooltip.svelte'
import { cx } from '$lib/bits/utils'
// ICONS
import InfoIcon from 'virtual:icons/lucide/info'
// TYPES
import type { AnalyticsCardSectionHeaderProps } from '../analyticsCard.types'

let {
  title,
  tooltip = '',
  class: className = '',
}: AnalyticsCardSectionHeaderProps = $props()
</script>

<div class={cx('flex items-center gap-2', className)}>
  <h3 class="text-sm font-semibold uppercase tracking-[0.14em] text-foreground">
    {title}
  </h3>

  <SimpleTooltip disabled={!tooltip}>
    {#snippet trigger()}
      <button
        type="button"
        class="inline-flex h-5 w-5 items-center justify-center rounded-full text-foreground-alt transition hover:text-foreground"
        aria-label={`About ${title}`}
      >
        <InfoIcon class="h-3 w-3" />
      </button>
    {/snippet}
    <span class="block max-w-xs text-sm leading-5">{tooltip}</span>
  </SimpleTooltip>
</div>
